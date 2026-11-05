package io.aegissoc.reports;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;

/** Command-center data. Everything comes from stored records; each block states its source and freshness. */
@RestController
@RequestMapping("/api")
public class OverviewController {
    private final JdbcClient jdbc;

    public OverviewController(JdbcClient jdbc) { this.jdbc = jdbc; }

    @GetMapping("/overview")
    public Map<String, Object> overview() {
        Instant now = Instant.now();
        Map<String, Object> o = new LinkedHashMap<>();
        o.put("asOf", now.toString());

        Map<String, Object> counts = jdbc.sql("""
                SELECT (SELECT count(*) FROM normalized_events) AS events,
                       (SELECT count(*) FROM normalized_events WHERE synthetic) AS "syntheticEvents",
                       (SELECT count(*) FROM alerts WHERE status IN ('NEW','ACKNOWLEDGED','INVESTIGATING','ESCALATED')) AS "openAlerts",
                       (SELECT count(*) FROM alerts WHERE status = 'NEW') AS "newAlerts",
                       (SELECT count(*) FROM alerts WHERE status IN ('NEW','ACKNOWLEDGED','INVESTIGATING','ESCALATED') AND severity IN ('HIGH','CRITICAL')) AS "highAlerts",
                       (SELECT count(*) FROM incidents WHERE status NOT IN ('RESOLVED','CLOSED')) AS "openIncidents",
                       (SELECT count(*) FROM incidents WHERE status NOT IN ('RESOLVED','CLOSED') AND assignee IS NULL) AS "unassignedIncidents",
                       (SELECT count(*) FROM assets) AS assets,
                       (SELECT count(*) FROM response_proposals WHERE status = 'PENDING' AND expires_at > now()) AS "pendingApprovals"
                """).query().listOfRows().get(0);
        o.put("counts", counts);

        long events = ((Number) counts.get("events")).longValue();
        long syn = ((Number) counts.get("syntheticEvents")).longValue();
        Map<String, Object> lastRun = jdbc.sql("""
                SELECT r.id, r.status, r.scenario, r.finished_at AS "finishedAt", r.events_accepted AS "eventsAccepted", r.synthetic, s.name AS "sourceName"
                FROM ingestion_runs r JOIN data_sources s ON s.id = r.source_id WHERE r.status <> 'RUNNING' ORDER BY r.id DESC LIMIT 1""").query().listOfRows().stream().findFirst().orElse(null);
        Timestamp lastSuccess = jdbc.sql("SELECT max(last_success_at) FROM data_sources").query(Timestamp.class).optional().orElse(null);
        long failed = jdbc.sql("SELECT count(*) FROM data_sources WHERE enabled AND health IN ('FAILED')").query(Long.class).single();
        long stale = jdbc.sql("""
                SELECT count(*) FROM data_sources WHERE enabled AND health NOT IN ('FAILED') AND last_success_at IS NOT NULL
                AND now() - last_success_at > make_interval(secs => expected_interval_sec)""").query(Long.class).single();
        String mode;
        String modeText;
        if (events == 0) { mode = "DISCONNECTED"; modeText = "No telemetry has been ingested. Run a safe demo scenario to begin."; }
        else if (failed > 0) { mode = "FAILED"; modeText = failed + " enabled source(s) failed their last ingestion."; }
        else if (syn == events) { mode = "DEMO"; modeText = "Demo mode: every event in the database is SYNTHETIC. No live source is connected."; }
        else { mode = "LOCAL_DATA"; modeText = "Contains " + (events - syn) + " non-synthetic event(s) imported from local files/API. No live connector is active."; }
        if (stale > 0 && !mode.equals("FAILED") && !mode.equals("DISCONNECTED")) modeText += " " + stale + " source(s) are stale.";
        o.put("dataState", Map.of("mode", mode, "text", modeText, "liveConnectorsActive", 0, "staleSources", stale, "failedSources", failed,
                "lastSuccessfulIngest", lastSuccess == null ? "" : lastSuccess.toInstant().toString(), "lastRun", lastRun == null ? Map.of() : lastRun));

        o.put("alertsBySeverity", jdbc.sql("SELECT severity, count(*) AS count FROM alerts WHERE status IN ('NEW','ACKNOWLEDGED','INVESTIGATING','ESCALATED') GROUP BY 1 ORDER BY CASE severity WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END").query().listOfRows());
        o.put("priorityAlerts", jdbc.sql("""
                SELECT id, title, severity, confidence, status, assignee, entity_host AS host, last_event_at AS "lastEventAt", synthetic,
                       (explanation->>'hypothesis')::boolean AS hypothesis
                FROM alerts WHERE status IN ('NEW','ACKNOWLEDGED','INVESTIGATING','ESCALATED')
                ORDER BY CASE severity WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END, CASE status WHEN 'NEW' THEN 0 ELSE 1 END, last_event_at DESC LIMIT 6""").query().listOfRows());
        o.put("priorityIncidents", jdbc.sql("""
                SELECT id, title, severity, status, assignee, priority, synthetic FROM incidents WHERE status NOT IN ('RESOLVED','CLOSED')
                ORDER BY priority, id DESC LIMIT 5""").query().listOfRows());
        o.put("sources", jdbc.sql("""
                SELECT id, name, source_type AS "sourceType", enabled, integration_status AS "integrationStatus", last_success_at AS "lastSuccessAt",
                       CASE WHEN NOT enabled THEN 'DISABLED' WHEN health IN ('FAILED','DEGRADED') THEN health WHEN last_success_at IS NULL THEN 'NEVER_INGESTED'
                            WHEN now() - last_success_at > make_interval(secs => expected_interval_sec) THEN 'STALE' ELSE 'HEALTHY' END AS health
                FROM data_sources ORDER BY id""").query().listOfRows());
        o.put("alertTrend", jdbc.sql("""
                SELECT date_trunc('hour', first_event_at) AS hour, count(*) AS count FROM alerts WHERE first_event_at > now() - interval '24 hours' GROUP BY 1 ORDER BY 1""").query().listOfRows());
        o.put("recentRuns", jdbc.sql("""
                SELECT r.id, s.name AS "sourceName", r.scenario, r.status, r.finished_at AS "finishedAt", r.events_accepted AS "eventsAccepted", r.events_rejected AS "eventsRejected",
                       r.alerts_created AS "alertsCreated", r.synthetic FROM ingestion_runs r JOIN data_sources s ON s.id = r.source_id ORDER BY r.id DESC LIMIT 5""").query().listOfRows());
        o.put("source", "PostgreSQL application database (alerts, incidents, ingestion_runs, data_sources). Counts are live queries at the time shown.");
        return o;
    }
}
