package io.aegissoc.incidents;

import com.fasterxml.jackson.databind.JsonNode;
import io.aegissoc.alerts.AlertWorkflow;
import io.aegissoc.audit.AuditService;
import io.aegissoc.common.ApiException;
import io.aegissoc.common.Json;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.util.*;

@Service
public class IncidentService {
    private final JdbcClient jdbc;
    private final AuditService audit;

    public IncidentService(JdbcClient jdbc, AuditService audit) { this.jdbc = jdbc; this.audit = audit; }

    static final String LIST_SQL = """
            SELECT i.id, i.title, i.severity, i.priority, i.status, i.classification, i.resolution, i.assignee, i.created_by AS "createdBy",
                   i.synthetic, i.created_at AS "createdAt", i.updated_at AS "updatedAt", i.closed_at AS "closedAt", i.merged_into AS "mergedInto",
                   (SELECT count(*) FROM incident_alerts l WHERE l.incident_id = i.id) AS "alertCount",
                   (SELECT count(*) FROM incident_tasks t WHERE t.incident_id = i.id AND NOT t.done) AS "openTasks"
            FROM incidents i""";

    public Map<String, Object> list(String status, String assignee, String q, boolean openOnly, int page, int size) {
        size = Math.min(Math.max(size, 1), 100);
        StringBuilder where = new StringBuilder(" WHERE 1=1");
        Map<String, Object> p = new HashMap<>();
        if (status != null && !status.isBlank()) { where.append(" AND i.status = ANY(string_to_array(:status, ','))"); p.put("status", status); }
        if (openOnly) where.append(" AND i.status NOT IN ('RESOLVED','CLOSED')");
        if (assignee != null && !assignee.isBlank()) {
            if (assignee.equals("unassigned")) where.append(" AND i.assignee IS NULL"); else { where.append(" AND i.assignee = :assignee"); p.put("assignee", assignee); }
        }
        if (q != null && !q.isBlank()) { where.append(" AND (i.title ILIKE :q OR i.summary ILIKE :q)"); p.put("q", "%" + q.replace("%", "").replace("_", "") + "%"); }
        JdbcClient.StatementSpec c = jdbc.sql("SELECT count(*) FROM incidents i" + where);
        for (var e : p.entrySet()) c = c.param(e.getKey(), e.getValue());
        long total = c.query(Long.class).single();
        JdbcClient.StatementSpec s = jdbc.sql(LIST_SQL + where + " ORDER BY CASE WHEN i.status IN ('RESOLVED','CLOSED') THEN 1 ELSE 0 END, i.priority, CASE i.severity WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END, i.id DESC LIMIT :l OFFSET :o");
        for (var e : p.entrySet()) s = s.param(e.getKey(), e.getValue());
        return Map.of("items", s.param("l", size).param("o", Math.max(page, 0) * size).query().listOfRows(), "total", total, "page", Math.max(page, 0), "size", size);
    }

