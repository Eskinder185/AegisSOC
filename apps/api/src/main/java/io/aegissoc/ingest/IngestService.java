package io.aegissoc.ingest;

import com.fasterxml.jackson.databind.JsonNode;
import io.aegissoc.audit.AuditService;
import io.aegissoc.common.ApiException;
import io.aegissoc.common.Json;
import io.aegissoc.config.AegisProperties;
import io.aegissoc.detect.DetectionService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.sql.Timestamp;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Bounded, chunked, idempotent ingestion: raw payload kept immutable, normalized copy deduplicated by fingerprint,
 * row-level errors recorded, detection run after commit. A failing run never blocks other API functions.
 */
@Service
public class IngestService {
    private static final Logger log = LoggerFactory.getLogger(IngestService.class);
    private static final int CHUNK = 100;
    /** If this share of rows in a batch is rejected the run is FAILED (parser/feed problem), otherwise PARTIAL. */
    private static final double FAIL_RATIO = 0.25;

    private final JdbcClient jdbc;
    private final EventRepository events;
    private final DetectionService detection;
    private final AuditService audit;
    private final AegisProperties props;
    private final TransactionTemplate tx;
    private final ExecutorService pacedExecutor = new ThreadPoolExecutor(1, 1, 0, TimeUnit.SECONDS, new ArrayBlockingQueue<>(2),
            r -> { Thread t = new Thread(r, "paced-replay"); t.setDaemon(true); return t; }, new ThreadPoolExecutor.AbortPolicy());
    private final Map<Long, AtomicBoolean> cancels = new ConcurrentHashMap<>();

    public IngestService(JdbcClient jdbc, EventRepository events, DetectionService detection, AuditService audit, AegisProperties props, TransactionTemplate tx) {
        this.jdbc = jdbc; this.events = events; this.detection = detection; this.audit = audit; this.props = props; this.tx = tx;
    }

    public record Request(long sourceId, String scenario, Long seed, List<JsonNode> payloads, boolean synthetic, String actor, int paceMillis) {}

    public Map<String, Object> run(Request req) {
        Map<String, Object> src = jdbc.sql("SELECT id, enabled, name FROM data_sources WHERE id = :id").param("id", req.sourceId()).query().listOfRows().stream().findFirst()
                .orElseThrow(() -> ApiException.notFound("Data source"));
        if (!(Boolean) src.get("enabled")) throw ApiException.conflict("SOURCE_DISABLED", "Source '" + src.get("name") + "' is disabled. Enable it first.");
        if (req.payloads().size() > props.ingest().maxBatchEvents())
            throw new ApiException(org.springframework.http.HttpStatus.PAYLOAD_TOO_LARGE, "BATCH_TOO_LARGE", "Batch exceeds " + props.ingest().maxBatchEvents() + " events");
        long runId = jdbc.sql("""
                INSERT INTO ingestion_runs (source_id, scenario, seed, parser_version, synthetic, triggered_by, events_received)
                VALUES (:s, :sc, :seed, :pv, :syn, :by, :n) RETURNING id""")
                .param("s", req.sourceId()).param("sc", req.scenario()).param("seed", req.seed()).param("pv", Normalizer.VERSION)
                .param("syn", req.synthetic()).param("by", req.actor()).param("n", req.payloads().size()).query(Long.class).single();
        audit.record(req.actor(), "ingest.start", "ingestion_run", runId, Map.of("scenario", String.valueOf(req.scenario()), "events", req.payloads().size(), "synthetic", req.synthetic()));
        if (req.paceMillis() > 0) {
            cancels.put(runId, new AtomicBoolean(false));
            try {
                pacedExecutor.submit(() -> { try { process(runId, req); } catch (Exception e) { fail(runId, req.sourceId(), e); } finally { cancels.remove(runId); } });
            } catch (RejectedExecutionException e) {
                cancels.remove(runId);
                fail(runId, req.sourceId(), new IllegalStateException("A paced replay is already queued"));
                throw ApiException.conflict("REPLAY_BUSY", "Another paced replay is running. Wait for it or cancel it.");
            }
        } else {
            try { process(runId, req); } catch (Exception e) { fail(runId, req.sourceId(), e); }
        }
        return runSummary(runId);
    }

