package io.aegissoc.detect;

import com.fasterxml.jackson.databind.JsonNode;
import io.aegissoc.ingest.NormalizedEvent;

import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Deterministic explanation engine: turns a rule + its playbook + the exact candidate into the six-question
 * explanation (what / why / how sure / evidence / next / how to verify). No AI involved; no facts beyond the data.
 */
public final class ExplanationBuilder {
    private static final Pattern PLACEHOLDER = Pattern.compile("\\{([A-Za-z_]+)}");

    private ExplanationBuilder() {}

    public static Map<String, Object> build(RuleStore.LoadedRule rule, RuleEngine.Candidate c, boolean synthetic) {
        JsonNode pb = rule.definition().path("playbook");
        Map<String, Object> vals = new LinkedHashMap<>();
        vals.put("username", "this account"); vals.put("host", "this host"); vals.put("src_ip", "this address"); vals.put("dst_ip", "the destination");
        vals.putAll(c.entity());
        vals.putAll(c.inputs());
        vals.put("first", c.first().toString());
        vals.put("last", c.last().toString());

        List<String> uncertainty = new ArrayList<>();
        if (rule.def().hypothesis()) uncertainty.add("This alert is a HYPOTHESIS assembled from separate events linked by address/account and timing. It is not a finding.");
        if (synthetic) uncertainty.add("All underlying events are SYNTHETIC fixtures, not real activity.");
        uncertainty.add("Coverage: only the sources configured in AegisSOC were evaluated; other activity is not visible.");
        if (c.escalated()) uncertainty.add("Severity was raised because a follow-up event matched; the follow-up could still be the legitimate user.");

        Map<String, Object> simple = new LinkedHashMap<>();
        String what = fill(pb.path("what").asText(rule.name()), vals);
        if (c.escalated() && pb.has("followedText")) what += " " + fill(pb.get("followedText").asText(), vals);
        simple.put("what", what);
        simple.put("why", fill(pb.path("why").asText(""), vals));
        simple.put("howSure", fill(pb.path("howSure").asText(""), vals) + " Confidence guidance for this rule: " + rule.confidence() + ".");
        simple.put("next", list(pb.path("next"), vals));
        simple.put("verify", list(pb.path("verify"), vals));
        simple.put("alternatives", list(pb.path("alternatives"), vals));

        Map<String, Object> analyst = new LinkedHashMap<>();
        analyst.put("entity", c.entity());
        analyst.put("attack", Map.of("techniques", rule.attackTechniques(), "justification", String.valueOf(rule.attackJustification())));
        analyst.put("firstEvent", c.first().toString());
        analyst.put("lastEvent", c.last().toString());

        Map<String, Object> ex = new LinkedHashMap<>();
        ex.put("ruleId", rule.id());
        ex.put("ruleName", rule.name());
        ex.put("ruleVersion", rule.version());
        ex.put("ruleFingerprint", rule.fingerprint());
        ex.put("hypothesis", rule.def().hypothesis());
        ex.put("conditions", rule.def().describeConditions());
        ex.put("groupKey", c.key());
        ex.put("inputs", c.inputs());
        ex.put("matchedEventIds", c.matched().stream().map(NormalizedEvent::id).toList());
        ex.put("contextEventIds", c.context().stream().map(NormalizedEvent::id).toList());
        ex.put("simple", simple);
        ex.put("analyst", analyst);
        ex.put("uncertainty", uncertainty);
        ex.put("synthetic", synthetic);
        return ex;
    }

    public static String title(RuleStore.LoadedRule rule, RuleEngine.Candidate c) {
        String who = String.join(" · ", c.entity().values().stream().limit(2).toList());
        return who.isBlank() ? rule.name() : rule.name() + " — " + who;
    }

    private static List<String> list(JsonNode arr, Map<String, Object> vals) {
        List<String> out = new ArrayList<>();
        if (arr.isArray()) for (JsonNode n : arr) out.add(fill(n.asText(), vals));
        return out;
    }

    /** Safe substitution: only {identifier} tokens are replaced, only with plain strings. */
    static String fill(String template, Map<String, Object> vals) {
        Matcher m = PLACEHOLDER.matcher(template);
        StringBuilder sb = new StringBuilder();
        while (m.find()) {
            Object v = vals.get(m.group(1));
            m.appendReplacement(sb, Matcher.quoteReplacement(v == null ? "(unknown)" : String.valueOf(v)));
        }
        m.appendTail(sb);
        return sb.toString();
    }
}
