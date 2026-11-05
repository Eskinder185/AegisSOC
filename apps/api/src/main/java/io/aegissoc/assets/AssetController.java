package io.aegissoc.assets;

import io.aegissoc.audit.AuditService;
import io.aegissoc.auth.Actor;
import io.aegissoc.common.ApiException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.*;

/**
 * Assets are DERIVED from telemetry: a host exists here only because an event named it. We never claim complete discovery,
 * and we never present a "100% secure" figure: coverage reports observed signals and lists what is unknown.
 */
@RestController
@RequestMapping("/api")
public class AssetController {
    public static final String HEALTHY = "OBSERVED_HEALTHY", UNAVAILABLE = "TEMPORARILY_UNAVAILABLE", NOT_OBSERVED = "NOT_OBSERVED";

    private final JdbcClient jdbc;
    private final AuditService audit;

    public AssetController(JdbcClient jdbc, AuditService audit) { this.jdbc = jdbc; this.audit = audit; }

    @GetMapping("/assets")
    public List<Map<String, Object>> assets() {
        return jdbc.sql("""
                SELECT a.id, a.hostname, a.os, a.owner_tag AS "ownerTag", a.environment, a.criticality, a.first_seen AS "firstSeen", a.last_seen AS "lastSeen",
                       a.event_count AS "eventCount", a.synthetic,
                       (SELECT count(*) FROM alerts x WHERE x.entity_host = a.hostname AND x.status IN ('NEW','ACKNOWLEDGED','INVESTIGATING','ESCALATED')) AS "openAlerts",
                       (SELECT count(DISTINCT l.incident_id) FROM alerts x JOIN incident_alerts l ON l.alert_id = x.id JOIN incidents i ON i.id = l.incident_id
                         WHERE x.entity_host = a.hostname AND i.status NOT IN ('RESOLVED','CLOSED')) AS "openIncidents"
                FROM assets a ORDER BY a.hostname""").query().listOfRows();
    }

    @GetMapping("/assets/{hostname}")
    public Map<String, Object> asset(@PathVariable String hostname) {
        Map<String, Object> a = new LinkedHashMap<>(jdbc.sql("""
                SELECT id, hostname, os, owner_tag AS "ownerTag", environment, criticality, first_seen AS "firstSeen", last_seen AS "lastSeen", event_count AS "eventCount", synthetic
                FROM assets WHERE hostname = :h""").param("h", hostname).query().listOfRows().stream().findFirst().orElseThrow(() -> ApiException.notFound("Asset")));
        a.put("classes", jdbc.sql("""
                SELECT event_class AS "eventClass", count(*) AS count, max(ts) AS "lastSeen" FROM normalized_events WHERE host = :h GROUP BY 1 ORDER BY 2 DESC""").param("h", hostname).query().listOfRows());
        a.put("sources", jdbc.sql("""
                SELECT s.name, s.source_type AS "sourceType", count(*) AS count, max(n.ts) AS "lastSeen" FROM normalized_events n JOIN data_sources s ON s.id = n.source_id
                WHERE n.host = :h GROUP BY 1, 2 ORDER BY 3 DESC""").param("h", hostname).query().listOfRows());
        a.put("alerts", jdbc.sql("SELECT id, title, severity, status FROM alerts WHERE entity_host = :h ORDER BY id DESC LIMIT 20").param("h", hostname).query().listOfRows());
        a.put("recentEvents", jdbc.sql("SELECT id, ts, event_class AS \"eventClass\", action, outcome, message FROM normalized_events WHERE host = :h ORDER BY ts DESC, id DESC LIMIT 15").param("h", hostname).query().listOfRows());
        return a;
    }

    public record AssetPatch(@Size(max = 60) String ownerTag, String environment, String criticality) {}

    @PatchMapping("/assets/{hostname}")
    @PreAuthorize("hasRole('ANALYST')")
    public Map<String, Object> patch(@PathVariable String hostname, @Valid @RequestBody AssetPatch p) {
        if (p.environment() != null && !List.of("lab", "dev", "staging", "production").contains(p.environment())) throw ApiException.bad("environment must be lab, dev, staging or production");
        if (p.criticality() != null && !List.of("LOW", "MEDIUM", "HIGH", "CRITICAL").contains(p.criticality())) throw ApiException.bad("Invalid criticality");
        int n = jdbc.sql("UPDATE assets SET owner_tag = COALESCE(:o, owner_tag), environment = COALESCE(:e, environment), criticality = COALESCE(:c, criticality) WHERE hostname = :h")
                .param("o", p.ownerTag()).param("e", p.environment()).param("c", p.criticality()).param("h", hostname).update();
        if (n == 0) throw ApiException.notFound("Asset");
        audit.record(Actor.name(), "asset.update", "asset", hostname, Map.of());
        return asset(hostname);
    }

