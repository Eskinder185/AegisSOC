package io.aegissoc.detect;

import io.aegissoc.ingest.NormalizedEvent;

import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Pure, deterministic evaluation of compiled rules over an in-memory event list. No I/O, no clock, no randomness:
 * the same events always produce the same candidates (which is what makes alert dedupe and rule tests reliable).
 */
public final class RuleEngine {
    public record Indicator(String type, String value, String classification, String confidence, Instant expiresAt) {}

    /** A would-be alert. {@code key} is the group key used for dedupe and test expectations. */
    public record Candidate(String key, Map<String, String> entity, List<NormalizedEvent> matched, List<NormalizedEvent> context,
                            Instant first, Instant last, boolean escalated, Map<String, Object> inputs) {
        public List<NormalizedEvent> allEvidence() {
            List<NormalizedEvent> all = new ArrayList<>(matched);
            all.addAll(context);
            return all;
        }
    }

    private RuleEngine() {}

    public static List<Candidate> evaluate(RuleDef r, List<NormalizedEvent> events, List<Indicator> indicators) {
        List<NormalizedEvent> usable = events.stream().filter(e -> r.exclude() == null || r.exclude().isEmpty() || !r.exclude().matches(e))
                .sorted(Comparator.comparing(NormalizedEvent::ts).thenComparing(e -> e.id() == null ? 0L : e.id())).toList();
        return switch (r.type()) {
            case "match" -> match(r, usable);
            case "threshold" -> threshold(r, usable);
            case "sequence" -> sequence(r, usable);
            case "absence" -> absence(r, usable, events);
            case "indicator_match" -> indicatorMatch(r, usable, indicators == null ? List.of() : indicators);
            default -> List.of();
        };
    }

    // ---------------------------------------------------------------- match
    private static List<Candidate> match(RuleDef r, List<NormalizedEvent> events) {
        List<NormalizedEvent> hits = events.stream().filter(r.filter()::matches).toList();
        List<Candidate> out = new ArrayList<>();
        for (Map.Entry<String, List<NormalizedEvent>> g : group(hits, r.groupBy()).entrySet()) {
            for (List<NormalizedEvent> cluster : clusters(g.getValue(), r.windowSeconds())) {
                out.add(candidate(r, g.getKey(), cluster, List.of(), false, Map.of("observedCount", cluster.size(), "windowSeconds", r.windowSeconds())));
            }
        }
        return out;
    }

    // ---------------------------------------------------------------- threshold (+ followed_by)
    private static List<Candidate> threshold(RuleDef r, List<NormalizedEvent> events) {
        List<NormalizedEvent> hits = events.stream().filter(r.filter()::matches).toList();
        List<Candidate> out = new ArrayList<>();
        for (Map.Entry<String, List<NormalizedEvent>> g : group(hits, r.groupBy()).entrySet()) {
            List<NormalizedEvent> list = g.getValue();
            int i = 0;
            while (i < list.size()) {
                Instant limit = list.get(i).ts().plusSeconds(r.windowSeconds());
                int k = 0;
                while (i + k < list.size() && !list.get(i + k).ts().isAfter(limit)) k++;
                if (k < r.threshold()) { i++; continue; }
                int end = i + k - 1;
                while (end + 1 < list.size() && Duration.between(list.get(end).ts(), list.get(end + 1).ts()).getSeconds() <= r.windowSeconds()) end++;
                List<NormalizedEvent> cluster = list.subList(i, end + 1);
                List<NormalizedEvent> ctx = new ArrayList<>();
                boolean followed = false;
                if (r.followedBy() != null) {
                    Instant lastTs = cluster.get(cluster.size() - 1).ts();
                    Instant until = lastTs.plusSeconds(r.followedBy().withinSeconds());
                    String[] vals = g.getKey().split("\\|", -1);
                    for (NormalizedEvent e : events) {
                        if (!e.ts().isAfter(lastTs) || e.ts().isAfter(until)) continue;
                        if (!r.followedBy().filter().matches(e)) continue;
                        boolean same = true;
                        for (int f = 0; f < r.groupBy().size(); f++) same &= val(e, r.groupBy().get(f)).equalsIgnoreCase(vals[f]);
                        if (same) { ctx.add(e); followed = true; break; }
                    }
                }
                Map<String, Object> in = new LinkedHashMap<>();
                in.put("observedCount", cluster.size());
                in.put("threshold", r.threshold());
                in.put("windowSeconds", r.windowSeconds());
                in.put("followedByMatched", followed);
                out.add(candidate(r, g.getKey(), new ArrayList<>(cluster), ctx, followed, in));
                i = end + 1;
            }
        }
        return out;
    }

