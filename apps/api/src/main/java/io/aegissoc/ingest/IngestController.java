package io.aegissoc.ingest;

import com.fasterxml.jackson.databind.JsonNode;
import io.aegissoc.audit.AuditService;
import io.aegissoc.auth.Actor;
import io.aegissoc.common.ApiException;
import io.aegissoc.common.Json;
import io.aegissoc.config.AegisProperties;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.*;

@RestController
@RequestMapping("/api")
public class IngestController {
    private final JdbcClient jdbc;
    private final IngestService ingest;
    private final AuditService audit;
    private final AegisProperties props;

    public IngestController(JdbcClient jdbc, IngestService ingest, AuditService audit, AegisProperties props) {
        this.jdbc = jdbc; this.ingest = ingest; this.audit = audit; this.props = props;
    }

    // ------------------------------------------------------------ lab scenarios
    @GetMapping("/lab/scenarios")
    public List<Map<String, Object>> scenarios() { return Fixtures.CATALOG.stream().map(Fixtures::describe).toList(); }

    public record ScenarioRun(Long seed, String anchor, String mode, Boolean repair, Integer paceMillis) {}

    @PostMapping("/lab/scenarios/{id}/run")
    @PreAuthorize("hasRole('ANALYST')")
    public Map<String, Object> runScenario(@PathVariable String id, @RequestBody(required = false) ScenarioRun body) {
        if (Fixtures.CATALOG.stream().noneMatch(m -> m.id().equals(id))) throw ApiException.notFound("Scenario");
        ScenarioRun r = body == null ? new ScenarioRun(null, null, null, null, null) : body;
        long seed = r.seed() == null ? 42L : r.seed();
        Instant anchor;
        try { anchor = r.anchor() == null ? Fixtures.defaultAnchor(Instant.now()) : Instant.parse(r.anchor()); }
        catch (DateTimeParseException e) { throw ApiException.bad("anchor must be an ISO-8601 instant"); }
        boolean paced = "paced".equalsIgnoreCase(r.mode());
        int pace = paced ? Math.max(50, Math.min(r.paceMillis() == null ? 250 : r.paceMillis(), 1000)) : 0;
        Fixtures.Scenario sc = Fixtures.generate(id, seed, anchor, Boolean.TRUE.equals(r.repair()));
        long sourceId = fixtureSourceId();
        // The failure drill reuses the fixture source so Journey 4 can show a source going FAILED then recovering.
        List<JsonNode> payloads = new ArrayList<>(sc.events());
        return ingest.run(new IngestService.Request(sourceId, id + (Boolean.TRUE.equals(r.repair()) ? ":repaired" : ""), seed, payloads, true, Actor.name(), pace));
    }

    @PostMapping("/ingestion/runs/{id}/cancel")
    @PreAuthorize("hasRole('ANALYST')")
    public Map<String, Object> cancel(@PathVariable long id) {
        ingest.cancel(id);
        audit.record(Actor.name(), "ingest.cancel", "ingestion_run", id, Map.of());
        return Map.of("cancelRequested", true);
    }

    // ------------------------------------------------------------ JSON API ingest
    @PostMapping(value = "/ingest/events", consumes = "application/json")
    @PreAuthorize("hasRole('ANALYST')")
    public Map<String, Object> ingestEvents(@RequestBody String body, @RequestParam(defaultValue = "false") boolean synthetic) {
        checkSize(body.length());
        List<JsonNode> events = IngestService.parsePayloads(body, props.ingest().maxBatchEvents());
        if (events.isEmpty()) throw ApiException.bad("No events supplied");
        return ingest.run(new IngestService.Request(sourceByType("json_ingest"), "json_ingest", null, events, synthetic, Actor.name(), 0));
    }

    @PostMapping(value = "/ingest/suricata", consumes = "multipart/form-data")
    @PreAuthorize("hasRole('ANALYST')")
    public Map<String, Object> ingestEve(@RequestParam("file") MultipartFile file, @RequestParam(defaultValue = "true") boolean synthetic) throws IOException {
        checkSize(file.getSize());
        String name = Objects.requireNonNullElse(file.getOriginalFilename(), "upload");
        if (!(name.endsWith(".json") || name.endsWith(".jsonl") || name.endsWith(".ndjson") || name.endsWith(".log")))
            throw ApiException.bad("Only .json, .jsonl, .ndjson or .log EVE exports are accepted");
        String body = new String(file.getBytes(), StandardCharsets.UTF_8);
        List<JsonNode> events = IngestService.parsePayloads(body, props.ingest().maxBatchEvents());
        if (events.isEmpty()) throw ApiException.bad("File contained no events");
        // Non-EVE shapes are rejected row-by-row by the normalizer; EVE lines lacking event_type are flagged here.
        List<JsonNode> tagged = new ArrayList<>();
        for (JsonNode e : events) {
            if (e.isObject() && !e.has("format") && !e.has("__unparseable_line")) ((com.fasterxml.jackson.databind.node.ObjectNode) e).put("format", "suricata_eve");
            tagged.add(e);
        }
        return ingest.run(new IngestService.Request(sourceByType("suricata_eve"), "eve_upload:" + sanitize(name), null, tagged, synthetic, Actor.name(), 0));
    }

    // ------------------------------------------------------------ runs
    @GetMapping("/ingestion/runs")
    public List<Map<String, Object>> runs(@RequestParam(defaultValue = "25") int limit) {
        return jdbc.sql("""
                SELECT r.id, s.name AS "sourceName", r.scenario, r.status, r.started_at AS "startedAt", r.finished_at AS "finishedAt",
                       r.events_received AS "eventsReceived", r.events_accepted AS "eventsAccepted", r.events_duplicate AS "eventsDuplicate",
                       r.events_rejected AS "eventsRejected", r.alerts_created AS "alertsCreated", r.synthetic, r.error_summary AS "errorSummary"
                FROM ingestion_runs r JOIN data_sources s ON s.id = r.source_id ORDER BY r.id DESC LIMIT :n""")
                .param("n", Math.min(Math.max(limit, 1), 100)).query().listOfRows();
    }

    @GetMapping("/ingestion/runs/{id}")
    public Map<String, Object> run(@PathVariable long id) {
        Map<String, Object> m = ingest.runSummary(id);
        m.put("errors", jdbc.sql("SELECT row_no AS \"rowNo\", message FROM ingestion_errors WHERE run_id = :r ORDER BY row_no LIMIT 200").param("r", id).query().listOfRows());
        return m;
    }

    // ------------------------------------------------------------ helpers
    private long fixtureSourceId() { return sourceByType("fixture"); }

    private long sourceByType(String type) {
        return jdbc.sql("SELECT id FROM data_sources WHERE source_type = :t ORDER BY id LIMIT 1").param("t", type).query(Long.class).optional()
                .orElseThrow(() -> ApiException.conflict("SOURCE_MISSING", "No '" + type + "' source is registered"));
    }

    private void checkSize(long bytes) {
        if (bytes > props.ingest().maxUploadBytes())
            throw new ApiException(org.springframework.http.HttpStatus.PAYLOAD_TOO_LARGE, "PAYLOAD_TOO_LARGE", "Input exceeds " + props.ingest().maxUploadBytes() + " bytes");
    }

    private static String sanitize(String s) { return s.replaceAll("[^A-Za-z0-9._-]", "_"); }
}