    /** Assets x expected event classes, with explicit unknowns. Staleness is judged against the wall clock. */
    @GetMapping("/coverage")
    public Map<String, Object> coverage() {
        Instant now = Instant.now();
        List<Map<String, Object>> expectations = jdbc.sql("SELECT event_class AS \"eventClass\", max_silence_minutes AS \"maxSilenceMinutes\", description FROM coverage_expectations ORDER BY event_class").query().listOfRows();
        List<String> hosts = jdbc.sql("SELECT hostname FROM assets ORDER BY hostname").query(String.class).list();
        Map<String, Map<String, Object[]>> seen = new HashMap<>();
        jdbc.sql("SELECT host, event_class, count(*) AS c, max(ts) AS last FROM normalized_events WHERE host IS NOT NULL GROUP BY 1, 2").query((rs, n) -> {
            seen.computeIfAbsent(rs.getString(1), k -> new HashMap<>()).put(rs.getString(2), new Object[]{rs.getLong(3), rs.getTimestamp(4).toInstant()});
            return 0;
        }).list();
        int healthy = 0, unavailable = 0, notObserved = 0;
        List<Map<String, Object>> matrix = new ArrayList<>();
        for (String h : hosts) {
            Map<String, Object> cells = new LinkedHashMap<>();
            for (Map<String, Object> ex : expectations) {
                String cls = (String) ex.get("eventClass");
                int maxMin = (Integer) ex.get("maxSilenceMinutes");
                Object[] s = seen.getOrDefault(h, Map.of()).get(cls);
                Map<String, Object> cell = new LinkedHashMap<>();
                if (s == null) { cell.put("state", NOT_OBSERVED); cell.put("detail", "No " + cls + " events have ever been received for this host. It may be unconfigured or the class may not apply."); notObserved++; }
                else {
                    Instant last = (Instant) s[1];
                    long silentMin = Duration.between(last, now).toMinutes();
                    cell.put("count", s[0]); cell.put("lastSeen", last.toString());
                    if (silentMin > maxMin) { cell.put("state", UNAVAILABLE); cell.put("detail", "Last " + cls + " event was " + silentMin + " min ago (expected within " + maxMin + " min)."); unavailable++; }
                    else { cell.put("state", HEALTHY); cell.put("detail", "Last " + cls + " event " + silentMin + " min ago."); healthy++; }
                }
                cells.put(cls, cell);
            }
            matrix.add(Map.of("host", h, "cells", cells));
        }
        List<Map<String, Object>> sources = jdbc.sql("""
                SELECT s.id, s.name, s.source_type AS "sourceType", s.enabled, s.integration_status AS "integrationStatus",
                       CASE WHEN NOT s.enabled THEN 'NEVER_CONFIGURED' WHEN s.last_success_at IS NULL THEN 'NEVER_INGESTED'
                            WHEN now() - s.last_success_at > make_interval(secs => s.expected_interval_sec) THEN 'TEMPORARILY_UNAVAILABLE' ELSE 'OBSERVED_HEALTHY' END AS state,
                       s.last_success_at AS "lastSuccessAt"
                FROM data_sources s ORDER BY s.id""").query().listOfRows();
        int total = healthy + unavailable + notObserved;
        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("assetCount", hosts.size());
        summary.put("cells", total); summary.put("observedHealthy", healthy); summary.put("temporarilyUnavailable", unavailable); summary.put("notObserved", notObserved);
        summary.put("observedHealthyShare", total == 0 ? null : Math.round(1000.0 * healthy / total) / 10.0);
        summary.put("inputs", "Host × expected event class cells, judged against each class's maximum silence window and the current time.");
        List<String> caveats = new ArrayList<>(List.of(
                "This is the share of expected signals recently observed, NOT a security score. It cannot see hosts that send no telemetry.",
                "'Not observed' means unknown: the signal may be unconfigured, unsupported or genuinely absent.",
                "Hosts appear here only because telemetry named them; discovery is not performed."));
        if (hosts.isEmpty()) caveats.add("No telemetry has been ingested yet, so nothing can be said about coverage.");
        return Map.of("asOf", now.toString(), "expectations", expectations, "matrix", matrix, "sources", sources, "summary", summary, "caveats", caveats);
    }
}
