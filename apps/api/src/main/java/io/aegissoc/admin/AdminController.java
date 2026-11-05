package io.aegissoc.admin;

import io.aegissoc.audit.AuditService;
import io.aegissoc.auth.Actor;
import io.aegissoc.common.ApiException;
import io.aegissoc.config.AegisProperties;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.lang.management.ManagementFactory;
import java.util.*;

@RestController
@RequestMapping("/api")
public class AdminController {
    private final JdbcClient jdbc;
    private final AuditService audit;
    private final AegisProperties props;

    public AdminController(JdbcClient jdbc, AuditService audit, AegisProperties props) { this.jdbc = jdbc; this.audit = audit; this.props = props; }

    // ---------------------------------------------------------------- notifications
    @GetMapping("/notifications")
    public Map<String, Object> notifications(@RequestParam(defaultValue = "false") boolean unreadOnly) {
        List<Map<String, Object>> items = jdbc.sql("""
                SELECT id, kind, title, body, link, created_at AS "createdAt", read_at AS "readAt" FROM notifications
                WHERE (recipient IS NULL OR recipient = :u) """ + (unreadOnly ? " AND read_at IS NULL " : "") + " ORDER BY id DESC LIMIT 50").param("u", Actor.name()).query().listOfRows();
        long unread = jdbc.sql("SELECT count(*) FROM notifications WHERE (recipient IS NULL OR recipient = :u) AND read_at IS NULL").param("u", Actor.name()).query(Long.class).single();
        return Map.of("items", items, "unread", unread, "delivery", "In-app only. No email, Slack or webhook delivery is configured, so none is attempted.");
    }

    @PostMapping("/notifications/{id}/read")
    public Map<String, Object> read(@PathVariable long id) {
        jdbc.sql("UPDATE notifications SET read_at = now() WHERE id = :id AND (recipient IS NULL OR recipient = :u)").param("id", id).param("u", Actor.name()).update();
        return Map.of("read", id);
    }

    @PostMapping("/notifications/read-all")
    public Map<String, Object> readAll() {
        int n = jdbc.sql("UPDATE notifications SET read_at = now() WHERE read_at IS NULL AND (recipient IS NULL OR recipient = :u)").param("u", Actor.name()).update();
        return Map.of("marked", n);
    }