    // ---------------------------------------------------------------- sequence
    private static List<Candidate> sequence(RuleDef r, List<NormalizedEvent> events) {
        Map<String, List<NormalizedEvent>> byKey = new TreeMap<>();
        for (NormalizedEvent e : events) {
            String key = keyOrNull(e, r.correlateOn());
            if (key == null) continue;
            byKey.computeIfAbsent(key, k -> new ArrayList<>()).add(e);
        }
        List<Candidate> out = new ArrayList<>();
        for (Map.Entry<String, List<NormalizedEvent>> g : byKey.entrySet()) {
            List<NormalizedEvent> list = g.getValue();
            int i = 0;
            while (i < list.size()) {
                if (!r.steps().get(0).matches(list.get(i))) { i++; continue; }
                List<NormalizedEvent> chain = new ArrayList<>(List.of(list.get(i)));
                Instant prev = list.get(i).ts();
                int cursor = i + 1;
                int lastIdx = i;
                boolean complete = true;
                for (int s = 1; s < r.steps().size() && complete; s++) {
                    int found = -1;
                    for (int j = cursor; j < list.size(); j++) {
                        NormalizedEvent e = list.get(j);
                        if (e.ts().isAfter(prev.plusSeconds(r.windowSeconds()))) break;
                        if (e.ts().isAfter(prev) && r.steps().get(s).matches(e)) { found = j; break; }
                    }
                    if (found < 0) complete = false;
                    else { chain.add(list.get(found)); prev = list.get(found).ts(); cursor = found + 1; lastIdx = found; }
                }
                if (complete) {
                    out.add(candidate(r, g.getKey(), chain, List.of(), false,
                            Map.of("steps", r.steps().size(), "windowSeconds", r.windowSeconds(),
                                    "elapsedSeconds", Duration.between(chain.get(0).ts(), chain.get(chain.size() - 1).ts()).getSeconds())));
                    i = lastIdx + 1;
                } else i++;
            }
        }
        return out;
    }

    // ---------------------------------------------------------------- absence (telemetry silence)
    private static List<Candidate> absence(RuleDef r, List<NormalizedEvent> usable, List<NormalizedEvent> all) {
        if (all.isEmpty()) return List.of();
        Instant reference = all.stream().map(NormalizedEvent::ts).max(Comparator.naturalOrder()).orElseThrow();
        List<NormalizedEvent> scoped = r.filter().isEmpty() ? usable : usable.stream().filter(r.filter()::matches).toList();
        List<Candidate> out = new ArrayList<>();
        for (Map.Entry<String, List<NormalizedEvent>> g : group(scoped, r.groupBy()).entrySet()) {
            List<NormalizedEvent> list = g.getValue();
            if (list.size() < r.minHistory()) continue;
            Instant last = list.get(list.size() - 1).ts();
            long silentMin = Duration.between(last, reference).toMinutes();
            if (silentMin <= r.silenceMinutes()) continue;
            Map<String, Object> in = new LinkedHashMap<>();
            in.put("lastSeen", last.toString());
            in.put("referenceTime", reference.toString());
            in.put("silentMinutes", silentMin);
            in.put("silenceThresholdMinutes", r.silenceMinutes());
            in.put("priorEvents", list.size());
            out.add(candidate(r, g.getKey(), new ArrayList<>(list.subList(Math.max(0, list.size() - 3), list.size())), List.of(), false, in));
        }
        return out;
    }

