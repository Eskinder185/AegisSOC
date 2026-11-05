package io.aegissoc.incidents;

import io.aegissoc.common.Json;

import java.util.*;
import java.util.regex.Pattern;

/**
 * Privacy-aware export redaction. IPv4 addresses keep their /24, usernames and hostnames become stable pseudonyms
 * (same input -> same pseudonym within an export), so reports stay readable without exposing identities.
 */
public final class Redactor {
    private static final Pattern IPV4 = Pattern.compile("\\b(\\d{1,3}\\.\\d{1,3}\\.\\d{1,3})\\.\\d{1,3}\\b");
    private final Map<String, String> literals = new LinkedHashMap<>();
    private final boolean enabled;

    public Redactor(boolean enabled, Collection<String> users, Collection<String> hosts) {
        this.enabled = enabled;
        if (enabled) {
            users.stream().filter(Objects::nonNull).filter(s -> s.length() >= 2).distinct().forEach(u -> literals.put(u, "user-" + tag(u)));
            hosts.stream().filter(Objects::nonNull).filter(s -> s.length() >= 2).distinct().forEach(h -> literals.put(h, "host-" + tag(h)));
        }
    }

    private static String tag(String s) { return Json.sha256(s).substring(0, 6); }

    public String apply(String text) {
        if (!enabled || text == null) return text;
        String out = IPV4.matcher(text).replaceAll("$1.x");
        List<String> keys = new ArrayList<>(literals.keySet());
        keys.sort(Comparator.comparingInt(String::length).reversed());
        for (String k : keys) out = out.replace(k, literals.get(k));
        return out;
    }

    public boolean enabled() { return enabled; }
}
