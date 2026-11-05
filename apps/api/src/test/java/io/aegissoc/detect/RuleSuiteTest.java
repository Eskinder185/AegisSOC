package io.aegissoc.detect;

import com.fasterxml.jackson.databind.JsonNode;
import io.aegissoc.common.Json;
import io.aegissoc.ingest.Fixtures;
import io.aegissoc.ingest.NormalizedEvent;
import io.aegissoc.ingest.Normalizer;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;

import java.io.IOException;
import java.time.Instant;
import java.util.*;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Pure unit tests (no DB): every built-in rule must hit every labelled positive and none of the labelled negatives. */
class RuleSuiteTest {
    static final List<RuleEngine.Indicator> IOCS = List.of(
            new RuleEngine.Indicator("domain", "c2-demo.example", "synthetic-test-c2", "LOW", null),
            new RuleEngine.Indicator("ip", "203.0.113.66", "synthetic-test-c2", "LOW", null),
            new RuleEngine.Indicator("domain", "updates.example.net", "benign-allowlist", "HIGH", null));

    static Map<String, JsonNode> builtIns() throws IOException {
        Map<String, JsonNode> out = new TreeMap<>();
        for (Resource r : new PathMatchingResourcePatternResolver().getResources("classpath:rules/*.json")) {
            JsonNode n = Json.read(new String(r.getInputStream().readAllBytes()));
            out.put(n.get("id").asText(), n.get("definition"));
        }
        return out;
    }

    static List<NormalizedEvent> normalize(Fixtures.Scenario sc) {
        List<NormalizedEvent> out = new ArrayList<>();
        long id = 1;
        for (JsonNode raw : sc.events()) out.add(Normalizer.parse(raw, true, 4096).withId(id++));
        return out;
    }

    static Set<String> produced(JsonNode def, Fixtures.Scenario sc) {
        Set<String> keys = new TreeSet<>();
        for (RuleEngine.Candidate c : RuleEngine.evaluate(RuleDef.compile(def), normalize(sc), IOCS)) keys.add(c.key());
        return keys;
    }

    @Test
    void nineBuiltInRulesExist() throws IOException {
        assertThat(builtIns()).hasSize(9);
    }

    @Test
    void everyBuiltInRuleMatchesAllLabelledPositivesAndNoFalsePositives() throws IOException {
        Map<String, JsonNode> rules = builtIns();
        int totalPositives = 0;
        for (Fixtures.Scenario sc : Fixtures.testSuite()) {
            for (Map.Entry<String, JsonNode> r : rules.entrySet()) {
                Set<String> expected = new TreeSet<>();
                sc.positives().stream().filter(p -> p.ruleId().equals(r.getKey())).forEach(p -> expected.add(p.key()));
                Set<String> neg = new TreeSet<>();
                sc.negatives().stream().filter(p -> p.ruleId().equals(r.getKey())).forEach(p -> neg.add(p.key()));
                Set<String> got = produced(r.getValue(), sc);
                assertThat(got).as("rule %s in scenario %s", r.getKey(), sc.id()).isEqualTo(expected);
                for (String n : neg) assertThat(got).as("negative %s of %s in %s must not alert", n, r.getKey(), sc.id()).doesNotContain(n);
                totalPositives += expected.size();
            }
        }
        assertThat(totalPositives).isGreaterThanOrEqualTo(12);
    }

    @Test
    void fixturesAreDeterministic() {
        Instant a = Instant.parse("2026-03-01T00:00:00Z");
        for (Fixtures.Meta m : Fixtures.CATALOG) {
            String one = Json.write(Fixtures.generate(m.id(), 7, a, false).events());
            String two = Json.write(Fixtures.generate(m.id(), 7, a, false).events());
            assertThat(one).as(m.id()).isEqualTo(two);
        }
        assertThat(Json.write(Fixtures.generate("benign_baseline", 7, a, false).events()))
                .isNotEqualTo(Json.write(Fixtures.generate("benign_baseline", 8, a, false).events()));
    }

    @Test
    void benignBaselineProducesNoAlertsFromAnyRule() throws IOException {
        Fixtures.Scenario sc = Fixtures.generate("benign_baseline", 42, Fixtures.TEST_ANCHOR, false);
        for (Map.Entry<String, JsonNode> r : builtIns().entrySet())
            assertThat(produced(r.getValue(), sc)).as(r.getKey()).isEmpty();
    }

    @Test
    void lowerThresholdCreatesFalsePositiveAndHigherThresholdMissesAttack() throws IOException {
        Fixtures.Scenario sc = Fixtures.generate("credential_attack", 42, Fixtures.TEST_ANCHOR, false);
        com.fasterxml.jackson.databind.node.ObjectNode def = builtIns().get("AEG-AUTH-001").deepCopy();
        def.put("threshold", 3);
        assertThat(produced(def, sc)).contains("jdoe|198.51.100.23", "alice|10.20.0.31");   // false positive appears
        def.put("threshold", 8);
        assertThat(produced(def, sc)).doesNotContain("jdoe|198.51.100.23");                 // attack missed
    }

    @Test
    void bruteForceFollowedBySuccessIsEscalated() throws IOException {
        Fixtures.Scenario sc = Fixtures.generate("credential_attack", 42, Fixtures.TEST_ANCHOR, false);
        List<RuleEngine.Candidate> c = RuleEngine.evaluate(RuleDef.compile(builtIns().get("AEG-AUTH-001")), normalize(sc), IOCS);
        assertThat(c).hasSize(1);
        assertThat(c.get(0).escalated()).isTrue();
        assertThat(c.get(0).matched()).hasSize(7);
        assertThat(c.get(0).context()).hasSize(1);
    }

    @Test
    void silenceRuleDistinguishesSilentFromInsufficientHistory() throws IOException {
        Fixtures.Scenario sc = Fixtures.generate("sensor_silence", 42, Fixtures.TEST_ANCHOR, false);
        assertThat(produced(builtIns().get("AEG-SENS-001"), sc)).containsExactly("fw-edge-01");
    }

    // ---------------- DSL safety
    @Test
    void ruleDslRejectsUnknownKeysFieldsAndOperators() {
        assertThatThrownBy(() -> RuleDef.compile(Json.read("{\"type\":\"match\",\"filter\":{\"event_class\":\"x\"},\"script\":\"rm -rf\"}"))).hasMessageContaining("unknown key");
        assertThatThrownBy(() -> RuleDef.compile(Json.read("{\"type\":\"match\",\"filter\":{\"nope\":\"x\"}}"))).hasMessageContaining("unknown field");
        assertThatThrownBy(() -> RuleDef.compile(Json.read("{\"type\":\"match\",\"filter\":{\"message\":{\"regex\":\"(a+)+$\"}}}"))).hasMessageContaining("unsupported operator");
        assertThatThrownBy(() -> RuleDef.compile(Json.read("{\"type\":\"threshold\",\"filter\":{\"event_class\":\"x\"},\"group_by\":[\"host\"],\"threshold\":99999}"))).hasMessageContaining("between");
        assertThatThrownBy(() -> RuleDef.compile(Json.read("{\"type\":\"exec\"}"))).hasMessageContaining("type must be");
    }
}