    // ---------------------------------------------------------------- indicator match
    private static List<Candidate> indicatorMatch(RuleDef r, List<NormalizedEvent> events, List<Indicator> indicators) {
        Map<String, List<NormalizedEvent>> byIoc = new TreeMap<>();
        Map<String, Indicator> meta = new HashMap<>();
        for (NormalizedEvent e : events) {
            if (!r.filter().isEmpty() && !r.filter().matches(e)) continue;
            for (Indicator i : indicators) {
                if ("benign-allowlist".equalsIgnoreCase(i.classification())) continue;
                if (i.expiresAt() != null && i.expiresAt().isBefore(e.ts())) continue;
                boolean hit = switch (i.type()) {
                    case "domain" -> e.domain() != null && (e.domain().equalsIgnoreCase(i.value()) || e.domain().toLowerCase().endsWith("." + i.value().toLowerCase()));
                    case "ip" -> i.value().equals(e.srcIp()) || i.value().equals(e.dstIp());
                    default -> false;
                };
                if (hit) { byIoc.computeIfAbsent(i.value().toLowerCase(), k -> new ArrayList<>()).add(e); meta.put(i.value().toLowerCase(), i); }
            }
        }
        List<Candidate> out = new ArrayList<>();
        for (Map.Entry<String, List<NormalizedEvent>> g : byIoc.entrySet()) {
            Indicator i = meta.get(g.getKey());
            Map<String, Object> in = new LinkedHashMap<>();
            in.put("indicator", i.value());
            in.put("indicatorType", i.type());
            in.put("indicatorClassification", i.classification());
            in.put("indicatorConfidence", i.confidence());
            in.put("observedCount", g.getValue().size());
            out.add(candidate(r, g.getKey(), g.getValue(), List.of(), false, in));
        }
        return out;
    }

    // ---------------------------------------------------------------- helpers
    private static Candidate candidate(RuleDef r, String key, List<NormalizedEvent> matched, List<NormalizedEvent> ctx, boolean escalated, Map<String, Object> inputs) {
        List<String> fields = !r.groupBy().isEmpty() ? r.groupBy() : r.correlateOn();
        Map<String, String> entity = new LinkedHashMap<>();
        String[] vals = key.split("\\|", -1);
        for (int i = 0; i < fields.size() && i < vals.length; i++) entity.put(fields.get(i), vals[i]);
        // Surface host/user/ip from evidence when the group key doesn't carry them.
        NormalizedEvent f = matched.get(0);
        entity.putIfAbsent("host", f.host());
        entity.putIfAbsent("username", f.username());
        entity.putIfAbsent("src_ip", f.srcIp());
        entity.values().removeIf(Objects::isNull);
        Instant first = matched.stream().map(NormalizedEvent::ts).min(Comparator.naturalOrder()).orElse(f.ts());
        Instant last = Stream.concat(matched.stream(), ctx.stream()).map(NormalizedEvent::ts).max(Comparator.naturalOrder()).orElse(f.ts());
        return new Candidate(key, entity, matched, ctx, first, last, escalated, inputs);
    }

    private static Map<String, List<NormalizedEvent>> group(List<NormalizedEvent> events, List<String> fields) {
        Map<String, List<NormalizedEvent>> m = new TreeMap<>();
        for (NormalizedEvent e : events) m.computeIfAbsent(fields.isEmpty() ? "all" : keyOf(e, fields), k -> new ArrayList<>()).add(e);
        return m;
    }

    private static List<List<NormalizedEvent>> clusters(List<NormalizedEvent> sorted, int gapSeconds) {
        List<List<NormalizedEvent>> out = new ArrayList<>();
        List<NormalizedEvent> cur = new ArrayList<>();
        for (NormalizedEvent e : sorted) {
            if (!cur.isEmpty() && Duration.between(cur.get(cur.size() - 1).ts(), e.ts()).getSeconds() > gapSeconds) { out.add(cur); cur = new ArrayList<>(); }
            cur.add(e);
        }
        if (!cur.isEmpty()) out.add(cur);
        return out;
    }

    private static String val(NormalizedEvent e, String f) { Object v = e.field(f); return v == null ? "-" : v.toString(); }

    private static String keyOf(NormalizedEvent e, List<String> fields) {
        return fields.stream().map(f -> val(e, f)).collect(Collectors.joining("|"));
    }

    private static String keyOrNull(NormalizedEvent e, List<String> fields) {
        for (String f : fields) if (e.field(f) == null) return null;
        return keyOf(e, fields);
    }

    private static final class Stream {
        static <T> java.util.stream.Stream<T> concat(java.util.stream.Stream<T> a, java.util.stream.Stream<T> b) { return java.util.stream.Stream.concat(a, b); }
    }
}
