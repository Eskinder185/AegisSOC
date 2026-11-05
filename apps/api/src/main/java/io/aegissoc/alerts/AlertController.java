package io.aegissoc.alerts;

import io.aegissoc.audit.AuditService;
import io.aegissoc.auth.Actor;
import io.aegissoc.common.ApiException;
import io.aegissoc.common.Json;
import io.aegissoc.ingest.EventRepository;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;

@RestController
@RequestMapping("/api")
public class AlertController {
    private final JdbcClient jdbc;
    private final AuditService audit;
    private final EventRepository events;

    public AlertController(JdbcClient jdbc, AuditService audit, EventRepository events) { this.jdbc = jdbc; this.audit = audit; this.events = events; }

    static final String LIST_SQL = """
            SELECT a.id, a.title, a.rule_id AS "ruleId", a.rule_version AS "ruleVersion", r.name AS "ruleName", a.severity, a.confidence, a.status,
                   a.classification, a.resolution, a.entity_host AS "host", a.entity_user AS "username", a.entity_ip AS "ip",
                   a.first_event_at AS "firstEventAt", a.last_event_at AS "lastEventAt", a.event_count AS "eventCount", a.assignee,
                   a.synthetic, a.created_at AS "createdAt", a.suppressed_until AS "suppressedUntil", a.suppression_reason AS "suppressionReason",
                   (a.explanation->>'hypothesis')::boolean AS hypothesis,
                   (SELECT i.incident_id FROM incident_alerts i WHERE i.alert_id = a.id ORDER BY i.incident_id LIMIT 1) AS "incidentId"
            FROM alerts a JOIN detection_rules r ON r.id = a.rule_id""";

