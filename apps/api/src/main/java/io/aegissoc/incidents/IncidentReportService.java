package io.aegissoc.incidents;

import com.fasterxml.jackson.databind.JsonNode;
import io.aegissoc.audit.AuditService;
import io.aegissoc.common.Json;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.*;

/** Builds sanitized, provenance-stamped case reports from STORED records only (nothing is generated from memory). */
@Service
public class IncidentReportService {
    private final JdbcClient jdbc;
    private final IncidentService incidents;
    private final AuditService audit;

    public IncidentReportService(JdbcClient jdbc, IncidentService incidents, AuditService audit) { this.jdbc = jdbc; this.incidents = incidents; this.audit = audit; }

    @SuppressWarnings("unchecked")
    public Map<String, Object> build(long id, boolean redact, String format, String actor) {
        Map<String, Object> inc = incidents.detail(id);
        Map<String, Object> ent = (Map<String, Object>) inc.get("entities");
        Redactor r = new Redactor(redact, (Collection<String>) ent.get("users"), (Collection<String>) ent.get("hosts"));
        boolean synthetic = Boolean.TRUE.equals(inc.get("synthetic"));
        Instant now = Instant.now();

        Map<String, Object> doc = new LinkedHashMap<>();
        doc.put("reportType", "incident");
        doc.put("generatedAt", now.toString());
        doc.put("generatedBy", actor);
        doc.put("redacted", redact);
        doc.put("dataProvenance", synthetic ? "SYNTHETIC fixture data: not real activity" : "Contains non-synthetic telemetry");
        doc.put("incident", Map.of("id", id, "title", r.apply((String) inc.get("title")), "severity", inc.get("severity"), "status", inc.get("status"),
                "classification", inc.get("classification"), "resolution", String.valueOf(inc.get("resolution")), "priority", inc.get("priority"),
                "createdAt", String.valueOf(inc.get("createdAt")), "closedAt", String.valueOf(inc.get("closedAt")), "summary", r.apply((String) inc.get("summary"))));
        List<Map<String, Object>> ev = new ArrayList<>();
        for (Map<String, Object> e : (List<Map<String, Object>>) inc.get("evidence")) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("eventId", e.get("id")); m.put("time", String.valueOf(e.get("ts"))); m.put("class", e.get("eventClass"));
            m.put("host", r.apply((String) e.get("host"))); m.put("user", r.apply((String) e.get("username")));
            m.put("srcIp", r.apply((String) e.get("srcIp"))); m.put("message", r.apply((String) e.get("message"))); m.put("synthetic", e.get("synthetic"));
            ev.add(m);
        }
        doc.put("evidence", ev);
        List<Map<String, Object>> alerts = new ArrayList<>();
        for (Map<String, Object> a : (List<Map<String, Object>>) inc.get("alerts"))
            alerts.add(Map.of("alertId", a.get("id"), "title", r.apply((String) a.get("title")), "rule", a.get("ruleId") + " v" + a.get("ruleVersion"),
                    "severity", a.get("severity"), "confidence", a.get("confidence"), "hypothesis", a.get("hypothesis")));
        doc.put("alerts", alerts);
        List<Map<String, Object>> notes = new ArrayList<>();
        for (Map<String, Object> n : (List<Map<String, Object>>) inc.get("notes"))
            notes.add(Map.of("kind", n.get("kind"), "author", n.get("author"), "at", String.valueOf(n.get("at")), "body", r.apply((String) n.get("body"))));
        doc.put("notes", notes);
        List<Map<String, Object>> tasks = new ArrayList<>();
        for (Map<String, Object> t : (List<Map<String, Object>>) inc.get("tasks")) tasks.add(Map.of("title", r.apply((String) t.get("title")), "done", t.get("done")));
        doc.put("tasks", tasks);
        List<Map<String, Object>> activity = new ArrayList<>();
        for (Map<String, Object> a : (List<Map<String, Object>>) inc.get("activity"))
            activity.add(Map.of("at", String.valueOf(a.get("at")), "actor", a.get("actor"), "kind", a.get("kind"), "detail", r.apply((String) a.get("detail"))));
        doc.put("activity", activity);
        doc.put("postIncident", inc.get("postIncident"));
        doc.put("responseProposals", jdbc.sql("""
                SELECT id, action_type AS "actionType", status, mode, requested_by AS "requestedBy" FROM response_proposals WHERE incident_id = :i ORDER BY id""")
                .param("i", id).query().listOfRows());
        doc.put("caveats", List.of(
                "A rule match is not proof of compromise; classification reflects analyst judgement recorded in this case.",
                "Response actions listed here are SIMULATED or user-attested; AegisSOC did not change any real system.",
                synthetic ? "All data is synthetic demonstration data." : "Coverage is limited to the configured sources."));