    @Transactional
    public long create(String actor, String title, String summary, String severity, List<Long> alertIds, List<Long> eventIds, Integer priority) {
        if (alertIds.isEmpty() && eventIds.isEmpty()) throw ApiException.bad("An incident needs at least one alert or one observed event as evidence");
        boolean synthetic = true;
        String computed = null;
        for (long aid : alertIds) {
            Map<String, Object> a = jdbc.sql("SELECT severity, synthetic, status FROM alerts WHERE id = :id").param("id", aid).query().listOfRows().stream().findFirst()
                    .orElseThrow(() -> ApiException.notFound("Alert " + aid));
            synthetic &= (Boolean) a.get("synthetic");
            String s = (String) a.get("severity");
            if (computed == null || AlertWorkflow.severityRank(s) > AlertWorkflow.severityRank(computed)) computed = s;
        }
        String maxSev = severity != null ? severity : computed;
        for (long eid : eventIds) {
            Boolean syn = jdbc.sql("SELECT synthetic FROM normalized_events WHERE id = :id").param("id", eid).query(Boolean.class).optional()
                    .orElseThrow(() -> ApiException.notFound("Event " + eid));
            synthetic &= syn;
        }
        if (maxSev == null) maxSev = "MEDIUM";
        if (!IncidentWorkflow.SEVERITIES.contains(maxSev)) throw ApiException.bad("Invalid severity");
        int prio = priority != null ? priority : switch (maxSev) { case "CRITICAL" -> 1; case "HIGH" -> 2; case "MEDIUM" -> 3; default -> 4; };
        long id = jdbc.sql("""
                INSERT INTO incidents (title, summary, severity, priority, created_by, synthetic, classification)
                VALUES (:t,:s,:sev,:p,:by,:syn,'SUSPICIOUS') RETURNING id""")
                .param("t", title).param("s", summary == null ? "" : summary).param("sev", maxSev).param("p", prio).param("by", actor).param("syn", synthetic).query(Long.class).single();
        for (long aid : alertIds) {
            jdbc.sql("INSERT INTO incident_alerts (incident_id, alert_id) VALUES (:i,:a) ON CONFLICT DO NOTHING").param("i", id).param("a", aid).update();
            // evidence of the alert becomes incident evidence (links to the same immutable records)
            jdbc.sql("INSERT INTO incident_evidence (incident_id, event_id, note, added_by) SELECT :i, event_id, 'From alert #' || :a, :by FROM alert_evidence WHERE alert_id = :a ON CONFLICT DO NOTHING")
                    .param("i", id).param("a", aid).param("by", actor).update();
            String st = jdbc.sql("SELECT status FROM alerts WHERE id = :a").param("a", aid).query(String.class).single();
            if (AlertWorkflow.canMove(st, "ESCALATED")) {
                jdbc.sql("UPDATE alerts SET status = 'ESCALATED', updated_at = now() WHERE id = :a").param("a", aid).update();
                jdbc.sql("INSERT INTO alert_history (alert_id, actor, from_status, to_status, note) VALUES (:a,:by,:f,'ESCALATED',:n)")
                        .param("a", aid).param("by", actor).param("f", st).param("n", "Escalated to incident #" + id).update();
            }
        }
        for (long eid : eventIds)
            jdbc.sql("INSERT INTO incident_evidence (incident_id, event_id, note, added_by) VALUES (:i,:e,'Added manually at creation',:by) ON CONFLICT DO NOTHING")
                    .param("i", id).param("e", eid).param("by", actor).update();
        activity(id, actor, "CREATED", "Incident created" + (alertIds.isEmpty() ? " from manually selected events" : " from alert(s) " + alertIds));
        audit.record(actor, "incident.create", "incident", id, Map.of("alerts", alertIds.size(), "events", eventIds.size()));
        return id;
    }

    public void activity(long incidentId, String actor, String kind, String detail) {
        jdbc.sql("INSERT INTO incident_activity (incident_id, actor, kind, detail) VALUES (:i,:a,:k,:d)").param("i", incidentId).param("a", actor).param("k", kind).param("d", detail).update();
        jdbc.sql("UPDATE incidents SET updated_at = now() WHERE id = :i").param("i", incidentId).update();
    }