    @GetMapping("/alerts")
    public Map<String, Object> list(@RequestParam(required = false) String status, @RequestParam(required = false) String severity,
                                    @RequestParam(required = false) String rule, @RequestParam(required = false) String assignee,
                                    @RequestParam(required = false) String q, @RequestParam(defaultValue = "false") boolean openOnly,
                                    @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "25") int size) {
        size = Math.min(Math.max(size, 1), 100);
        page = Math.max(page, 0);
        StringBuilder where = new StringBuilder(" WHERE 1=1");
        Map<String, Object> p = new HashMap<>();
        if (status != null && !status.isBlank()) { where.append(" AND a.status = ANY(string_to_array(:status, ','))"); p.put("status", status); }
        if (openOnly) where.append(" AND a.status IN ('NEW','ACKNOWLEDGED','INVESTIGATING','ESCALATED')");
        if (severity != null && !severity.isBlank()) { where.append(" AND a.severity = ANY(string_to_array(:severity, ','))"); p.put("severity", severity); }
        if (rule != null && !rule.isBlank()) { where.append(" AND a.rule_id = :rule"); p.put("rule", rule); }
        if (assignee != null && !assignee.isBlank()) {
            if (assignee.equals("unassigned")) where.append(" AND a.assignee IS NULL"); else { where.append(" AND a.assignee = :assignee"); p.put("assignee", assignee); }
        }
        if (q != null && !q.isBlank()) {
            where.append(" AND (a.title ILIKE :q OR a.entity_host ILIKE :q OR a.entity_user ILIKE :q OR a.entity_ip ILIKE :q)");
            p.put("q", "%" + q.replace("%", "").replace("_", "") + "%");
        }
        JdbcClient.StatementSpec count = jdbc.sql("SELECT count(*) FROM alerts a" + where);
        for (var e : p.entrySet()) count = count.param(e.getKey(), e.getValue());
        long total = count.query(Long.class).single();
        JdbcClient.StatementSpec spec = jdbc.sql(LIST_SQL + where + " " + """
                 ORDER BY CASE a.status WHEN 'NEW' THEN 0 WHEN 'ACKNOWLEDGED' THEN 1 WHEN 'INVESTIGATING' THEN 1 WHEN 'ESCALATED' THEN 1 ELSE 2 END,
                          CASE a.severity WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END, a.last_event_at DESC, a.id DESC
                 LIMIT :lim OFFSET :off""");
        for (var e : p.entrySet()) spec = spec.param(e.getKey(), e.getValue());
        List<Map<String, Object>> items = spec.param("lim", size).param("off", page * size).query().listOfRows();
        return Map.of("items", items, "total", total, "page", page, "size", size);
    }

    @GetMapping("/alerts/{id}")
    public Map<String, Object> get(@PathVariable long id) {
        Map<String, Object> a = new LinkedHashMap<>(jdbc.sql(LIST_SQL + " WHERE a.id = :id").param("id", id).query().listOfRows().stream().findFirst()
                .orElseThrow(() -> ApiException.notFound("Alert")));
        a.put("explanation", Json.read(jdbc.sql("SELECT explanation::text FROM alerts WHERE id = :id").param("id", id).query(String.class).single()));
        a.put("evidence", jdbc.sql("""
                SELECT n.id, n.ts, n.event_class AS "eventClass", n.action, n.outcome, n.severity, n.host, n.username, n.src_ip AS "srcIp", n.dst_ip AS "dstIp",
                       n.dst_port AS "dstPort", n.domain, n.process_name AS "processName", n.process_cmdline AS "processCmdline", n.parent_process AS "parentProcess",
                       n.message, n.vendor, n.synthetic, e.role
                FROM alert_evidence e JOIN normalized_events n ON n.id = e.event_id WHERE e.alert_id = :id ORDER BY n.ts, n.id""").param("id", id).query().listOfRows());
        a.put("history", jdbc.sql("SELECT at, actor, from_status AS \"fromStatus\", to_status AS \"toStatus\", note FROM alert_history WHERE alert_id = :id ORDER BY id").param("id", id).query().listOfRows());
        a.put("related", jdbc.sql("""
                SELECT a2.id, a2.title, a2.severity, a2.status, a2.rule_id AS "ruleId" FROM alerts a2 JOIN alerts a ON a.id = :id
                WHERE a2.id <> a.id AND ((a.entity_host IS NOT NULL AND a2.entity_host = a.entity_host) OR (a.entity_user IS NOT NULL AND a2.entity_user = a.entity_user)
                      OR (a.entity_ip IS NOT NULL AND a2.entity_ip = a.entity_ip))
                  AND a2.first_event_at BETWEEN a.first_event_at - interval '24 hours' AND a.last_event_at + interval '24 hours'
                ORDER BY a2.first_event_at LIMIT 10""").param("id", id).query().listOfRows());
        a.put("incidents", jdbc.sql("SELECT i.id, i.title, i.status FROM incident_alerts l JOIN incidents i ON i.id = l.incident_id WHERE l.alert_id = :id").param("id", id).query().listOfRows());
        return a;
    }

    public record Transition(@NotBlank String to, @Size(max = 1000) String note, String resolution, Integer suppressHours) {}

    @PostMapping("/alerts/{id}/transition")
    @PreAuthorize("hasRole('ANALYST')")
    @Transactional
    public Map<String, Object> transition(@PathVariable long id, @Valid @RequestBody Transition t) {
        Map<String, Object> a = lock(id);
        applyTransition(id, a, t, Actor.name());
        return get(id);
    }

    private void applyTransition(long id, Map<String, Object> a, Transition t, String actor) {
        String from = (String) a.get("status");
        String to = t.to();
        if (!AlertWorkflow.ALLOWED.containsKey(to) || !AlertWorkflow.canMove(from, to))
            throw ApiException.conflict("ILLEGAL_TRANSITION", "Alert cannot move from " + from + " to " + to);
        String resolution = null, classification = (String) a.get("classification");
        Timestamp until = null;
        String reason = null;
        if (to.equals("CLOSED")) {
            if (t.resolution() == null || !AlertWorkflow.RESOLUTIONS.contains(t.resolution()))
                throw ApiException.bad("Closing requires a resolution: " + AlertWorkflow.RESOLUTIONS);
            if (t.note() == null || t.note().isBlank()) throw ApiException.bad("Closing requires a note explaining the decision");
            resolution = t.resolution();
            classification = AlertWorkflow.classificationFor(resolution);
        }
        if (to.equals("SUPPRESSED")) {
            if (AlertWorkflow.severityRank((String) a.get("severity")) >= 4) throw ApiException.forbidden("CRITICAL alerts cannot be suppressed");
            if (t.note() == null || t.note().isBlank()) throw ApiException.bad("Suppression requires a reason");
            int hours = t.suppressHours() == null ? 24 : t.suppressHours();
            if (hours < 1 || hours > 720) throw ApiException.bad("Suppression expiry must be between 1 and 720 hours");
            until = Timestamp.from(Instant.now().plus(hours, ChronoUnit.HOURS));
            reason = t.note();
        }
        if (from.equals("CLOSED") && (t.note() == null || t.note().isBlank())) throw ApiException.bad("Reopening requires a reason");
        jdbc.sql("""
                UPDATE alerts SET status = :to, resolution = :res, classification = :cl, suppressed_until = :su, suppression_reason = :sr,
                       assignee = CASE WHEN :to IN ('ACKNOWLEDGED','INVESTIGATING') AND assignee IS NULL THEN :actor ELSE assignee END, updated_at = now()
                WHERE id = :id""")
                .param("to", to).param("res", resolution).param("cl", classification).param("su", until).param("sr", reason).param("actor", actor).param("id", id).update();
        jdbc.sql("INSERT INTO alert_history (alert_id, actor, from_status, to_status, note) VALUES (:a,:actor,:f,:t,:n)")
                .param("a", id).param("actor", actor).param("f", from).param("t", to)
                .param("n", (resolution != null ? "[" + resolution + "] " : "") + (t.note() == null ? "" : t.note())).update();
        audit.record(actor, "alert.transition", "alert", id, Map.of("from", from, "to", to, "resolution", String.valueOf(resolution)));
    }

    public record Assign(@Size(max = 64) String assignee) {}

    @PostMapping("/alerts/{id}/assign")
    @PreAuthorize("hasRole('ANALYST')")
    public Map<String, Object> assign(@PathVariable long id, @RequestBody Assign b) {
        lock(id);
        if (b.assignee() != null && !b.assignee().isBlank()) {
            long n = jdbc.sql("SELECT count(*) FROM users WHERE username = :u AND enabled").param("u", b.assignee()).query(Long.class).single();
            if (n == 0) throw ApiException.bad("Unknown or disabled user");
        }
        String who = b.assignee() == null || b.assignee().isBlank() ? null : b.assignee();
        jdbc.sql("UPDATE alerts SET assignee = :a, updated_at = now() WHERE id = :id").param("a", who).param("id", id).update();
        jdbc.sql("INSERT INTO alert_history (alert_id, actor, note) VALUES (:id,:actor,:n)").param("id", id).param("actor", Actor.name())
                .param("n", who == null ? "Unassigned" : "Assigned to " + who).update();
        audit.record(Actor.name(), "alert.assign", "alert", id, Map.of("assignee", String.valueOf(who)));
        return get(id);
    }

    public record Comment(@NotBlank @Size(max = 2000) String note) {}

    @PostMapping("/alerts/{id}/comments")
    @PreAuthorize("hasRole('ANALYST')")
    public Map<String, Object> comment(@PathVariable long id, @Valid @RequestBody Comment c) {
        lock(id);
        jdbc.sql("INSERT INTO alert_history (alert_id, actor, note) VALUES (:id,:actor,:n)").param("id", id).param("actor", Actor.name()).param("n", c.note()).update();
        audit.record(Actor.name(), "alert.comment", "alert", id, Map.of());
        return get(id);
    }

    public record Bulk(@NotEmpty @Size(max = 50) List<Long> ids, @NotBlank String action, String assignee, String resolution, @Size(max = 1000) String note) {}

    /** Bulk safeguards: max 50, ACK/assign for analysts, closing only LOW/MEDIUM unless the caller is an incident lead. */
    @PostMapping("/alerts/bulk")
    @PreAuthorize("hasRole('ANALYST')")
    @Transactional
    public Map<String, Object> bulk(@Valid @RequestBody Bulk b, Authentication auth) {
        boolean lead = auth.getAuthorities().stream().anyMatch(g -> g.getAuthority().equals("ROLE_INCIDENT_LEAD") || g.getAuthority().equals("ROLE_ADMIN"));
        int ok = 0;
        List<Map<String, Object>> skipped = new ArrayList<>();
        for (long id : b.ids()) {
            Map<String, Object> a;
            try { a = lock(id); } catch (ApiException e) { skipped.add(Map.of("id", id, "reason", e.getMessage())); continue; }
            try {
                switch (b.action()) {
                    case "acknowledge" -> applyTransition(id, a, new Transition("ACKNOWLEDGED", b.note(), null, null), Actor.name());
                    case "close" -> {
                        if (AlertWorkflow.severityRank((String) a.get("severity")) >= 3 && !lead)
                            throw ApiException.forbidden("Closing HIGH/CRITICAL alerts in bulk needs an incident lead");
                        applyTransition(id, a, new Transition("CLOSED", b.note(), b.resolution(), null), Actor.name());
                    }
                    case "assign" -> {
                        jdbc.sql("UPDATE alerts SET assignee = :a WHERE id = :id").param("a", b.assignee()).param("id", id).update();
                        jdbc.sql("INSERT INTO alert_history (alert_id, actor, note) VALUES (:id,:actor,:n)").param("id", id).param("actor", Actor.name()).param("n", "Assigned to " + b.assignee() + " (bulk)").update();
                    }
                    default -> throw ApiException.bad("Unsupported bulk action");
                }
                ok++;
            } catch (ApiException e) { skipped.add(Map.of("id", id, "reason", e.getMessage())); }
        }
        audit.record(Actor.name(), "alert.bulk", "alert", null, Map.of("action", b.action(), "count", ok, "skipped", skipped.size()));
        return Map.of("updated", ok, "skipped", skipped);
    }

    // ---------------------------------------------------------------- suppression rules (scoped, expiring)
    public record SuppressionBody(@NotBlank String ruleId, String host, String username, String ip, @NotBlank @Size(max = 400) String reason, Integer hours) {}

    @PostMapping("/suppressions")
    @PreAuthorize("hasRole('DETECTION_ENGINEER')")
    public Map<String, Object> suppress(@Valid @RequestBody SuppressionBody b) {
        if (b.host() == null && b.username() == null && b.ip() == null) throw ApiException.bad("A suppression needs a scope (host, user or IP): rule-wide suppression is not allowed");
        int hours = b.hours() == null ? 24 : b.hours();
        if (hours < 1 || hours > 720) throw ApiException.bad("Expiry must be between 1 and 720 hours");
        long id = jdbc.sql("""
                INSERT INTO suppressions (rule_id, scope_host, scope_user, scope_ip, reason, created_by, expires_at)
                VALUES (:r,:h,:u,:ip,:reason,:by, now() + make_interval(hours => :hrs)) RETURNING id""")
                .param("r", b.ruleId()).param("h", b.host()).param("u", b.username()).param("ip", b.ip()).param("reason", b.reason())
                .param("by", Actor.name()).param("hrs", hours).query(Long.class).single();
        audit.record(Actor.name(), "suppression.create", "suppression", id, Map.of("rule", b.ruleId(), "hours", hours));
        return Map.of("id", id);
    }

    @GetMapping("/suppressions")
    public List<Map<String, Object>> suppressions() {
        return jdbc.sql("""
                SELECT id, rule_id AS "ruleId", scope_host AS host, scope_user AS username, scope_ip AS ip, reason, created_by AS "createdBy",
                       created_at AS "createdAt", expires_at AS "expiresAt", expires_at > now() AS active FROM suppressions ORDER BY id DESC LIMIT 100""").query().listOfRows();
    }

    @DeleteMapping("/suppressions/{id}")
    @PreAuthorize("hasRole('DETECTION_ENGINEER')")
    public Map<String, Object> expire(@PathVariable long id) {
        int n = jdbc.sql("UPDATE suppressions SET expires_at = now() WHERE id = :id AND expires_at > now()").param("id", id).update();
        if (n == 0) throw ApiException.notFound("Active suppression");
        audit.record(Actor.name(), "suppression.expire", "suppression", id, Map.of());
        return Map.of("expired", id);
    }

    // ---------------------------------------------------------------- events (evidence drawer)
    @GetMapping("/events/{id}")
    public Map<String, Object> event(@PathVariable long id) {
        Map<String, Object> m = new LinkedHashMap<>(events.detail(id).orElseThrow(() -> ApiException.notFound("Event")));
        m.put("raw", Json.read((String) m.get("raw")));
        m.put("alerts", jdbc.sql("SELECT a.id, a.title, a.severity FROM alert_evidence e JOIN alerts a ON a.id = e.alert_id WHERE e.event_id = :id").param("id", id).query().listOfRows());
        return m;
    }

    private Map<String, Object> lock(long id) {
        return jdbc.sql("SELECT id, status, severity, classification FROM alerts WHERE id = :id FOR UPDATE").param("id", id).query().listOfRows().stream().findFirst()
                .orElseThrow(() -> ApiException.notFound("Alert"));
    }
}
