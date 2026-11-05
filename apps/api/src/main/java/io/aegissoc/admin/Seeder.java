package io.aegissoc.admin;

import com.fasterxml.jackson.databind.JsonNode;
import io.aegissoc.common.Json;
import io.aegissoc.detect.RuleDef;
import io.aegissoc.detect.RuleStore;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.core.io.Resource;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.util.List;

/**
 * Idempotent seed of reference data: data sources, the built-in rule catalog, synthetic threat indicators and
 * coverage expectations. Never touches event/alert/incident data.
 */
@Component
@Order(2)
public class Seeder implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(Seeder.class);
    private final JdbcClient jdbc;

    public Seeder(JdbcClient jdbc) { this.jdbc = jdbc; }

    @Override
    public void run(ApplicationArguments args) throws IOException {
        seedSources();
        seedRules();
        seedIndicators();
        seedCoverage();
    }

    private void seedSources() {
        if (count("data_sources") > 0) return;
        Object[][] rows = {
                // name, type, description, synthetic, enabled, status, interval
                {"Synthetic Fixture Replay", "fixture", "Deterministic, labelled SYNTHETIC telemetry generated inside AegisSOC. Safe to replay at any time. Powers the demo scenarios and rule tests.", true, true, "LOCAL_FIXTURE", 86400},
                {"Suricata EVE JSON import", "suricata_eve", "Import a local, exported EVE JSON file (alert, dns, http, tls, flow). Files are size- and depth-limited. No sensor connection.", false, true, "LOCAL_FIXTURE", 86400},
                {"JSON event API", "json_ingest", "Authenticated HTTP endpoint accepting normalized or vendor-shaped JSON events (POST /api/ingest/events).", false, true, "LOCAL_FIXTURE", 86400},
                {"Wazuh manager (read-only)", "wazuh", "Planned read-only connector. DISABLED: no connection has ever been attempted. Historical notes say a Wazuh deployment existed; that is unverified. Requires explicit authorization, a read-only API user and a target allowlist.", false, false, "HISTORICALLY_REPORTED", 900},
                {"AegisAI validation results", "aegisai", "Planned versioned contract for authorized test-run metadata (expected vs observed signals). AegisSOC does not depend on AegisAI.", true, false, "PLANNED", 86400},
                {"NetShield consented alerts", "netshield", "Planned import contract for consented, minimized network alerts. Not required for core SOC use.", false, false, "PLANNED", 86400},
                {"AWS CloudTrail / GuardDuty (offline JSON)", "cloud_json", "Planned offline import of exported AWS security JSON. No AWS API calls are ever made by this source.", false, false, "PLANNED", 86400}};
        for (Object[] r : rows) {
            jdbc.sql("""
                    INSERT INTO data_sources (name, source_type, description, synthetic, enabled, integration_status, expected_interval_sec, health)
                    VALUES (:n,:t,:d,:syn,:en,:st,:i, CASE WHEN :en THEN 'NEVER_INGESTED' ELSE 'DISABLED' END)""")
                    .param("n", r[0]).param("t", r[1]).param("d", r[2]).param("syn", r[3]).param("en", r[4]).param("st", r[5]).param("i", r[6]).update();
        }
        log.info("Seeded {} data sources", rows.length);
    }

    private void seedRules() throws IOException {
        if (count("detection_rules") > 0) return;
        Resource[] files = new PathMatchingResourcePatternResolver().getResources("classpath:rules/*.json");
        for (Resource f : files) {
            JsonNode r = Json.read(new String(f.getInputStream().readAllBytes(), java.nio.charset.StandardCharsets.UTF_8));
            JsonNode def = r.get("definition");
            RuleDef.compile(def); // fail fast on a bad built-in
            List<String> techniques = new java.util.ArrayList<>();
            r.path("attack").path("techniques").forEach(t -> techniques.add(t.asText()));
            jdbc.sql("""
                    INSERT INTO detection_rules (id, name, description, purpose, severity, confidence, attack_techniques, attack_justification, last_reviewed_at)
                    VALUES (:id,:n,:d,:p,:s,:c, CAST(:at AS text[]), :aj, now())""")
                    .param("id", r.get("id").asText()).param("n", r.get("name").asText()).param("d", r.get("description").asText())
                    .param("p", r.get("purpose").asText()).param("s", r.get("severity").asText()).param("c", r.get("confidence").asText())
                    .param("at", "{" + String.join(",", techniques) + "}").param("aj", r.path("attack").path("justification").asText(null)).update();
            jdbc.sql("""
                    INSERT INTO rule_versions (rule_id, version, definition, fingerprint, status, change_note, created_by, approved_by, approved_at)
                    VALUES (:id, 1, CAST(:def AS jsonb), :fp, 'APPROVED', 'Built-in rule', 'system', 'system', now())""")
                    .param("id", r.get("id").asText()).param("def", Json.write(def)).param("fp", RuleStore.fingerprint(def)).update();
        }
        log.info("Seeded {} built-in detection rules", files.length);
    }

    private void seedIndicators() {
        if (count("threat_indicators") > 0) return;
        Object[][] rows = {
                {"domain", "c2-demo.example", "synthetic-test-c2", "LOW", "AegisSOC synthetic fixture set", "Reserved .example domain used ONLY to exercise indicator matching. Not a real threat."},
                {"ip", "203.0.113.66", "synthetic-test-c2", "LOW", "AegisSOC synthetic fixture set", "RFC 5737 documentation address used ONLY to exercise indicator matching. Not a real threat."},
                {"domain", "updates.example.net", "benign-allowlist", "HIGH", "AegisSOC synthetic fixture set", "Allowlisted update host: a match here is intentionally ignored (false-positive handling demo)."}};
        for (Object[] r : rows)
            jdbc.sql("INSERT INTO threat_indicators (ioc_type, value, classification, confidence, source, description) VALUES (:t,:v,:c,:cf,:s,:d)")
                    .param("t", r[0]).param("v", r[1]).param("c", r[2]).param("cf", r[3]).param("s", r[4]).param("d", r[5]).update();
    }

    private void seedCoverage() {
        if (count("coverage_expectations") > 0) return;
        Object[][] rows = {
                {"authentication", 120, "Sign-in events (success and failure)"},
                {"process", 120, "Process creation telemetry from endpoints"},
                {"ids", 1440, "Network IDS alerts"},
                {"system", 30, "Heartbeats / system health"}};
        for (Object[] r : rows)
            jdbc.sql("INSERT INTO coverage_expectations (event_class, max_silence_minutes, description) VALUES (:c,:m,:d)").param("c", r[0]).param("m", r[1]).param("d", r[2]).update();
    }

    private long count(String table) { return jdbc.sql("SELECT count(*) FROM " + table).query(Long.class).single(); }
}
