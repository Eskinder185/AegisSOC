package io.aegissoc.detect;

import com.fasterxml.jackson.databind.JsonNode;
import io.aegissoc.ingest.NormalizedEvent;

import java.util.*;

/**
 * Compiled, validated detection rule. The DSL is deliberately small and declarative:
 * no regular expressions, no expressions, no scripting; only equality / membership / substring / numeric comparison.
 */
public record RuleDef(
        String type,
        Filter filter,
        Filter exclude,
        List<String> groupBy,
        int windowSeconds,
        int threshold,
        Followed followedBy,
        List<Filter> steps,
        List<String> correlateOn,
        int silenceMinutes,
        int minHistory,
        String severityIfFollowed,
        boolean hypothesis,
        JsonNode raw) {

    public static final Set<String> TYPES = Set.of("match", "threshold", "sequence", "absence", "indicator_match");
    public static final Set<String> FIELDS = Set.of("event_class", "action", "outcome", "severity", "host", "username", "src_ip", "dst_ip",
            "dst_port", "domain", "process_name", "process_cmdline", "parent_process", "message", "vendor", "vendor_ref");
    public static final Set<String> NUMERIC = Set.of("severity", "dst_port");

    public record Followed(Filter filter, int withinSeconds) {}

    public record Cond(String op, List<Object> values) {
        boolean test(Object actual) {
            if (op.equals("not_in")) return actual == null || values.stream().noneMatch(v -> eq(actual, v));
            if (actual == null) return false;
            return switch (op) {
                case "eq" -> eq(actual, values.get(0));
                case "in" -> values.stream().anyMatch(v -> eq(actual, v));
                case "contains" -> actual.toString().toLowerCase().contains(values.get(0).toString().toLowerCase());
                case "contains_any" -> values.stream().anyMatch(v -> actual.toString().toLowerCase().contains(v.toString().toLowerCase()));
                case "gte" -> ((Number) actual).doubleValue() >= ((Number) values.get(0)).doubleValue();
                case "lte" -> ((Number) actual).doubleValue() <= ((Number) values.get(0)).doubleValue();
                default -> false;
            };
        }

        private static boolean eq(Object a, Object b) {
            if (a instanceof Number x && b instanceof Number y) return x.doubleValue() == y.doubleValue();
            return a.toString().equalsIgnoreCase(b.toString());
        }
    }

    public record Filter(Map<String, Cond> conds) {
        public boolean matches(NormalizedEvent e) {
            for (Map.Entry<String, Cond> c : conds.entrySet()) if (!c.getValue().test(e.field(c.getKey()))) return false;
            return true;
        }

        public boolean isEmpty() { return conds.isEmpty(); }

        public String describe() {
            if (conds.isEmpty()) return "any event";
            List<String> parts = new ArrayList<>();
            conds.forEach((f, c) -> parts.add(f + " " + switch (c.op()) {
                case "eq" -> "is " + c.values().get(0);
                case "in" -> "is one of " + c.values();
                case "not_in" -> "is not one of " + c.values();
                case "contains" -> "contains '" + c.values().get(0) + "'";
                case "contains_any" -> "contains any of " + c.values();
                case "gte" -> ">= " + c.values().get(0);
                case "lte" -> "<= " + c.values().get(0);
                default -> c.op();
            }));
            return String.join(" AND ", parts);
        }
    }

    /** Human-readable summary of exactly what this rule evaluates (shown in the alert explanation). */
    public List<String> describeConditions() {
        List<String> out = new ArrayList<>();
        switch (type) {
            case "match" -> out.add("Event matches: " + filter.describe());
            case "threshold" -> {
                out.add("Event matches: " + filter.describe());
                out.add("At least " + threshold + " such events for the same " + String.join(" + ", groupBy) + " within " + windowSeconds + " seconds");
                if (followedBy != null)
                    out.add("Escalates when a further event matching [" + followedBy.filter().describe() + "] for the same " + String.join(" + ", groupBy) + " occurs within " + followedBy.withinSeconds() + " seconds");
            }
            case "sequence" -> {
                for (int i = 0; i < steps.size(); i++) out.add("Step " + (i + 1) + ": " + steps.get(i).describe());
                out.add("Steps must share the same " + String.join(" + ", correlateOn) + " and each follow the previous within " + windowSeconds + " seconds");
            }
            case "absence" -> out.add("Source/host previously reported at least " + minHistory + " events but has been silent for more than " + silenceMinutes + " minutes relative to the newest event in the data set");
            case "indicator_match" -> out.add("Event domain / source IP / destination IP equals an active, non-allowlisted local threat indicator");
            default -> {}
        }
        if (exclude != null && !exclude.isEmpty()) out.add("Excluded when: " + exclude.describe());
        return out;
    }

    // ------------------------------------------------------------------ compile / validate

    public static class InvalidRule extends RuntimeException {
        public InvalidRule(String m) { super(m); }
    }

    private static final Set<String> TOP_KEYS = Set.of("type", "filter", "exclude", "group_by", "window_seconds", "threshold", "followed_by",
            "steps", "correlate_on", "silence_minutes", "min_history", "severity_if_followed", "hypothesis", "playbook");

    public static RuleDef compile(JsonNode d) {
        if (d == null || !d.isObject()) throw new InvalidRule("definition must be an object");
        d.fieldNames().forEachRemaining(k -> { if (!TOP_KEYS.contains(k)) throw new InvalidRule("unknown key '" + k + "' (the rule DSL is a closed schema)"); });
        String type = d.path("type").asText("");
        if (!TYPES.contains(type)) throw new InvalidRule("type must be one of " + TYPES);
        int window = intIn(d, "window_seconds", type.equals("match") ? 3600 : 300, 1, 86400);
        int threshold = intIn(d, "threshold", 1, 1, 10000);
        int silence = intIn(d, "silence_minutes", 30, 1, 10080);
        int minHist = intIn(d, "min_history", 5, 1, 1000);
        Filter filter = d.has("filter") ? filter(d.get("filter"), "filter") : new Filter(Map.of());
        Filter exclude = d.has("exclude") ? filter(d.get("exclude"), "exclude") : null;
        List<String> groupBy = fieldList(d.path("group_by"), "group_by");
        List<String> correlate = fieldList(d.path("correlate_on"), "correlate_on");
        Followed followed = null;
        if (d.has("followed_by")) {
            JsonNode f = d.get("followed_by");
            followed = new Followed(filter(f.path("filter"), "followed_by.filter"), intIn(f, "within_seconds", 600, 1, 86400));
        }
        List<Filter> steps = new ArrayList<>();
        if (d.has("steps")) {
            if (!d.get("steps").isArray() || d.get("steps").size() < 2 || d.get("steps").size() > 4) throw new InvalidRule("steps must contain 2-4 filters");
            for (JsonNode s : d.get("steps")) steps.add(filter(s, "steps"));
        }
        switch (type) {
            case "match" -> { if (filter.isEmpty()) throw new InvalidRule("match rules need a filter"); }
            case "threshold" -> {
                if (filter.isEmpty()) throw new InvalidRule("threshold rules need a filter");
                if (groupBy.isEmpty()) throw new InvalidRule("threshold rules need group_by");
                if (!d.has("threshold")) throw new InvalidRule("threshold rules need 'threshold'");
            }
            case "sequence" -> {
                if (steps.isEmpty()) throw new InvalidRule("sequence rules need steps");
                if (correlate.isEmpty()) throw new InvalidRule("sequence rules need correlate_on");
            }
            case "absence" -> { if (groupBy.isEmpty()) throw new InvalidRule("absence rules need group_by"); }
            default -> {}
        }
        return new RuleDef(type, filter, exclude, groupBy, window, threshold, followed, steps, correlate, silence, minHist,
                d.path("severity_if_followed").asText(null), d.path("hypothesis").asBoolean(false), d);
    }

    private static int intIn(JsonNode d, String k, int def, int min, int max) {
        if (!d.has(k)) return def;
        if (!d.get(k).isInt()) throw new InvalidRule(k + " must be an integer");
        int v = d.get(k).asInt();
        if (v < min || v > max) throw new InvalidRule(k + " must be between " + min + " and " + max);
        return v;
    }

    private static List<String> fieldList(JsonNode n, String name) {
        List<String> out = new ArrayList<>();
        if (n == null || n.isMissingNode()) return out;
        if (!n.isArray() || n.size() > 4) throw new InvalidRule(name + " must be an array of at most 4 fields");
        for (JsonNode f : n) {
            if (!FIELDS.contains(f.asText())) throw new InvalidRule(name + ": unknown field '" + f.asText() + "'");
            out.add(f.asText());
        }
        return out;
    }

    private static Filter filter(JsonNode n, String where) {
        if (!n.isObject()) throw new InvalidRule(where + " must be an object");
        if (n.size() > 8) throw new InvalidRule(where + " has too many conditions");
        Map<String, Cond> out = new LinkedHashMap<>();
        n.fields().forEachRemaining(e -> {
            String f = e.getKey();
            if (!FIELDS.contains(f)) throw new InvalidRule(where + ": unknown field '" + f + "'");
            JsonNode v = e.getValue();
            if (v.isValueNode()) out.put(f, new Cond("eq", List.of(scalar(f, v))));
            else if (v.isObject() && v.size() == 1) {
                String op = v.fieldNames().next();
                JsonNode arg = v.get(op);
                switch (op) {
                    case "in", "not_in", "contains_any" -> {
                        if (!arg.isArray() || arg.isEmpty() || arg.size() > 50) throw new InvalidRule(where + "." + f + "." + op + " needs a list of 1-50 values");
                        List<Object> vals = new ArrayList<>();
                        for (JsonNode x : arg) vals.add(scalar(f, x));
                        out.put(f, new Cond(op, vals));
                    }
                    case "contains" -> out.put(f, new Cond(op, List.of(scalar(f, arg))));
                    case "gte", "lte" -> {
                        if (!NUMERIC.contains(f) || !arg.isNumber()) throw new InvalidRule(where + "." + f + ": " + op + " needs a numeric field and number");
                        out.put(f, new Cond(op, List.of(arg.numberValue())));
                    }
                    default -> throw new InvalidRule(where + "." + f + ": unsupported operator '" + op + "'");
                }
            } else throw new InvalidRule(where + "." + f + ": value must be a scalar or a single-operator object");
        });
        return new Filter(out);
    }

    private static Object scalar(String field, JsonNode v) {
        if (NUMERIC.contains(field)) {
            if (!v.isNumber()) throw new InvalidRule(field + " expects a number");
            return v.numberValue();
        }
        if (!v.isTextual() || v.asText().length() > 200) throw new InvalidRule(field + " expects text up to 200 characters");
        return v.asText();
    }
}