        String body = "json".equals(format) ? Json.write(doc) : markdown(doc, ent, redact);
        String sha = Json.sha256(body);
        jdbc.sql("INSERT INTO report_exports (report_type, subject_id, format, redacted, synthetic, created_by, sha256) VALUES ('incident', :i, :f, :r, :s, :by, :sha)")
                .param("i", id).param("f", format).param("r", redact).param("s", synthetic).param("by", actor).param("sha", sha).update();
        audit.record(actor, "report.export", "incident", id, Map.of("format", format, "redacted", redact, "sha256", sha));
        incidents.activity(id, actor, "REPORT", "Exported " + format.toUpperCase() + " report (redacted=" + redact + ")");
        return Map.of("body", body, "sha256", sha, "contentType", "json".equals(format) ? "application/json" : "text/markdown", "filename", "incident-" + id + (redact ? "-redacted" : "") + ("json".equals(format) ? ".json" : ".md"));
    }

    @SuppressWarnings("unchecked")
    private String markdown(Map<String, Object> d, Map<String, Object> ent, boolean redact) {
        Map<String, Object> inc = (Map<String, Object>) d.get("incident");
        StringBuilder sb = new StringBuilder();
        sb.append("# Incident #").append(inc.get("id")).append(": ").append(md(inc.get("title"))).append("\n\n");
        sb.append("> **").append(d.get("dataProvenance")).append("**").append(redact ? " · Redacted export (IPs masked to /24, users and hosts pseudonymized)" : "").append("\n\n");
        sb.append("| Field | Value |\n|---|---|\n");
        for (String k : List.of("severity", "status", "classification", "resolution", "priority", "createdAt", "closedAt")) sb.append("| ").append(k).append(" | ").append(md(inc.get(k))).append(" |\n");
        sb.append("\n## Summary\n\n").append(md(inc.get("summary")).isBlank() ? "_No summary recorded._" : md(inc.get("summary"))).append("\n\n");
        sb.append("## Detections that raised this case\n\n");
        List<Map<String, Object>> alerts = (List<Map<String, Object>>) d.get("alerts");
        if (alerts.isEmpty()) sb.append("_Created manually from observed events._\n");
        for (Map<String, Object> a : alerts)
            sb.append("- Alert #").append(a.get("alertId")).append(" — ").append(md(a.get("title"))).append(" (rule ").append(a.get("rule")).append(", severity ").append(a.get("severity"))
              .append(", confidence ").append(a.get("confidence")).append(Boolean.TRUE.equals(a.get("hypothesis")) ? ", **hypothesis**" : "").append(")\n");
        sb.append("\n## Evidence (immutable event records)\n\n| Event | Time | Class | Host | User | Source IP | Message |\n|---|---|---|---|---|---|---|\n");
        for (Map<String, Object> e : (List<Map<String, Object>>) d.get("evidence"))
            sb.append("| #").append(e.get("eventId")).append(" | ").append(e.get("time")).append(" | ").append(e.get("class")).append(" | ").append(md(e.get("host"))).append(" | ")
              .append(md(e.get("user"))).append(" | ").append(md(e.get("srcIp"))).append(" | ").append(md(e.get("message"))).append(" |\n");
        sb.append("\n## Analyst notes\n\n");
        List<Map<String, Object>> notes = (List<Map<String, Object>>) d.get("notes");
        if (notes.isEmpty()) sb.append("_None recorded._\n");
        for (Map<String, Object> n : notes) sb.append("- **").append(n.get("kind")).append("** (").append(n.get("author")).append(", ").append(n.get("at")).append("): ").append(md(n.get("body"))).append("\n");
        sb.append("\n## Tasks\n\n");
        for (Map<String, Object> t : (List<Map<String, Object>>) d.get("tasks")) sb.append("- [").append(Boolean.TRUE.equals(t.get("done")) ? "x" : " ").append("] ").append(md(t.get("title"))).append("\n");
        sb.append("\n## Activity log\n\n");
        for (Map<String, Object> a : (List<Map<String, Object>>) d.get("activity")) sb.append("- ").append(a.get("at")).append(" · ").append(a.get("actor")).append(" · ").append(a.get("kind")).append(": ").append(md(a.get("detail"))).append("\n");
        sb.append("\n## Response proposals (simulation only)\n\n");
        List<Map<String, Object>> props = (List<Map<String, Object>>) d.get("responseProposals");
        if (props.isEmpty()) sb.append("_None._\n");
        for (Map<String, Object> p : props) sb.append("- Proposal #").append(p.get("id")).append(": ").append(p.get("actionType")).append(" — ").append(p.get("status")).append(" (").append(p.get("mode")).append("; no real system changed)\n");
        JsonNode pi = Json.MAPPER.valueToTree(d.get("postIncident"));
        sb.append("\n## Post-incident review\n\n");
        if (pi == null || pi.isEmpty()) sb.append("_Not completed._\n");
        else pi.fields().forEachRemaining(f -> sb.append("- **").append(f.getKey()).append(":** ").append(md(f.getValue().asText())).append("\n"));
        sb.append("\n## Caveats\n\n");
        for (Object c : (List<?>) d.get("caveats")) sb.append("- ").append(c).append("\n");
        sb.append("\n---\nGenerated ").append(d.get("generatedAt")).append(" by ").append(d.get("generatedBy")).append(" from stored AegisSOC records. Content hash is recorded in the export log.\n");
        return sb.toString();
    }

    /** Escape markdown table/control characters in untrusted text. */
    private static String md(Object o) {
        if (o == null) return "";
        return o.toString().replace("\\", "\\\\").replace("|", "\\|").replace("\r", " ").replace("\n", " ").replace("<", "&lt;").replace(">", "&gt;");
    }
}
