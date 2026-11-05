package io.aegissoc.detect;

import com.fasterxml.jackson.databind.JsonNode;
import io.aegissoc.common.Json;
import io.aegissoc.ingest.Fixtures;
import io.aegissoc.ingest.Normalizer;
import io.aegissoc.ingest.NormalizedEvent;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

import java.util.*;

/**
 * Replays the labelled synthetic regression suite against a rule definition and scores it.
 * Scores describe performance on THIS small synthetic suite only; they are not evidence of real-world accuracy.
 */
@Service
public class RuleTestService {
    public static final String SUITE = "core-v1";
    public static final String CAVEAT = "Measured on a small, hand-labelled SYNTHETIC suite (" + SUITE + "). It shows whether the rule behaves as designed on these cases; "
            + "it is not validated real-world detection effectiveness.";

    private final JdbcClient jdbc;
    private final DetectionService detection;

    public RuleTestService(JdbcClient jdbc, DetectionService detection) { this.jdbc = jdbc; this.detection = detection; }

    public record Score(int tp, int fp, int fn, int tn, Map<String, Object> details) {
        public Double sensitivity() { return tp + fn == 0 ? null : (double) tp / (tp + fn); }
        public Double precision() { return tp + fp == 0 ? null : (double) tp / (tp + fp); }
    }

    public Score score(String ruleId, JsonNode definition) {
        RuleDef def = RuleDef.compile(definition);
        List<RuleEngine.Indicator> iocs = detection.indicators();
        int tp = 0, fp = 0, fn = 0, tn = 0;
        List<Map<String, Object>> perScenario = new ArrayList<>();
        for (Fixtures.Scenario sc : Fixtures.testSuite()) {
            List<NormalizedEvent> evs = new ArrayList<>();
            long id = 1;
            for (JsonNode raw : sc.events()) evs.add(Normalizer.parse(raw, true, 4096).withId(id++));
            Set<String> produced = new TreeSet<>();
            for (RuleEngine.Candidate c : RuleEngine.evaluate(def, evs, iocs)) produced.add(c.key());
            Set<String> expected = keys(sc.positives(), ruleId);
            Set<String> negatives = keys(sc.negatives(), ruleId);
            Set<String> tpK = new TreeSet<>(produced); tpK.retainAll(expected);
            Set<String> fpK = new TreeSet<>(produced); fpK.removeAll(expected);
            Set<String> fnK = new TreeSet<>(expected); fnK.removeAll(produced);
            Set<String> tnK = new TreeSet<>(negatives); tnK.removeAll(produced);
            tp += tpK.size(); fp += fpK.size(); fn += fnK.size(); tn += tnK.size();
            if (!(expected.isEmpty() && negatives.isEmpty() && produced.isEmpty())) {
                Map<String, Object> s = new LinkedHashMap<>();
                s.put("scenario", sc.id()); s.put("title", sc.title());
                s.put("truePositives", tpK); s.put("falsePositives", fpK); s.put("missed", fnK); s.put("trueNegatives", tnK);
                perScenario.add(s);
            }
        }
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("suite", SUITE);
        details.put("scenarios", perScenario);
        details.put("caveat", CAVEAT);
        return new Score(tp, fp, fn, tn, details);
    }

    public Map<String, Object> runAndRecord(String ruleId, int version, String actor) {
        RuleStore.LoadedRule r = new RuleStore(jdbc).load(ruleId, version).orElseThrow(() -> io.aegissoc.common.ApiException.notFound("Rule version"));
        Score s = score(ruleId, r.definition());
        long id = jdbc.sql("""
                INSERT INTO rule_test_runs (rule_id, version, fingerprint, fixture_set, tp, fp, fn, tn, details, run_by)
                VALUES (:r,:v,:f,:fs,:tp,:fp,:fn,:tn,CAST(:d AS jsonb),:by) RETURNING id""")
                .param("r", ruleId).param("v", version).param("f", r.fingerprint()).param("fs", SUITE).param("tp", s.tp()).param("fp", s.fp())
                .param("fn", s.fn()).param("tn", s.tn()).param("d", Json.write(s.details())).param("by", actor).query(Long.class).single();
        return view(id, ruleId, version, r.fingerprint(), s);
    }

    public static Map<String, Object> view(long id, String ruleId, int version, String fingerprint, Score s) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", id); m.put("ruleId", ruleId); m.put("version", version); m.put("fingerprint", fingerprint); m.put("suite", SUITE);
        m.put("truePositives", s.tp()); m.put("falsePositives", s.fp()); m.put("missed", s.fn()); m.put("trueNegatives", s.tn());
        m.put("sensitivity", s.sensitivity()); m.put("precision", s.precision());
        m.put("details", s.details());
        m.put("caveat", CAVEAT);
        return m;
    }

    private static Set<String> keys(List<Fixtures.Expectation> l, String ruleId) {
        Set<String> out = new TreeSet<>();
        for (Fixtures.Expectation e : l) if (e.ruleId().equals(ruleId)) out.add(e.key());
        return out;
    }
}
