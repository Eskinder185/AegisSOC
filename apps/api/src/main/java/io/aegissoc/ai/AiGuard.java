package io.aegissoc.ai;

import com.fasterxml.jackson.databind.JsonNode;
import io.aegissoc.common.Json;

import java.util.*;
import java.util.regex.Pattern;

/**
 * Validates model output BEFORE it can reach an analyst. The model is untrusted: it may hallucinate event ids, overstate
 * certainty, propose unsafe steps, claim actions it cannot perform, echo secrets, or have been steered by log text.
 */
public final class AiGuard {
    public static final String SYSTEM_MARKER = "AEGIS-SYSTEM-PROMPT-7f3a";

    public static class Rejected extends RuntimeException {
        public Rejected(String m) { super(m); }
    }

    public record Validated(String summary, List<Map<String, Object>> claims, List<String> nextSteps, List<String> uncertainty, boolean insufficientEvidence) {}

    private static final Set<String> KEYS = Set.of("summary", "claims", "nextSteps", "uncertainty", "insufficientEvidence");
    private static final Pattern CERTAINTY = Pattern.compile("\\b(definitely|certainly|undoubtedly|without (a )?doubt|100 ?%|proves?|proof that|confirmed (breach|compromise|attack|attacker)|has been (hacked|breached)|is (definitely |certainly )?compromised|attacker has been)\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern CLAIMED_ACTION = Pattern.compile("\\b(i have|i've|has been|have been|was|were) (now )?(blocked|isolated|disabled|quarantined|deleted|terminated|reset|contained|remediated)\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern UNSAFE_STEP = Pattern.compile("(turn(ing)? off|disable|stop|shut ?down|uninstall|delete|clear|wipe)\\s+(the\\s+|all\\s+)?(firewall|antivirus|edr|audit(ing)?( log(s|ging)?)?|logging|logs|security (tool|agent|service)s?|sensor)|rm\\s+-rf|format\\s+(c:|the disk)|curl[^|]*\\|\\s*(ba)?sh|chmod\\s+777", Pattern.CASE_INSENSITIVE);
    private static final Pattern SECRET = Pattern.compile("password\\s*[:=]\\s*\\S+|api[_-]?key\\s*[:=]\\s*\\S+|secret\\s*[:=]\\s*\\S+|AEGIS-SYSTEM-PROMPT", Pattern.CASE_INSENSITIVE);
    public static final Pattern INJECTION_IN_INPUT = Pattern.compile("(ignore|disregard|forget)\\s+(all\\s+)?(the\\s+)?(previous|prior|above|earlier)\\s+(instructions|rules|prompts?)|system prompt|you are now|new instructions|act as (an? )?(admin|root)|reveal your|<\\s*/?\\s*(system|assistant)\\s*>", Pattern.CASE_INSENSITIVE);

    private AiGuard() {}

    public static boolean looksLikeInjection(String s) { return s != null && INJECTION_IN_INPUT.matcher(s).find(); }

    public static Validated validate(String raw, Set<Long> allowedEventIds, Collection<String> secrets) {
        if (raw == null || raw.isBlank()) throw new Rejected("empty model output");
        if (raw.length() > 20000) throw new Rejected("model output too large");
        JsonNode n;
        try { n = Json.SAFE.readTree(raw); } catch (Exception e) { throw new Rejected("output is not valid JSON"); }
        if (n == null || !n.isObject()) throw new Rejected("output is not a JSON object");
        for (Iterator<String> it = n.fieldNames(); it.hasNext(); ) {
            String k = it.next();
            if (!KEYS.contains(k)) throw new Rejected("unsupported field '" + k + "' (tool calls and actions are not accepted)");
        }
        String summary = text(n, "summary", 1200, true);
        boolean insufficient = n.path("insufficientEvidence").asBoolean(false);
        List<Map<String, Object>> claims = new ArrayList<>();
        JsonNode cs = n.path("claims");
        if (!cs.isMissingNode() && !cs.isArray()) throw new Rejected("claims must be an array");
        if (cs.size() > 10) throw new Rejected("too many claims");
        for (JsonNode c : cs) {
            String t = text(c, "text", 400, true);
            JsonNode ids = c.path("eventIds");
            if (!ids.isArray() || ids.isEmpty()) throw new Rejected("a claim cites no evidence");
            List<Long> cited = new ArrayList<>();
            for (JsonNode id : ids) {
                if (!id.canConvertToLong() || !allowedEventIds.contains(id.asLong())) throw new Rejected("claim cites event id " + id.asText() + " that was not in the evidence supplied");
                cited.add(id.asLong());
            }
            claims.add(Map.of("text", t, "eventIds", cited));
        }
        if (allowedEventIds.isEmpty() && (!insufficient || !claims.isEmpty()))
            throw new Rejected("no evidence was supplied, so the only acceptable answer is 'insufficient evidence'");
        List<String> next = strings(n.path("nextSteps"), 8, 300);
        List<String> unc = strings(n.path("uncertainty"), 8, 300);
        List<String> all = new ArrayList<>(List.of(summary));
        claims.forEach(c -> all.add((String) c.get("text")));
        all.addAll(next); all.addAll(unc);
        for (String s : all) {
            if (CERTAINTY.matcher(s).find()) throw new Rejected("inappropriate certainty: \"" + excerpt(s) + "\"");
            if (CLAIMED_ACTION.matcher(s).find()) throw new Rejected("claims an action was performed; the assistant cannot act");
            if (SECRET.matcher(s).find()) throw new Rejected("output contains secret-like or system-prompt content");
            for (String sec : secrets) if (sec != null && sec.length() >= 6 && s.contains(sec)) throw new Rejected("output contains a configured secret");
        }
        for (String s : next) if (UNSAFE_STEP.matcher(s).find()) throw new Rejected("unsafe remediation suggestion: \"" + excerpt(s) + "\"");
        return new Validated(summary, claims, next, unc, insufficient);
    }

    private static String text(JsonNode n, String f, int max, boolean required) {
        JsonNode v = n.path(f);
        if (!v.isTextual()) { if (required) throw new Rejected("missing text field '" + f + "'"); return ""; }
        if (v.asText().length() > max) throw new Rejected("field '" + f + "' too long");
        return v.asText();
    }

    private static List<String> strings(JsonNode a, int maxItems, int maxLen) {
        if (a.isMissingNode()) return List.of();
        if (!a.isArray() || a.size() > maxItems) throw new Rejected("expected a short array of strings");
        List<String> out = new ArrayList<>();
        for (JsonNode s : a) { if (!s.isTextual() || s.asText().length() > maxLen) throw new Rejected("array item must be short text"); out.add(s.asText()); }
        return out;
    }

    private static String excerpt(String s) { return s.length() > 60 ? s.substring(0, 60) + "…" : s; }
}
