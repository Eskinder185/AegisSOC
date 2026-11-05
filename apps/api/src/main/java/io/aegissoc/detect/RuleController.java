package io.aegissoc.detect;

import com.fasterxml.jackson.databind.JsonNode;
import io.aegissoc.audit.AuditService;
import io.aegissoc.auth.Actor;
import io.aegissoc.common.ApiException;
import io.aegissoc.common.Json;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@RequestMapping("/api/rules")
public class RuleController {
    private final JdbcClient jdbc;
    private final RuleStore store;
    private final RuleTestService tests;
    private final AuditService audit;

    public RuleController(JdbcClient jdbc, RuleStore store, RuleTestService tests, AuditService audit) {
        this.jdbc = jdbc; this.store = store; this.tests = tests; this.audit = audit;
    }

    @GetMapping
    public List<Map<String, Object>> list() {
        return jdbc.sql("""
                SELECT r.id, r.name, r.purpose, r.severity, r.confidence, r.enabled, r.owner, r.current_version AS "currentVersion",
                       r.last_reviewed_at AS "lastReviewedAt", r.attack_techniques AS "attackTechniques",
                       (SELECT count(*) FROM alerts a WHERE a.rule_id = r.id) AS "alertCount",
                       (SELECT count(*) FROM alerts a WHERE a.rule_id = r.id AND a.classification = 'BENIGN') AS "benignCount",
                       (SELECT count(*) FROM rule_versions v WHERE v.rule_id = r.id AND v.status = 'DRAFT') AS "draftCount",
                       (SELECT row_to_json(t) FROM (SELECT tp, fp, fn, tn, run_at AS "runAt", version FROM rule_test_runs x WHERE x.rule_id = r.id ORDER BY x.id DESC LIMIT 1) t) AS "lastTest"
                FROM detection_rules r ORDER BY r.id""")
                .query((rs, n) -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", rs.getString("id")); m.put("name", rs.getString("name")); m.put("purpose", rs.getString("purpose"));
                    m.put("severity", rs.getString("severity")); m.put("confidence", rs.getString("confidence")); m.put("enabled", rs.getBoolean("enabled"));
                    m.put("owner", rs.getString("owner")); m.put("currentVersion", rs.getInt("currentVersion"));
                    m.put("lastReviewedAt", rs.getTimestamp("lastReviewedAt") == null ? null : rs.getTimestamp("lastReviewedAt").toInstant().toString());
                    try { m.put("attackTechniques", (Object[]) rs.getArray("attackTechniques").getArray()); } catch (Exception e) { m.put("attackTechniques", new Object[0]); }
                    m.put("alertCount", rs.getLong("alertCount")); m.put("benignCount", rs.getLong("benignCount")); m.put("draftCount", rs.getLong("draftCount"));
                    String lt = rs.getString("lastTest");
                    m.put("lastTest", lt == null ? null : Json.read(lt));
                    return m;
                }).list();
    }

    @GetMapping("/{id}")
    public Map<String, Object> get(@PathVariable String id) {
        RuleStore.LoadedRule r = store.load(id, null).orElseThrow(() -> ApiException.notFound("Rule"));
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", r.id()); m.put("name", r.name()); m.put("purpose", r.purpose()); m.put("severity", r.severity()); m.put("confidence", r.confidence());
        m.put("enabled", r.enabled()); m.put("currentVersion", r.version()); m.put("fingerprint", r.fingerprint());
        m.put("attackTechniques", r.attackTechniques()); m.put("attackJustification", r.attackJustification());
        m.put("definition", r.definition());
        m.put("conditions", r.def().describeConditions());
        m.put("versions", jdbc.sql("""
                SELECT version, status, fingerprint, change_note AS "changeNote", created_by AS "createdBy", created_at AS "createdAt",
                       approved_by AS "approvedBy", approved_at AS "approvedAt", definition::text AS definition
                FROM rule_versions WHERE rule_id = :id ORDER BY version DESC""").param("id", id)
                .query((rs, n) -> {
                    Map<String, Object> v = new LinkedHashMap<>();
                    v.put("version", rs.getInt("version")); v.put("status", rs.getString("status")); v.put("fingerprint", rs.getString("fingerprint"));
                    v.put("changeNote", rs.getString("changeNote")); v.put("createdBy", rs.getString("createdBy"));
                    v.put("createdAt", rs.getTimestamp("createdAt").toInstant().toString());
                    v.put("approvedBy", rs.getString("approvedBy"));
                    v.put("approvedAt", rs.getTimestamp("approvedAt") == null ? null : rs.getTimestamp("approvedAt").toInstant().toString());
                    v.put("definition", Json.read(rs.getString("definition")));
                    return v;
                }).list());
        m.put("testRuns", jdbc.sql("""
                SELECT id, version, fingerprint, tp, fp, fn, tn, run_by AS "runBy", run_at AS "runAt" FROM rule_test_runs
                WHERE rule_id = :id ORDER BY id DESC LIMIT 20""").param("id", id).query().listOfRows());
        return m;
    }

    public record EnableBody(@NotNull Boolean enabled, @Size(max = 300) String reason) {}

    @PatchMapping("/{id}")
    @PreAuthorize("hasRole('DETECTION_ENGINEER')")
    public Map<String, Object> enable(@PathVariable String id, @RequestBody EnableBody b) {
        if (!b.enabled() && (b.reason() == null || b.reason().isBlank())) throw ApiException.bad("A reason is required to disable a detection");
        int n = jdbc.sql("UPDATE detection_rules SET enabled = :e WHERE id = :id").param("e", b.enabled()).param("id", id).update();
        if (n == 0) throw ApiException.notFound("Rule");
        audit.record(Actor.name(), b.enabled() ? "rule.enable" : "rule.disable", "rule", id, Map.of("reason", String.valueOf(b.reason())));
        return Map.of("id", id, "enabled", b.enabled());
    }

    public record DraftBody(@NotNull JsonNode definition, @Size(max = 400) String changeNote) {}

    @PostMapping("/{id}/versions")
    @PreAuthorize("hasRole('DETECTION_ENGINEER')")
    @Transactional
    public Map<String, Object> draft(@PathVariable String id, @RequestBody DraftBody b) {
        store.load(id, null).orElseThrow(() -> ApiException.notFound("Rule"));
        try { RuleDef.compile(b.definition()); }
        catch (RuleDef.InvalidRule e) { throw ApiException.unprocessable("INVALID_RULE", e.getMessage()); }
        int next = jdbc.sql("SELECT COALESCE(MAX(version),0)+1 FROM rule_versions WHERE rule_id = :id").param("id", id).query(Integer.class).single();
        jdbc.sql("""
                INSERT INTO rule_versions (rule_id, version, definition, fingerprint, status, change_note, created_by)
                VALUES (:id, :v, CAST(:d AS jsonb), :fp, 'DRAFT', :n, :by)""")
                .param("id", id).param("v", next).param("d", Json.write(b.definition())).param("fp", RuleStore.fingerprint(b.definition()))
                .param("n", b.changeNote()).param("by", Actor.name()).update();
        audit.record(Actor.name(), "rule.draft", "rule", id, Map.of("version", next));
        return Map.of("ruleId", id, "version", next, "status", "DRAFT");
    }

    @PostMapping("/{id}/versions/{version}/test")
    @PreAuthorize("hasRole('DETECTION_ENGINEER')")
    public Map<String, Object> test(@PathVariable String id, @PathVariable int version) {
        Map<String, Object> r = tests.runAndRecord(id, version, Actor.name());
        audit.record(Actor.name(), "rule.test", "rule", id, Map.of("version", version, "tp", r.get("truePositives"), "fp", r.get("falsePositives"), "fn", r.get("missed")));
        return r;
    }

    /** Side-by-side comparison of two versions on the same labelled suite. */
    @GetMapping("/{id}/compare")
    public Map<String, Object> compare(@PathVariable String id, @RequestParam int a, @RequestParam int b) {
        Map<String, Object> ra = score(id, a), rb = score(id, b);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("a", ra); out.put("b", rb);
        out.put("caveat", RuleTestService.CAVEAT);
        return out;
    }

    private Map<String, Object> score(String id, int version) {
        RuleStore.LoadedRule r = store.load(id, version).orElseThrow(() -> ApiException.notFound("Rule version " + version));
        RuleTestService.Score s = tests.score(id, r.definition());
        return RuleTestService.view(0, id, version, r.fingerprint(), s);
    }

    public record DecisionBody(@Size(max = 400) String comment) {}

    /** Approval requires: DETECTION_ENGINEER role, a different person than the author, and a test run on this exact fingerprint. */
    @PostMapping("/{id}/versions/{version}/approve")
    @PreAuthorize("hasRole('DETECTION_ENGINEER')")
    @Transactional
    public Map<String, Object> approve(@PathVariable String id, @PathVariable int version, @RequestBody(required = false) DecisionBody body) {
        Map<String, Object> v = jdbc.sql("SELECT status, created_by, fingerprint FROM rule_versions WHERE rule_id=:id AND version=:v FOR UPDATE")
                .param("id", id).param("v", version).query().listOfRows().stream().findFirst().orElseThrow(() -> ApiException.notFound("Rule version"));
        if (!"DRAFT".equals(v.get("status"))) throw ApiException.conflict("NOT_DRAFT", "Only DRAFT versions can be approved");
        if (Actor.name().equals(v.get("created_by"))) throw ApiException.forbidden("Rule changes need review by a different person than the author");
        long tested = jdbc.sql("SELECT count(*) FROM rule_test_runs WHERE rule_id=:id AND version=:v AND fingerprint=:f")
                .param("id", id).param("v", version).param("f", v.get("fingerprint")).query(Long.class).single();
        if (tested == 0) throw ApiException.conflict("TEST_REQUIRED", "Run the labelled test suite on this exact version before approving it");
        jdbc.sql("UPDATE rule_versions SET status='SUPERSEDED' WHERE rule_id=:id AND status='APPROVED'").param("id", id).update();
        jdbc.sql("UPDATE rule_versions SET status='APPROVED', approved_by=:by, approved_at=now() WHERE rule_id=:id AND version=:v")
                .param("by", Actor.name()).param("id", id).param("v", version).update();
        jdbc.sql("UPDATE detection_rules SET current_version=:v, last_reviewed_at=now() WHERE id=:id").param("v", version).param("id", id).update();
        audit.record(Actor.name(), "rule.approve", "rule", id, Map.of("version", version, "comment", body == null ? "" : String.valueOf(body.comment()),
                "note", "Approved locally in AegisSOC only; not deployed to Wazuh/Suricata"));
        return Map.of("ruleId", id, "currentVersion", version, "deployedToExternalSystems", false);
    }

    @PostMapping("/{id}/versions/{version}/reject")
    @PreAuthorize("hasRole('DETECTION_ENGINEER')")
    public Map<String, Object> reject(@PathVariable String id, @PathVariable int version, @RequestBody(required = false) DecisionBody body) {
        int n = jdbc.sql("UPDATE rule_versions SET status='REJECTED', approved_by=:by, approved_at=now() WHERE rule_id=:id AND version=:v AND status='DRAFT'")
                .param("by", Actor.name()).param("id", id).param("v", version).update();
        if (n == 0) throw ApiException.conflict("NOT_DRAFT", "Only DRAFT versions can be rejected");
        audit.record(Actor.name(), "rule.reject", "rule", id, Map.of("version", version, "comment", body == null ? "" : String.valueOf(body.comment())));
        return Map.of("ruleId", id, "version", version, "status", "REJECTED");
    }
}
