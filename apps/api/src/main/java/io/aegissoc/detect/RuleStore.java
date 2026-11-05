package io.aegissoc.detect;

import com.fasterxml.jackson.databind.JsonNode;
import io.aegissoc.common.Json;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Optional;

/** Loads rules (catalog row + a specific version) from the database and compiles them. */
@Component
public class RuleStore {
    public record LoadedRule(String id, String name, String purpose, String severity, String confidence, boolean enabled,
                             List<String> attackTechniques, String attackJustification, int version, String status,
                             String fingerprint, JsonNode definition, RuleDef def) {}

    private final JdbcClient jdbc;

    public RuleStore(JdbcClient jdbc) { this.jdbc = jdbc; }

    public static String fingerprint(JsonNode definition) { return Json.sha256(Json.canonical(definition)).substring(0, 12); }

    public List<LoadedRule> loadActive() {
        return jdbc.sql("""
                SELECT r.id FROM detection_rules r WHERE r.enabled ORDER BY r.id""")
                .query(String.class).list().stream().map(id -> load(id, null).orElseThrow()).toList();
    }

    /** version == null -> the approved current version. */
    public Optional<LoadedRule> load(String ruleId, Integer version) {
        return jdbc.sql("""
                SELECT r.id, r.name, r.purpose, r.severity, r.confidence, r.enabled, r.attack_techniques, r.attack_justification,
                       v.version, v.status, v.fingerprint, v.definition::text AS definition
                FROM detection_rules r JOIN rule_versions v ON v.rule_id = r.id AND v.version = COALESCE(:v, r.current_version)
                WHERE r.id = :id""")
                .param("id", ruleId).param("v", version)
                .query((rs, n) -> {
                    JsonNode def = Json.read(rs.getString("definition"));
                    String[] attack = (String[]) rs.getArray("attack_techniques").getArray();
                    return new LoadedRule(rs.getString("id"), rs.getString("name"), rs.getString("purpose"), rs.getString("severity"),
                            rs.getString("confidence"), rs.getBoolean("enabled"), List.of(attack), rs.getString("attack_justification"),
                            rs.getInt("version"), rs.getString("status"), rs.getString("fingerprint"), def, RuleDef.compile(def));
                }).optional();
    }
}