    // ------------------------------------------------------------------ detail
    public Map<String, Object> detail(long id) {
        Map<String, Object> inc = new LinkedHashMap<>(jdbc.sql(LIST_SQL + " WHERE i.id = :id").param("id", id).query().listOfRows().stream().findFirst()
                .orElseThrow(() -> ApiException.notFound("Incident")));
        Map<String, Object> raw = jdbc.sql("SELECT summary, post_incident::text AS pi, containment_verified AS cv, triaged_at FROM incidents WHERE id = :id").param("id", id).query().listOfRows().get(0);
        inc.put("summary", raw.get("summary"));
        inc.put("postIncident", Json.read((String) raw.get("pi")));
        inc.put("containmentVerified", raw.get("cv"));
        inc.put("triagedAt", raw.get("triaged_at"));
        List<Map<String, Object>> alerts = jdbc.sql("""
                SELECT a.id, a.title, a.severity, a.confidence, a.status, a.rule_id AS "ruleId", a.rule_version AS "ruleVersion", a.explanation::text AS explanation
                FROM incident_alerts l JOIN alerts a ON a.id = l.alert_id WHERE l.incident_id = :id ORDER BY a.id""").param("id", id).query().listOfRows();
        List<JsonNode> explanations = new ArrayList<>();
        for (Map<String, Object> a : alerts) { JsonNode ex = Json.read((String) a.remove("explanation")); explanations.add(ex); a.put("hypothesis", ex.path("hypothesis").asBoolean()); }
        inc.put("alerts", alerts);
        List<Map<String, Object>> evidence = jdbc.sql("""
                SELECT n.id, n.ts, n.event_class AS "eventClass", n.action, n.outcome, n.severity, n.host, n.username, n.src_ip AS "srcIp", n.dst_ip AS "dstIp",
                       n.domain, n.process_name AS "processName", n.message, n.synthetic, e.note, e.added_by AS "addedBy", e.added_at AS "addedAt"
                FROM incident_evidence e JOIN normalized_events n ON n.id = e.event_id WHERE e.incident_id = :id ORDER BY n.ts, n.id""").param("id", id).query().listOfRows();
        inc.put("evidence", evidence);
        List<Map<String, Object>> notes = jdbc.sql("SELECT id, kind, body, author, created_at AS \"at\" FROM incident_notes WHERE incident_id = :id ORDER BY id").param("id", id).query().listOfRows();
        inc.put("notes", notes);
        inc.put("tasks", jdbc.sql("SELECT id, title, done, assignee, created_by AS \"createdBy\", created_at AS \"createdAt\", completed_at AS \"completedAt\" FROM incident_tasks WHERE incident_id = :id ORDER BY id").param("id", id).query().listOfRows());
        List<Map<String, Object>> activity = jdbc.sql("SELECT id, at, actor, kind, detail FROM incident_activity WHERE incident_id = :id ORDER BY id").param("id", id).query().listOfRows();
        inc.put("activity", activity);
        inc.put("timeline", timeline(evidence, notes, activity));
        inc.put("entities", entities(evidence));
        inc.put("guide", guide(inc, explanations, evidence));
        inc.put("proposals", jdbc.sql("""
                SELECT id, action_type AS "actionType", target, status, mode, requested_by AS "requestedBy", created_at AS "createdAt", expires_at AS "expiresAt"
                FROM response_proposals WHERE incident_id = :id ORDER BY id DESC""").param("id", id).query().listOfRows());
        return inc;
    }

    /** Timeline distinguishes TELEMETRY (observed), ANALYST (human statements) and ACTION (system/user actions). */
    private List<Map<String, Object>> timeline(List<Map<String, Object>> ev, List<Map<String, Object>> notes, List<Map<String, Object>> act) {
        List<Map<String, Object>> t = new ArrayList<>();
        for (Map<String, Object> e : ev) t.add(Map.of("at", e.get("ts"), "type", "TELEMETRY", "text", String.valueOf(e.get("message")), "ref", "event:" + e.get("id"), "actor", "sensor"));
        for (Map<String, Object> n : notes) t.add(Map.of("at", n.get("at"), "type", "ANALYST", "text", "[" + n.get("kind") + "] " + n.get("body"), "ref", "note:" + n.get("id"), "actor", n.get("author")));
        for (Map<String, Object> a : act) t.add(Map.of("at", a.get("at"), "type", "ACTION", "text", String.valueOf(a.get("detail")), "ref", "activity:" + a.get("id"), "actor", a.get("actor")));
        t.sort(Comparator.comparing(m -> ((Timestamp) m.get("at")).toInstant()));
        return t;
    }

