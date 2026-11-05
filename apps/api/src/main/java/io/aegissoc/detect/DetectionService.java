package io.aegissoc.detect;

import io.aegissoc.common.Json;
import io.aegissoc.ingest.NormalizedEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;

/** Runs all enabled rules over a data set and materializes alerts with evidence links. Idempotent via dedupe keys. */
@Service
public class DetectionService {
    private static final Logger log = LoggerFactory.getLogger(DetectionService.class);
    private static final int LOOKBACK_SECONDS = 3600;

    private final JdbcClient jdbc;
    private final RuleStore rules;
    private final io.aegissoc.ingest.EventRepository events;

    public DetectionService(JdbcClient jdbc, RuleStore rules, io.aegissoc.ingest.EventRepository events) {
        this.jdbc = jdbc; this.rules = rules; this.events = events;
    }

    public List<RuleEngine.Indicator> indicators() {
        return jdbc.sql("SELECT ioc_type, value, classification, confidence, expires_at FROM threat_indicators")
                .query((rs, n) -> new RuleEngine.Indicator(rs.getString(1), rs.getString(2), rs.getString(3), rs.getString(4),
                        rs.getTimestamp(5) == null ? null : rs.getTimestamp(5).toInstant())).list();
    }

    /** Evaluates every enabled rule against one ingestion run (+ a bounded look-back for cross-batch sequences). */
    @Transactional
    public int evaluateRun(long runId, boolean synthetic) {
        List<NormalizedEvent> runEvents = events.byRun(runId);
        if (runEvents.isEmpty()) return 0;
        Instant min = runEvents.stream().map(NormalizedEvent::ts).min(Comparator.naturalOrder()).orElseThrow();
        Instant max = runEvents.stream().map(NormalizedEvent::ts).max(Comparator.naturalOrder()).orElseThrow();
        List<NormalizedEvent> withContext = new ArrayList<>(runEvents);
        withContext.addAll(events.lookback(runId, min.minusSeconds(LOOKBACK_SECONDS), max));
        List<RuleEngine.Indicator> iocs = indicators();
        int created = 0;
        for (RuleStore.LoadedRule rule : rules.loadActive()) {
            List<NormalizedEvent> input = rule.def().type().equals("absence") ? runEvents : withContext;
            for (RuleEngine.Candidate c : RuleEngine.evaluate(rule.def(), input, iocs)) {
                if (createAlert(rule, c, synthetic)) created++;
            }
        }
        log.info("Detection for run {} produced {} new alerts", runId, created);
        return created;
    }

    private boolean createAlert(RuleStore.LoadedRule rule, RuleEngine.Candidate c, boolean synthetic) {
        String dedupe = rule.id() + "|" + c.key() + "|" + c.first().getEpochSecond();
        String severity = c.escalated() && rule.def().severityIfFollowed() != null ? rule.def().severityIfFollowed() : rule.severity();
        String confidence = rule.confidence();
        Map<String, Object> explanation = ExplanationBuilder.build(rule, c, synthetic);
        String host = c.entity().get("host"), user = c.entity().get("username"), ip = c.entity().get("src_ip");

        String status = "NEW";
        String suppressionReason = null;
        Instant suppressedUntil = null;
        // Suppressions never apply to CRITICAL severity (independent critical events must stay visible).
        if (!"CRITICAL".equals(severity)) {
            Optional<Map<String, Object>> sup = jdbc.sql("""
                    SELECT reason, expires_at FROM suppressions
                    WHERE rule_id = :r AND expires_at > now()
                      AND (scope_host IS NULL OR scope_host = :h) AND (scope_user IS NULL OR scope_user = :u) AND (scope_ip IS NULL OR scope_ip = :ip)
                    ORDER BY expires_at DESC LIMIT 1""")
                    .param("r", rule.id()).param("h", host).param("u", user).param("ip", ip).query().listOfRows().stream().findFirst();
            if (sup.isPresent()) {
                status = "SUPPRESSED";
                suppressionReason = (String) sup.get().get("reason");
                suppressedUntil = ((Timestamp) sup.get().get("expires_at")).toInstant();
            }
        }
        String classification = rule.def().hypothesis() ? "INCONCLUSIVE" : "SUSPICIOUS";
        Optional<Long> id = jdbc.sql("""
                INSERT INTO alerts (dedupe_key, rule_id, rule_version, title, severity, confidence, status, classification, entity_host, entity_user, entity_ip,
                                    first_event_at, last_event_at, event_count, explanation, suppressed_until, suppression_reason, synthetic)
                VALUES (:dk, :rid, :rv, :title, :sev, :conf, :st, :cl, :h, :u, :ip, :f, :l, :n, CAST(:ex AS jsonb), :su, :sr, :syn)
                ON CONFLICT (dedupe_key) DO NOTHING RETURNING id""")
                .param("dk", dedupe).param("rid", rule.id()).param("rv", rule.version()).param("title", ExplanationBuilder.title(rule, c))
                .param("sev", severity).param("conf", confidence).param("st", status).param("cl", classification)
                .param("h", host).param("u", user).param("ip", ip)
                .param("f", Timestamp.from(c.first())).param("l", Timestamp.from(c.last())).param("n", c.matched().size() + c.context().size())
                .param("ex", Json.write(explanation))
                .param("su", suppressedUntil == null ? null : Timestamp.from(suppressedUntil)).param("sr", suppressionReason).param("syn", synthetic)
                .query(Long.class).optional();
        if (id.isEmpty()) return false;
        long alertId = id.get();
        for (NormalizedEvent e : c.matched()) insertEvidence(alertId, e.id(), "matched");
        for (NormalizedEvent e : c.context()) insertEvidence(alertId, e.id(), "context");
        jdbc.sql("INSERT INTO alert_history (alert_id, actor, from_status, to_status, note) VALUES (:a, 'system', NULL, :s, :n)")
                .param("a", alertId).param("s", status)
                .param("n", "Created by rule " + rule.id() + " v" + rule.version() + (suppressionReason != null ? " (suppressed: " + suppressionReason + ")" : "")).update();
        if (status.equals("NEW") && (severity.equals("HIGH") || severity.equals("CRITICAL"))) {
            jdbc.sql("""
                    INSERT INTO notifications (recipient, kind, title, body, link, dedupe_key) VALUES (NULL, 'ALERT', :t, :b, :l, :dk)
                    ON CONFLICT (dedupe_key) DO NOTHING""")
                    .param("t", severity + " alert: " + ExplanationBuilder.title(rule, c))
                    .param("b", rule.name() + (synthetic ? " (synthetic data)" : "")).param("l", "/app/alerts/" + alertId).param("dk", "alert-" + alertId).update();
        }
        return true;
    }

    private void insertEvidence(long alertId, Long eventId, String role) {
        jdbc.sql("INSERT INTO alert_evidence (alert_id, event_id, role) VALUES (:a,:e,:r) ON CONFLICT DO NOTHING")
                .param("a", alertId).param("e", eventId).param("r", role).update();
    }
}
