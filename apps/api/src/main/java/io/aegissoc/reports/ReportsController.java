package io.aegissoc.reports;

import io.aegissoc.audit.AuditService;
import io.aegissoc.auth.Actor;
import io.aegissoc.common.ApiException;
import io.aegissoc.common.Json;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;

/**
 * Operational metrics with explicit definitions. Every figure links to the records behind it and the report states what it
 * cannot tell you (fixture data, missing sensors, small samples). No figure is invented: empty data yields "no data".
 */
@RestController
@RequestMapping("/api/reports")
public class ReportsController {
    private final JdbcClient jdbc;
    private final AuditService audit;

    public ReportsController(JdbcClient jdbc, AuditService audit) { this.jdbc = jdbc; this.audit = audit; }

    @GetMapping("/metrics")
    public Map<String, Object> metrics(@RequestParam(defaultValue = "30") int days) {
        days = Math.max(1, Math.min(days, 365));
        Instant to = Instant.now(), from = to.minus(days, ChronoUnit.DAYS);
        java.sql.Timestamp f = java.sql.Timestamp.from(from);
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("period", Map.of("from", from.toString(), "to", to.toString(), "days", days, "timezone", "UTC",
                "note", "Period boundaries are UTC. Incidents/alerts are counted by creation time within the period."));

        Map<String, Object> inc = new LinkedHashMap<>();
        inc.put("created", count("SELECT count(*) FROM incidents WHERE created_at >= :f", f));
        inc.put("bySeverity", jdbc.sql("SELECT severity, count(*) AS count FROM incidents WHERE created_at >= :f GROUP BY 1 ORDER BY CASE severity WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END").param("f", f).query().listOfRows());
        inc.put("byStatus", jdbc.sql("SELECT status, count(*) AS count FROM incidents WHERE created_at >= :f GROUP BY 1 ORDER BY 2 DESC").param("f", f).query().listOfRows());
        inc.put("open", count("SELECT count(*) FROM incidents WHERE status NOT IN ('RESOLVED','CLOSED')", null));
        Map<String, Object> times = jdbc.sql("""
                SELECT count(triaged_at) AS "triagedN", round(avg(extract(epoch FROM (triaged_at - created_at)) / 60)::numeric, 1) AS "avgTriageMin",
                       count(closed_at) AS "closedN", round(avg(extract(epoch FROM (closed_at - created_at)) / 60)::numeric, 1) AS "avgCloseMin"
                FROM incidents WHERE created_at >= :f""").param("f", f).query().listOfRows().get(0);
        inc.put("timeToTriage", Map.of("definition", "Minutes from incident creation until it first left status NEW.", "average", nz(times.get("avgTriageMin")), "sampleSize", times.get("triagedN")));
        inc.put("timeToClose", Map.of("definition", "Minutes from incident creation until first RESOLVED (reopening clears it).", "average", nz(times.get("avgCloseMin")), "sampleSize", times.get("closedN")));
        inc.put("drilldown", "/app/incidents");
        m.put("incidents", inc);

        Map<String, Object> al = new LinkedHashMap<>();
        al.put("created", count("SELECT count(*) FROM alerts WHERE created_at >= :f", f));
        al.put("bySeverity", jdbc.sql("SELECT severity, count(*) AS count FROM alerts WHERE created_at >= :f GROUP BY 1 ORDER BY CASE severity WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END").param("f", f).query().listOfRows());
        al.put("byStatus", jdbc.sql("SELECT status, count(*) AS count FROM alerts WHERE created_at >= :f GROUP BY 1 ORDER BY 2 DESC").param("f", f).query().listOfRows());
        al.put("closedByResolution", jdbc.sql("SELECT coalesce(resolution,'(none)') AS resolution, count(*) AS count FROM alerts WHERE status = 'CLOSED' AND created_at >= :f GROUP BY 1 ORDER BY 2 DESC").param("f", f).query().listOfRows());
        al.put("openUnassigned", count("SELECT count(*) FROM alerts WHERE status IN ('NEW','ACKNOWLEDGED','INVESTIGATING','ESCALATED') AND assignee IS NULL", null));
        al.put("drilldown", "/app/alerts");
        m.put("alerts", al);

        m.put("ruleNoise", jdbc.sql("""
                SELECT r.id AS "ruleId", r.name, count(a.id) AS alerts, count(*) FILTER (WHERE a.status = 'CLOSED') AS closed,
                       count(*) FILTER (WHERE a.classification = 'BENIGN') AS "judgedBenign",
                       CASE WHEN count(*) FILTER (WHERE a.status = 'CLOSED') = 0 THEN NULL
                            ELSE round(100.0 * count(*) FILTER (WHERE a.classification = 'BENIGN') / count(*) FILTER (WHERE a.status = 'CLOSED'), 1) END AS "benignShareOfClosed"
                FROM detection_rules r LEFT JOIN alerts a ON a.rule_id = r.id AND a.created_at >= :f GROUP BY r.id, r.name ORDER BY alerts DESC, r.id""").param("f", f).query().listOfRows());

        List<Map<String, Object>> perf = jdbc.sql("""
                SELECT DISTINCT ON (t.rule_id) t.rule_id AS "ruleId", t.version, t.tp, t.fp, t.fn, t.tn, t.run_at AS "runAt", t.fixture_set AS "suite"
                FROM rule_test_runs t ORDER BY t.rule_id, t.id DESC""").query().listOfRows();
        for (Map<String, Object> p : perf) {
            int tp = ((Number) p.get("tp")).intValue(), fp = ((Number) p.get("fp")).intValue(), fn = ((Number) p.get("fn")).intValue();
            p.put("sensitivity", tp + fn == 0 ? null : Math.round(1000.0 * tp / (tp + fn)) / 10.0);
            p.put("precision", tp + fp == 0 ? null : Math.round(1000.0 * tp / (tp + fp)) / 10.0);
        }
        long totalRules = count("SELECT count(*) FROM detection_rules", null);
        m.put("detectionQuality", Map.of("latestTestPerRule", perf, "rulesTested", perf.size(), "rulesTotal", totalRules,
                "caveat", "Scores come from a small hand-labelled SYNTHETIC suite. They are regression checks, not measurements of real-world detection effectiveness.", "drilldown", "/app/detections"));

        m.put("sources", jdbc.sql("""
                SELECT CASE WHEN NOT enabled THEN 'DISABLED' WHEN health IN ('FAILED','DEGRADED') THEN health WHEN last_success_at IS NULL THEN 'NEVER_INGESTED'
                            WHEN now() - last_success_at > make_interval(secs => expected_interval_sec) THEN 'STALE' ELSE 'HEALTHY' END AS health, count(*) AS count
                FROM data_sources GROUP BY 1 ORDER BY 2 DESC""").query().listOfRows());
        m.put("workload", jdbc.sql("""
                SELECT coalesce(assignee, '(unassigned)') AS assignee,
                       (SELECT count(*) FROM incidents i WHERE coalesce(i.assignee,'(unassigned)') = coalesce(x.assignee,'(unassigned)') AND i.status NOT IN ('RESOLVED','CLOSED')) AS "openIncidents",
                       count(*) AS "openAlerts"
                FROM alerts x WHERE status IN ('NEW','ACKNOWLEDGED','INVESTIGATING','ESCALATED') GROUP BY x.assignee ORDER BY 3 DESC""").query().listOfRows());

        long events = count("SELECT count(*) FROM normalized_events", null), syn = count("SELECT count(*) FROM normalized_events WHERE synthetic", null);
        List<String> caveats = new ArrayList<>();
        if (events == 0) caveats.add("No telemetry has been ingested: every figure below is empty, not zero risk.");
        if (events > 0 && syn == events) caveats.add("All underlying data is SYNTHETIC demonstration data. These metrics describe the demo, not a real environment.");
        else if (syn > 0) caveats.add(syn + " of " + events + " events are synthetic; metrics mix demo and local data.");
        caveats.add("No live connector is active; coverage is limited to files and fixtures imported into AegisSOC.");
        caveats.add("Small sample sizes make averages unstable; sample sizes are shown beside each average.");
        caveats.add("Missing or silent sensors hide activity: absence of alerts is not absence of threats.");
        m.put("caveats", caveats);
        m.put("provenance", Map.of("source", "AegisSOC application database", "generatedAt", to.toString(), "events", events, "syntheticEvents", syn));
        m.put("executiveSummary", executive(m, events, syn));
        return m;
    }