    private Map<String, Object> entities(List<Map<String, Object>> ev) {
        Set<String> hosts = new TreeSet<>(), users = new TreeSet<>(), ips = new TreeSet<>(), domains = new TreeSet<>(), procs = new TreeSet<>();
        for (Map<String, Object> e : ev) {
            add(hosts, e.get("host")); add(users, e.get("username")); add(ips, e.get("srcIp")); add(ips, e.get("dstIp")); add(domains, e.get("domain")); add(procs, e.get("processName"));
        }
        return Map.of("hosts", hosts, "users", users, "ips", ips, "domains", domains, "processes", procs);
    }

    private static void add(Set<String> s, Object o) { if (o != null && !o.toString().isBlank()) s.add(o.toString()); }

    /** Deterministic six-part guided workflow built from the linked alerts' stored explanations. */
    private Map<String, Object> guide(Map<String, Object> inc, List<JsonNode> ex, List<Map<String, Object>> ev) {
        List<String> know = new ArrayList<>(), why = new ArrayList<>(), uncertain = new ArrayList<>(), next = new ArrayList<>(), verify = new ArrayList<>();
        know.add(ev.size() + " telemetry event(s) are attached as evidence" + (Boolean.TRUE.equals(inc.get("synthetic")) ? " (all SYNTHETIC)." : "."));
        for (JsonNode e : ex) {
            know.add(e.path("simple").path("what").asText());
            why.add(e.path("simple").path("why").asText());
            e.path("uncertainty").forEach(u -> uncertain.add(u.asText()));
            e.path("simple").path("alternatives").forEach(a -> uncertain.add("Alternative explanation: " + a.asText()));
            e.path("simple").path("next").forEach(n -> next.add(n.asText()));
            e.path("simple").path("verify").forEach(v -> verify.add(v.asText()));
        }
        if (ex.isEmpty()) { why.add("Created manually from observed events; no detection rule explains it."); uncertain.add("No rule evaluated this evidence; interpretation is entirely analyst judgement."); }
        List<String> recommended = new ArrayList<>(List.of(
                "Collect more evidence with read-only searches (Hunt page). No permission needed.",
                "If containment seems warranted, draft a response proposal. It is simulated first and needs a different person (incident lead) to approve; AegisSOC never executes it on a real system."));
        return Map.of("know", dedupe(know), "why", dedupe(why), "uncertain", dedupe(uncertain), "next", dedupe(next), "recommended", recommended, "verify", dedupe(verify));
    }

    private static List<String> dedupe(List<String> l) { return new ArrayList<>(new LinkedHashSet<>(l)); }

