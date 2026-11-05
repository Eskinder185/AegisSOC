package io.aegissoc.ingest;

import io.aegissoc.audit.AuditService;
import io.aegissoc.auth.Actor;
import io.aegissoc.common.ApiException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.*;

/** Source registry. Network-capable connectors (Wazuh etc.) stay DISABLED and untestable until explicitly authorized. */
@RestController
@RequestMapping("/api/sources")
public class SourceController {
    private static final Set<String> LOCAL_TYPES = Set.of("fixture", "suricata_eve", "json_ingest", "cloud_json", "aegisai", "netshield");

    private final JdbcClient jdbc;
    private final AuditService audit;

    public SourceController(JdbcClient jdbc, AuditService audit) { this.jdbc = jdbc; this.audit = audit; }

    private static final String SELECT = """
            SELECT s.id, s.name, s.source_type AS "sourceType", s.description, s.synthetic, s.enabled, s.direction, s.sensitivity, s.owner,
                   s.integration_status AS "integrationStatus", s.expected_interval_sec AS "expectedIntervalSec",
                   s.last_test_at AS "lastTestAt", s.last_success_at AS "lastSuccessAt", s.last_error AS "lastError",
                   CASE
                     WHEN NOT s.enabled THEN 'DISABLED'
                     WHEN s.health IN ('FAILED','DEGRADED') THEN s.health
                     WHEN s.last_success_at IS NULL THEN 'NEVER_INGESTED'
                     WHEN now() - s.last_success_at > make_interval(secs => s.expected_interval_sec) THEN 'STALE'
                     ELSE 'HEALTHY' END AS health,
                   (SELECT count(*) FROM normalized_events n WHERE n.source_id = s.id) AS "eventCount"
            FROM data_sources s""";

    @GetMapping
    public List<Map<String, Object>> list() { return jdbc.sql(SELECT + " ORDER BY s.id").query().listOfRows(); }

    @GetMapping("/{id}")
    public Map<String, Object> get(@PathVariable long id) {
        Map<String, Object> m = new LinkedHashMap<>(jdbc.sql(SELECT + " WHERE s.id = :id").param("id", id).query().listOfRows().stream().findFirst()
                .orElseThrow(() -> ApiException.notFound("Source")));
        m.put("recentRuns", jdbc.sql("""
                SELECT id, scenario, status, started_at AS "startedAt", events_accepted AS "eventsAccepted", events_rejected AS "eventsRejected",
                       error_summary AS "errorSummary" FROM ingestion_runs WHERE source_id = :id ORDER BY id DESC LIMIT 10""").param("id", id).query().listOfRows());
        return m;
    }

    public record SourceCreate(@NotBlank @Size(max = 80) String name, @NotBlank String sourceType, @Size(max = 500) String description,
                               Boolean synthetic, Integer expectedIntervalSec, @Size(max = 40) String owner, String sensitivity) {}

    @PostMapping
    @PreAuthorize("hasRole('ADMIN')")
    public Map<String, Object> create(@Valid @RequestBody SourceCreate c) {
        if (!LOCAL_TYPES.contains(c.sourceType())) throw ApiException.bad("Unsupported local source type. Network connectors are not creatable from the API.");
        if (c.sensitivity() != null && !List.of("LOW", "MEDIUM", "HIGH").contains(c.sensitivity())) throw ApiException.bad("sensitivity must be LOW, MEDIUM or HIGH");
        try {
            long id = jdbc.sql("""
                    INSERT INTO data_sources (name, source_type, description, synthetic, expected_interval_sec, owner, sensitivity, integration_status)
                    VALUES (:n,:t,:d,:syn,:i,:o,:s,'LOCAL_FIXTURE') RETURNING id""")
                    .param("n", c.name()).param("t", c.sourceType()).param("d", c.description() == null ? "" : c.description())
                    .param("syn", c.synthetic() == null || c.synthetic()).param("i", c.expectedIntervalSec() == null ? 3600 : Math.max(60, c.expectedIntervalSec()))
                    .param("o", c.owner() == null ? "unassigned" : c.owner()).param("s", c.sensitivity() == null ? "LOW" : c.sensitivity()).query(Long.class).single();
            audit.record(Actor.name(), "source.create", "data_source", id, Map.of("name", c.name(), "type", c.sourceType()));
            return get(id);
        } catch (org.springframework.dao.DuplicateKeyException e) {
            throw ApiException.conflict("DUPLICATE_NAME", "A source with that name exists");
        }
    }

    public record SourcePatch(Boolean enabled, @Size(max = 500) String description, String owner, Integer expectedIntervalSec) {}

    @PatchMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public Map<String, Object> patch(@PathVariable long id, @Valid @RequestBody SourcePatch p) {
        Map<String, Object> cur = get(id);
        if (Boolean.TRUE.equals(p.enabled()) && Set.of("wazuh").contains(cur.get("sourceType")))
            throw ApiException.conflict("NOT_AUTHORIZED", "Live network connectors cannot be enabled in this build. See docs/security/SAFETY_BOUNDARIES.md.");
        jdbc.sql("UPDATE data_sources SET enabled = COALESCE(:e, enabled), description = COALESCE(:d, description), owner = COALESCE(:o, owner), " +
                        "expected_interval_sec = COALESCE(:i, expected_interval_sec) WHERE id = :id")
                .param("e", p.enabled()).param("d", p.description()).param("o", p.owner()).param("i", p.expectedIntervalSec()).param("id", id).update();
        audit.record(Actor.name(), "source.update", "data_source", id, Map.of("enabled", String.valueOf(p.enabled())));
        return get(id);
    }

    /** Local test: validates configuration only. Never opens a network connection. */
    @PostMapping("/{id}/test")
    @PreAuthorize("hasRole('ANALYST')")
    public Map<String, Object> test(@PathVariable long id) {
        Map<String, Object> s = get(id);
        String type = (String) s.get("sourceType");
        boolean local = Set.of("fixture", "suricata_eve", "json_ingest").contains(type);
        String result = local
                ? "Configuration valid. This is a local source: it is exercised by importing data, not by a network connection. Health becomes HEALTHY only after a successful ingestion run."
                : "Not configured. No connection was attempted. Network and cloud connectors are disabled by default and require explicit authorization (see docs/security/SAFETY_BOUNDARIES.md).";
        jdbc.sql("UPDATE data_sources SET last_test_at = now() WHERE id = :id").param("id", id).update();
        audit.record(Actor.name(), "source.test", "data_source", id, Map.of("local", local));
        return Map.of("sourceId", id, "networkAttempted", false, "configured", local, "result", result);
    }
}