    // ---------------------------------------------------------------- audit
    @GetMapping("/audit")
    @PreAuthorize("hasRole('ADMIN')")
    public Map<String, Object> audit(@RequestParam(required = false) String actor, @RequestParam(required = false) String action,
                                     @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "50") int size) {
        size = Math.min(Math.max(size, 1), 200);
        String where = " WHERE (:actor IS NULL OR actor = :actor) AND (:action IS NULL OR action LIKE :action)";
        String act = action == null || action.isBlank() ? null : action.replace("%", "").replace("_", "") + "%";
        long total = jdbc.sql("SELECT count(*) FROM audit_events" + where).param("actor", blank(actor)).param("action", act).query(Long.class).single();
        List<Map<String, Object>> items = jdbc.sql("SELECT id, at, actor, action, object_type AS \"objectType\", object_id AS \"objectId\", detail::text AS detail, hash FROM audit_events" + where + " ORDER BY id DESC LIMIT :l OFFSET :o")
                .param("actor", blank(actor)).param("action", act).param("l", size).param("o", Math.max(page, 0) * size).query().listOfRows();
        return Map.of("items", items, "total", total, "page", page, "size", size);
    }

    @GetMapping("/audit/verify")
    @PreAuthorize("hasRole('ADMIN')")
    public Map<String, Object> verify() { return audit.verifyChain(); }

    private static String blank(String s) { return s == null || s.isBlank() ? null : s; }

    // ---------------------------------------------------------------- system, retention, dev reset
    @GetMapping("/system")
    public Map<String, Object> system() {
        Runtime rt = Runtime.getRuntime();
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("version", "0.1.0");
        m.put("java", System.getProperty("java.version"));
        m.put("uptimeSeconds", ManagementFactory.getRuntimeMXBean().getUptime() / 1000);
        m.put("heapUsedMb", (rt.totalMemory() - rt.freeMemory()) / 1_048_576);
        m.put("heapMaxMb", rt.maxMemory() / 1_048_576);
        m.put("databaseSizeMb", jdbc.sql("SELECT pg_database_size(current_database()) / 1048576").query(Long.class).single());
        m.put("aiProvider", props.ai().provider());
        m.put("liveResponseExecution", props.response().liveExecutionEnabled() ? "ENABLED (flag only: no execution path exists)" : "DISABLED");
        m.put("externalConnectors", "none active");
        m.put("devResetAvailable", props.devResetEnabled());
        return m;
    }

    public record Retention(int days) {}

    /** Deletes aged events that are NOT cited as evidence by any alert or incident. Evidence is never removed. */
    @PostMapping("/admin/retention/run")
    @PreAuthorize("hasRole('ADMIN')")
    @Transactional
    public Map<String, Object> retention(@RequestBody Retention r, @RequestHeader(value = "X-Confirm", required = false) String confirm) {
        if (r.days() < 1 || r.days() > 3650) throw ApiException.bad("days must be between 1 and 3650");
        if (!"DELETE-OLD-EVENTS".equals(confirm)) throw ApiException.bad("Destructive operation: send header X-Confirm: DELETE-OLD-EVENTS");
        int ne = jdbc.sql("""
                DELETE FROM normalized_events n WHERE n.ts < now() - make_interval(days => :d)
                AND NOT EXISTS (SELECT 1 FROM alert_evidence a WHERE a.event_id = n.id) AND NOT EXISTS (SELECT 1 FROM incident_evidence i WHERE i.event_id = n.id)""").param("d", r.days()).update();
        int raw = jdbc.sql("DELETE FROM raw_events r WHERE NOT EXISTS (SELECT 1 FROM normalized_events n WHERE n.raw_event_id = r.id)").update();
        audit.record(Actor.name(), "retention.run", "events", null, Map.of("days", r.days(), "eventsDeleted", ne, "rawDeleted", raw));
        return Map.of("eventsDeleted", ne, "rawEventsDeleted", raw, "note", "Events referenced by alerts or incidents were kept. Assets and counters are not recomputed.");
    }

    /** Wipes telemetry/alert/case DATA only (never users, rules, sources, indicators or the audit log). Dev databases only. */
    @PostMapping("/admin/dev/reset")
    @PreAuthorize("hasRole('ADMIN')")
    @Transactional
    public Map<String, Object> reset(@RequestHeader(value = "X-Confirm", required = false) String confirm) {
        if (!props.devResetEnabled()) throw ApiException.forbidden("Dev reset is disabled in this deployment (AEGIS_DEV_RESET_ENABLED=false)");
        if (!"DELETE-DEV-DATA".equals(confirm)) throw ApiException.bad("Destructive operation: send header X-Confirm: DELETE-DEV-DATA");
        jdbc.sql("""
                TRUNCATE response_approvals, verification_results, response_proposals, ai_analysis_runs, report_exports, hunt_notebooks, hunt_searches,
                         incident_activity, incident_tasks, incident_notes, incident_evidence, incident_alerts, incidents, alert_history, alert_evidence,
                         suppressions, alerts, normalized_events, raw_events, ingestion_errors, ingestion_runs, assets, notifications, rule_test_runs RESTART IDENTITY CASCADE""").update();
        jdbc.sql("UPDATE data_sources SET health = CASE WHEN enabled THEN 'NEVER_INGESTED' ELSE 'DISABLED' END, last_success_at = NULL, last_error = NULL, last_test_at = NULL").update();
        audit.record(Actor.name(), "dev.reset", "database", null, Map.of("scope", "telemetry, alerts, incidents, hunts, response, notifications"));
        return Map.of("reset", true, "preserved", List.of("users", "detection rules and versions", "data sources", "threat indicators", "audit log"));
    }
}