    // ------------------------------------------------------------------ mutations
    @Transactional
    public void transition(long id, String to, String note, String resolution, String actor, boolean isLead, boolean force) {
        Map<String, Object> inc = jdbc.sql("SELECT status, containment_verified AS cv FROM incidents WHERE id = :id FOR UPDATE").param("id", id).query().listOfRows().stream().findFirst()
                .orElseThrow(() -> ApiException.notFound("Incident"));
        String from = (String) inc.get("status");
        if (!IncidentWorkflow.canMove(from, to)) throw ApiException.conflict("ILLEGAL_TRANSITION", "Incident cannot move from " + from + " to " + to);
        if (to.equals("CONTAINED") && !Boolean.TRUE.equals(inc.get("cv")))
            throw ApiException.conflict("CONTAINMENT_NOT_VERIFIED", "An incident can only be CONTAINED after a passed (system-measured) verification check; attestation alone is not enough");
        if (to.equals("CLOSED") && !isLead) throw ApiException.forbidden("Only an incident lead can close an incident");
        if (from.equals("CLOSED") && !isLead) throw ApiException.forbidden("Only an incident lead can reopen a closed incident");
        if ((from.equals("CLOSED") || from.equals("RESOLVED")) && (note == null || note.isBlank())) throw ApiException.bad("Reopening requires a reason");
        String cls = null;
        if (to.equals("RESOLVED")) {
            if (resolution == null || !IncidentWorkflow.RESOLUTIONS.contains(resolution)) throw ApiException.bad("Resolving requires a resolution: " + IncidentWorkflow.RESOLUTIONS);
            if (note == null || note.isBlank()) throw ApiException.bad("Resolving requires a note");
            long open = jdbc.sql("SELECT count(*) FROM incident_tasks WHERE incident_id = :i AND NOT done").param("i", id).query(Long.class).single();
            if (open > 0 && !force) throw ApiException.conflict("OPEN_TASKS", open + " task(s) are still open. Complete them or resolve with an explicit override reason.");
            cls = IncidentWorkflow.classificationFor(resolution);
        }
        jdbc.sql("""
                UPDATE incidents SET status = :to, resolution = CASE WHEN :to = 'RESOLVED' THEN :res WHEN :to = 'INVESTIGATING' THEN NULL ELSE resolution END,
                       classification = COALESCE(:cls, classification),
                       triaged_at = CASE WHEN triaged_at IS NULL AND :from = 'NEW' THEN now() ELSE triaged_at END,
                       closed_at = CASE WHEN :to = 'RESOLVED' THEN COALESCE(closed_at, now()) WHEN :to = 'INVESTIGATING' THEN NULL ELSE closed_at END,
                       assignee = CASE WHEN :to IN ('TRIAGE','INVESTIGATING') AND assignee IS NULL THEN :actor ELSE assignee END,
                       updated_at = now() WHERE id = :id""")
                .param("to", to).param("res", resolution).param("cls", cls).param("from", from).param("actor", actor).param("id", id).update();
        activity(id, actor, "STATUS", from + " → " + to + (resolution != null ? " [" + resolution + "]" : "") + (note != null && !note.isBlank() ? ": " + note : ""));
        audit.record(actor, "incident.transition", "incident", id, Map.of("from", from, "to", to, "resolution", String.valueOf(resolution)));
        if (to.equals("RESOLVED")) {
            // Keep linked alerts consistent: alerts still ESCALATED are closed using the incident's resolution.
            String alertRes = switch (resolution) {
                case "CONFIRMED_INCIDENT_REMEDIATED" -> "TRUE_POSITIVE";
                case "FALSE_POSITIVE", "BENIGN_ADMIN_ACTIVITY", "TEST_ACTIVITY" -> resolution;
                default -> "INCONCLUSIVE";
            };
            List<Long> alertIds = jdbc.sql("SELECT a.id FROM alerts a JOIN incident_alerts l ON l.alert_id = a.id WHERE l.incident_id = :i AND a.status = 'ESCALATED'")
                    .param("i", id).query(Long.class).list();
            for (long aid : alertIds) {
                jdbc.sql("UPDATE alerts SET status='CLOSED', resolution=:r, classification=:c, updated_at=now() WHERE id=:a")
                        .param("r", alertRes).param("c", AlertWorkflow.classificationFor(alertRes)).param("a", aid).update();
                jdbc.sql("INSERT INTO alert_history (alert_id, actor, from_status, to_status, note) VALUES (:a,:by,'ESCALATED','CLOSED',:n)")
                        .param("a", aid).param("by", actor).param("n", "[" + alertRes + "] Closed with incident #" + id).update();
            }
        }
    }

    public long addNote(long id, String actor, String kind, String body) {
        ensure(id);
        if (!List.of("OBSERVATION", "ANALYST_NOTE", "HYPOTHESIS").contains(kind)) throw ApiException.bad("kind must be OBSERVATION, ANALYST_NOTE or HYPOTHESIS");
        long nid = jdbc.sql("INSERT INTO incident_notes (incident_id, kind, body, author) VALUES (:i,:k,:b,:a) RETURNING id").param("i", id).param("k", kind).param("b", body).param("a", actor).query(Long.class).single();
        activity(id, actor, "NOTE", kind + " added");
        return nid;
    }

    public long addTask(long id, String actor, String title, String assignee) {
        ensure(id);
        long tid = jdbc.sql("INSERT INTO incident_tasks (incident_id, title, assignee, created_by) VALUES (:i,:t,:as,:by) RETURNING id").param("i", id).param("t", title).param("as", assignee).param("by", actor).query(Long.class).single();
        activity(id, actor, "TASK", "Task added: " + title);
        return tid;
    }