    @SuppressWarnings("unchecked")
    private List<String> executive(Map<String, Object> m, long events, long syn) {
        Map<String, Object> inc = (Map<String, Object>) m.get("incidents");
        Map<String, Object> al = (Map<String, Object>) m.get("alerts");
        List<String> s = new ArrayList<>();
        if (events == 0) return List.of("No security data has been collected yet, so nothing can be said about risk. Start by importing data or running the safe demo.");
        s.add((syn == events ? "This is a demonstration environment with synthetic data. " : "") + al.get("created") + " alert(s) and " + inc.get("created") + " case(s) were raised in this period; " + inc.get("open") + " case(s) are still open.");
        s.add(al.get("openUnassigned") + " open alert(s) have no owner.");
        s.add("Things we cannot see: devices that send no data, and any source that is stale or failed (see data-source health). Quiet is not the same as safe.");
        return s;
    }

    @GetMapping("/export")
    @PreAuthorize("hasRole('ANALYST')")
    public ResponseEntity<byte[]> export(@RequestParam(defaultValue = "30") int days, @RequestParam(defaultValue = "md") String format, @RequestParam(defaultValue = "analyst") String audience) {
        if (!List.of("md", "json", "csv").contains(format)) throw ApiException.bad("format must be md, json or csv");
        Map<String, Object> m = metrics(days);
        String body = switch (format) {
            case "json" -> Json.write(m);
            case "csv" -> csv(m);
            default -> markdown(m, "executive".equals(audience));
        };
        String sha = Json.sha256(body);
        jdbc.sql("INSERT INTO report_exports (report_type, format, redacted, synthetic, created_by, sha256) VALUES ('metrics', :f, FALSE, :s, :by, :sha)")
                .param("f", format).param("s", ((Map<?, ?>) m.get("provenance")).get("events").equals(((Map<?, ?>) m.get("provenance")).get("syntheticEvents"))).param("by", Actor.name()).param("sha", sha).update();
        audit.record(Actor.name(), "report.export", "metrics", null, Map.of("format", format, "days", days, "sha256", sha));
        String ct = switch (format) { case "json" -> "application/json"; case "csv" -> "text/csv"; default -> "text/markdown"; };
        return ResponseEntity.ok().contentType(MediaType.parseMediaType(ct + ";charset=UTF-8")).header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"aegissoc-report." + format + "\"")
                .header("X-Content-SHA256", sha).header("X-Content-Type-Options", "nosniff").body(body.getBytes(StandardCharsets.UTF_8));
    }

    @SuppressWarnings("unchecked")
    private String markdown(Map<String, Object> m, boolean executive) {
        StringBuilder sb = new StringBuilder("# AegisSOC " + (executive ? "executive summary" : "SOC operations report") + "\n\n");
        Map<String, Object> p = (Map<String, Object>) m.get("period");
        sb.append("Period: ").append(p.get("from")).append(" → ").append(p.get("to")).append(" (").append(p.get("timezone")).append(")\n\n");
        sb.append("## Summary\n\n");
        for (String l : (List<String>) m.get("executiveSummary")) sb.append("- ").append(l).append("\n");
        if (!executive) {
            Map<String, Object> inc = (Map<String, Object>) m.get("incidents"), al = (Map<String, Object>) m.get("alerts");
            sb.append("\n## Incidents\n\n- Created: ").append(inc.get("created")).append("\n- Open now: ").append(inc.get("open")).append("\n- Time to triage: ").append(inc.get("timeToTriage")).append("\n- Time to close: ").append(inc.get("timeToClose")).append("\n");
            sb.append("\n## Alerts\n\n- Created: ").append(al.get("created")).append("\n- Open and unassigned: ").append(al.get("openUnassigned")).append("\n");
            sb.append("\n## Rule noise\n\n| Rule | Alerts | Closed | Judged benign |\n|---|---|---|---|\n");
            for (Map<String, Object> r : (List<Map<String, Object>>) m.get("ruleNoise")) sb.append("| ").append(r.get("ruleId")).append(" | ").append(r.get("alerts")).append(" | ").append(r.get("closed")).append(" | ").append(r.get("judgedBenign")).append(" |\n");
            sb.append("\n## Weekly review checklist\n\n- [ ] Review unassigned open alerts\n- [ ] Review stale or failed sources\n- [ ] Review rules with a high benign share\n- [ ] Re-run the labelled rule suite after any rule change\n- [ ] Record lessons learned on closed cases\n");
        }
        sb.append("\n## Caveats\n\n");
        for (String c : (List<String>) m.get("caveats")) sb.append("- ").append(c).append("\n");
        sb.append("\n---\nGenerated ").append(((Map<String, Object>) m.get("provenance")).get("generatedAt")).append(" from stored AegisSOC records.\n");
        return sb.toString();
    }

    @SuppressWarnings("unchecked")
    private String csv(Map<String, Object> m) {
        StringBuilder sb = new StringBuilder("metric,value\n");
        Map<String, Object> inc = (Map<String, Object>) m.get("incidents"), al = (Map<String, Object>) m.get("alerts");
        sb.append("incidents_created,").append(inc.get("created")).append("\nincidents_open,").append(inc.get("open")).append("\nalerts_created,").append(al.get("created")).append("\nalerts_open_unassigned,").append(al.get("openUnassigned")).append("\n");
        for (Map<String, Object> r : (List<Map<String, Object>>) m.get("ruleNoise")) sb.append("rule_alerts_").append(r.get("ruleId")).append(',').append(r.get("alerts")).append('\n');
        return sb.toString();
    }

    private long count(String sql, Object ts) {
        JdbcClient.StatementSpec s = jdbc.sql(sql);
        if (ts != null) s = s.param("f", ts);
        return s.query(Long.class).single();
    }

    private static Object nz(Object o) { return o == null ? "no data" : o; }
}