    public void cancel(long runId) {
        AtomicBoolean f = cancels.get(runId);
        if (f == null) throw ApiException.conflict("NOT_CANCELLABLE", "Run is not an active paced replay");
        f.set(true);
    }

    private void process(long runId, Request req) throws InterruptedException {
        int accepted = 0, dup = 0, rejected = 0;
        List<JsonNode> all = req.payloads();
        int maxLen = props.ingest().maxFieldLength();
        for (int start = 0; start < all.size(); start += CHUNK) {
            if (cancels.containsKey(runId) && cancels.get(runId).get()) {
                jdbc.sql("UPDATE ingestion_runs SET status='FAILED', finished_at=now(), error_summary='Cancelled by user', events_accepted=:a, events_duplicate=:d, events_rejected=:r WHERE id=:id")
                        .param("a", accepted).param("d", dup).param("r", rejected).param("id", runId).update();
                markSource(req.sourceId(), "FAILED", "Cancelled by user", false);
                return;
            }
            final int from = start;
            int[] counts = tx.execute(st -> {
                int a = 0, d = 0, r = 0;
                for (int i = from; i < Math.min(all.size(), from + CHUNK); i++) {
                    JsonNode payload = all.get(i);
                    try {
                        NormalizedEvent e = Normalizer.parse(payload, req.synthetic(), maxLen);
                        String canonical = Json.canonical(payload);
                        String fp = Json.sha256(req.sourceId() + "|" + canonical);
                        if (events.exists(req.sourceId(), fp)) { d++; continue; }
                        long rawId = events.insertRaw(req.sourceId(), runId, canonical, Json.sha256(canonical), req.synthetic());
                        events.insert(rawId, req.sourceId(), runId, fp, e, Normalizer.VERSION);
                        a++;
                    } catch (Normalizer.ParseException | IllegalArgumentException ex) {
                        r++;
                        jdbc.sql("INSERT INTO ingestion_errors (run_id, row_no, message) VALUES (:r, :n, :m)")
                                .param("r", runId).param("n", i + 1).param("m", truncate(ex.getMessage(), 300)).update();
                    }
                }
                return new int[]{a, d, r};
            });
            accepted += counts[0]; dup += counts[1]; rejected += counts[2];
            jdbc.sql("UPDATE ingestion_runs SET events_accepted=:a, events_duplicate=:d, events_rejected=:r WHERE id=:id")
                    .param("a", accepted).param("d", dup).param("r", rejected).param("id", runId).update();
            if (req.paceMillis() > 0) Thread.sleep(Math.min(req.paceMillis(), 1000));
        }
        refreshAssets(runId);
        int total = all.size();
        String status = rejected == 0 ? "SUCCEEDED" : (total > 0 && (double) rejected / total >= FAIL_RATIO ? "FAILED" : "PARTIAL");
        String summary = rejected == 0 ? null : rejected + " of " + total + " rows rejected - see row-level errors";
        int alerts = accepted > 0 ? detection.evaluateRun(runId, req.synthetic()) : 0;
        jdbc.sql("UPDATE ingestion_runs SET status=:s, finished_at=now(), alerts_created=:al, error_summary=:es WHERE id=:id")
                .param("s", status).param("al", alerts).param("es", summary).param("id", runId).update();
        markSource(req.sourceId(), status.equals("SUCCEEDED") ? "HEALTHY" : status.equals("PARTIAL") ? "DEGRADED" : "FAILED", summary, status.equals("SUCCEEDED") || status.equals("PARTIAL"));
        audit.record(req.actor(), "ingest.finish", "ingestion_run", runId, Map.of("status", status, "accepted", accepted, "duplicates", dup, "rejected", rejected, "alerts", alerts));
        log.info("Run {} {}: accepted={} dup={} rejected={} alerts={}", runId, status, accepted, dup, rejected, alerts);
    }