    public void setTask(long id, long taskId, boolean done, String actor) {
        int n = jdbc.sql("UPDATE incident_tasks SET done = :d, completed_at = CASE WHEN :d THEN now() ELSE NULL END WHERE id = :t AND incident_id = :i").param("d", done).param("t", taskId).param("i", id).update();
        if (n == 0) throw ApiException.notFound("Task");
        activity(id, actor, "TASK", "Task #" + taskId + (done ? " completed" : " reopened"));
    }

    public void addEvidence(long id, long eventId, String note, String actor) {
        ensure(id);
        jdbc.sql("SELECT 1 FROM normalized_events WHERE id = :e").param("e", eventId).query().listOfRows().stream().findFirst().orElseThrow(() -> ApiException.notFound("Event"));
        jdbc.sql("INSERT INTO incident_evidence (incident_id, event_id, note, added_by) VALUES (:i,:e,:n,:by) ON CONFLICT DO NOTHING").param("i", id).param("e", eventId).param("n", note).param("by", actor).update();
        activity(id, actor, "EVIDENCE", "Linked event #" + eventId);
    }

    public void linkAlert(long id, long alertId, String actor) {
        ensure(id);
        jdbc.sql("SELECT 1 FROM alerts WHERE id = :a").param("a", alertId).query().listOfRows().stream().findFirst().orElseThrow(() -> ApiException.notFound("Alert"));
        jdbc.sql("INSERT INTO incident_alerts (incident_id, alert_id) VALUES (:i,:a) ON CONFLICT DO NOTHING").param("i", id).param("a", alertId).update();
        jdbc.sql("INSERT INTO incident_evidence (incident_id, event_id, note, added_by) SELECT :i, event_id, 'From alert #' || :a, :by FROM alert_evidence WHERE alert_id = :a ON CONFLICT DO NOTHING").param("i", id).param("a", alertId).param("by", actor).update();
        activity(id, actor, "ALERT_LINK", "Linked alert #" + alertId);
    }

    @Transactional
    public void merge(long id, long intoId, String actor) {
        if (id == intoId) throw ApiException.bad("Cannot merge an incident into itself");
        ensure(id); ensure(intoId);
        Map<String, Object> src = jdbc.sql("SELECT status, merged_into FROM incidents WHERE id = :i").param("i", id).query().listOfRows().get(0);
        if (src.get("merged_into") != null) throw ApiException.conflict("ALREADY_MERGED", "Incident was already merged");
        jdbc.sql("INSERT INTO incident_alerts (incident_id, alert_id) SELECT :t, alert_id FROM incident_alerts WHERE incident_id = :s ON CONFLICT DO NOTHING").param("t", intoId).param("s", id).update();
        jdbc.sql("INSERT INTO incident_evidence (incident_id, event_id, note, added_by) SELECT :t, event_id, 'Merged from incident #' || :s, :by FROM incident_evidence WHERE incident_id = :s ON CONFLICT DO NOTHING").param("t", intoId).param("s", id).param("by", actor).update();
        jdbc.sql("UPDATE incidents SET merged_into = :t, status = 'CLOSED', resolution = 'DUPLICATE', closed_at = COALESCE(closed_at, now()), updated_at = now() WHERE id = :s").param("t", intoId).param("s", id).update();
        activity(id, actor, "MERGE", "Merged into incident #" + intoId + " (links preserved; original records untouched)");
        activity(intoId, actor, "MERGE", "Incident #" + id + " merged into this one");
        audit.record(actor, "incident.merge", "incident", id, Map.of("into", intoId));
    }

    public void ensure(long id) {
        if (jdbc.sql("SELECT 1 FROM incidents WHERE id = :i").param("i", id).query().listOfRows().isEmpty()) throw ApiException.notFound("Incident");
    }
}