    private void refreshAssets(long runId) {
        jdbc.sql("""
                INSERT INTO assets (hostname, os, first_seen, last_seen, event_count, synthetic)
                SELECT host, MAX(CASE vendor WHEN 'windows' THEN 'Windows' WHEN 'linux' THEN 'Linux' ELSE NULL END), MIN(ts), MAX(ts), COUNT(*), bool_and(synthetic)
                FROM normalized_events WHERE run_id = :r AND host IS NOT NULL GROUP BY host
                ON CONFLICT (hostname) DO UPDATE SET
                    os = COALESCE(assets.os, EXCLUDED.os),
                    first_seen = LEAST(assets.first_seen, EXCLUDED.first_seen),
                    last_seen = GREATEST(assets.last_seen, EXCLUDED.last_seen),
                    event_count = assets.event_count + EXCLUDED.event_count,
                    synthetic = assets.synthetic AND EXCLUDED.synthetic""")
                .param("r", runId).update();
    }

    private void fail(long runId, long sourceId, Exception e) {
        log.error("Ingestion run {} failed", runId, e);
        jdbc.sql("UPDATE ingestion_runs SET status='FAILED', finished_at=now(), error_summary=:m WHERE id=:id")
                .param("m", truncate("Internal error: " + e.getClass().getSimpleName(), 300)).param("id", runId).update();
        markSource(sourceId, "FAILED", "Ingestion failed with an internal error (run " + runId + ")", false);
    }

    private void markSource(long sourceId, String health, String error, boolean success) {
        jdbc.sql("""
                UPDATE data_sources SET health = :h, last_error = :e, last_test_at = now(),
                       last_success_at = CASE WHEN :ok THEN now() ELSE last_success_at END
                WHERE id = :id""")
                .param("h", health).param("e", health.equals("HEALTHY") ? null : error).param("ok", success).param("id", sourceId).update();
    }

    public Map<String, Object> runSummary(long runId) {
        Map<String, Object> m = jdbc.sql("""
                SELECT r.id, r.source_id AS "sourceId", s.name AS "sourceName", r.scenario, r.seed, r.started_at AS "startedAt", r.finished_at AS "finishedAt",
                       r.status, r.events_received AS "eventsReceived", r.events_accepted AS "eventsAccepted", r.events_duplicate AS "eventsDuplicate",
                       r.events_rejected AS "eventsRejected", r.alerts_created AS "alertsCreated", r.parser_version AS "parserVersion",
                       r.synthetic, r.triggered_by AS "triggeredBy", r.error_summary AS "errorSummary"
                FROM ingestion_runs r JOIN data_sources s ON s.id = r.source_id WHERE r.id = :id""")
                .param("id", runId).query().listOfRows().stream().findFirst().orElseThrow(() -> ApiException.notFound("Run"));
        return new LinkedHashMap<>(m);
    }

    private static String truncate(String s, int n) { return s == null ? "" : s.length() > n ? s.substring(0, n) + "…" : s; }

    /** Bounded NDJSON / JSON-array reader for uploads and API bodies. */
    public static List<JsonNode> parsePayloads(String body, int maxEvents) {
        List<JsonNode> out = new ArrayList<>();
        String trimmed = body.stripLeading();
        try {
            if (trimmed.startsWith("[")) {
                JsonNode arr = Json.SAFE.readTree(trimmed);
                if (arr.size() > maxEvents) throw ApiException.bad("Too many events: limit is " + maxEvents);
                arr.forEach(out::add);
            } else {
                int lineNo = 0;
                for (String line : trimmed.split("\\r?\\n")) {
                    lineNo++;
                    if (line.isBlank()) continue;
                    if (out.size() >= maxEvents) throw ApiException.bad("Too many events: limit is " + maxEvents);
                    try { out.add(Json.SAFE.readTree(line)); }
                    catch (com.fasterxml.jackson.core.JsonProcessingException e) {
                        out.add(Json.MAPPER.createObjectNode().put("__unparseable_line", lineNo).put("__reason", "line " + lineNo + " is not valid JSON"));
                    }
                }
            }
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            throw ApiException.bad("Body is not valid JSON within safety limits (max nesting depth 12): " + truncate(e.getOriginalMessage(), 120));
        }
        return out;
    }

    static Timestamp ts(java.time.Instant i) { return Timestamp.from(i); }
}
