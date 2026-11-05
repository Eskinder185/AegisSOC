package io.aegissoc.intel;

import io.aegissoc.audit.AuditService;
import io.aegissoc.auth.Actor;
import io.aegissoc.common.ApiException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import java.util.regex.Pattern;

/**
 * Local indicator registry. Indicators are canonicalized and validated; values are DATA, never fetched, resolved or rendered
 * as live links. Every response carries provenance and age because stale or reused indicators are a major source of false positives.
 */
@RestController
@RequestMapping("/api/intel")
public class IntelController {
    private static final Pattern DOMAIN = Pattern.compile("^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,63}$");
    private static final Pattern IPV4 = Pattern.compile("^((25[0-5]|2[0-4]\\d|1?\\d?\\d)\\.){3}(25[0-5]|2[0-4]\\d|1?\\d?\\d)$");
    private static final Pattern HASH = Pattern.compile("^([a-f0-9]{32}|[a-f0-9]{40}|[a-f0-9]{64})$");

    private final JdbcClient jdbc;
    private final AuditService audit;

    public IntelController(JdbcClient jdbc, AuditService audit) { this.jdbc = jdbc; this.audit = audit; }

    @GetMapping("/indicators")
    public List<Map<String, Object>> list() {
        return jdbc.sql("""
                SELECT i.id, i.ioc_type AS "type", i.value, i.classification, i.confidence, i.source, i.description, i.first_seen AS "firstSeen", i.expires_at AS "expiresAt", i.synthetic,
                       (i.expires_at IS NOT NULL AND i.expires_at < now()) AS expired,
                       floor(extract(epoch FROM (now() - i.first_seen)) / 86400) AS "ageDays",
                       (SELECT count(*) FROM normalized_events n WHERE (i.ioc_type = 'domain' AND (n.domain = i.value OR n.domain LIKE '%.' || i.value))
                           OR (i.ioc_type = 'ip' AND (n.src_ip = i.value OR n.dst_ip = i.value))) AS "matchCount"
                FROM threat_indicators i ORDER BY i.id DESC""").query().listOfRows();
    }

    public record IndicatorBody(@NotBlank String type, @NotBlank @Size(max = 300) String value, @NotBlank @Size(max = 60) String classification,
                                @NotBlank String confidence, @NotBlank @Size(max = 120) String source, @Size(max = 500) String description, Integer expiresInDays, Boolean synthetic) {}

    @PostMapping("/indicators")
    @PreAuthorize("hasRole('ANALYST')")
    public Map<String, Object> add(@Valid @RequestBody IndicatorBody b) {
        String type = b.type().toLowerCase();
        String value = canonicalize(type, b.value());
        if (!List.of("LOW", "MEDIUM", "HIGH").contains(b.confidence())) throw ApiException.bad("confidence must be LOW, MEDIUM or HIGH");
        Timestamp exp = b.expiresInDays() == null ? null : Timestamp.from(Instant.now().plusSeconds(86400L * Math.max(1, Math.min(b.expiresInDays(), 3650))));
        try {
            long id = jdbc.sql("""
                    INSERT INTO threat_indicators (ioc_type, value, classification, confidence, source, description, expires_at, synthetic)
                    VALUES (:t,:v,:c,:cf,:s,:d,:e,:syn) RETURNING id""")
                    .param("t", type).param("v", value).param("c", b.classification()).param("cf", b.confidence()).param("s", b.source())
                    .param("d", b.description() == null ? "" : b.description()).param("e", exp).param("syn", b.synthetic() == null || b.synthetic()).query(Long.class).single();
            audit.record(Actor.name(), "intel.add", "indicator", id, Map.of("type", type));
            return Map.of("id", id, "value", value, "note", "Stored as inert data. AegisSOC never contacts or fetches indicator values.");
        } catch (org.springframework.dao.DuplicateKeyException e) {
            throw ApiException.conflict("DUPLICATE_INDICATOR", "That indicator already exists");
        }
    }

    @PostMapping("/indicators/{id}/expire")
    @PreAuthorize("hasRole('ANALYST')")
    public Map<String, Object> expire(@PathVariable long id) {
        int n = jdbc.sql("UPDATE threat_indicators SET expires_at = now() WHERE id = :id").param("id", id).update();
        if (n == 0) throw ApiException.notFound("Indicator");
        audit.record(Actor.name(), "intel.expire", "indicator", id, Map.of());
        return Map.of("expired", id);
    }

    @GetMapping("/indicators/{id}/matches")
    public Map<String, Object> matches(@PathVariable long id) {
        Map<String, Object> ind = jdbc.sql("SELECT ioc_type AS type, value, classification, confidence, source, first_seen AS \"firstSeen\", expires_at AS \"expiresAt\" FROM threat_indicators WHERE id = :id")
                .param("id", id).query().listOfRows().stream().findFirst().orElseThrow(() -> ApiException.notFound("Indicator"));
        String v = (String) ind.get("value");
        List<Map<String, Object>> ev = jdbc.sql("""
                SELECT id, ts, host, username, event_class AS "eventClass", message FROM normalized_events
                WHERE (:t = 'domain' AND (domain = :v OR domain LIKE '%.' || :v)) OR (:t = 'ip' AND (src_ip = :v OR dst_ip = :v)) ORDER BY ts DESC LIMIT 50""")
                .param("t", ind.get("type")).param("v", v).query().listOfRows();
        return Map.of("indicator", ind, "events", ev,
                "limitations", List.of("Unknown does not mean safe, and a listed indicator does not prove local compromise.",
                        "Check the indicator's source, confidence and age before acting; stale or shared infrastructure causes false positives."));
    }

    static String canonicalize(String type, String raw) {
        String v = raw.trim();
        switch (type) {
            case "domain" -> {
                v = v.toLowerCase();
                if (v.endsWith(".")) v = v.substring(0, v.length() - 1);
                if (v.startsWith("*.")) v = v.substring(2);
                if (!DOMAIN.matcher(v).matches()) throw ApiException.bad("Not a valid domain name (no scheme, path or port)");
            }
            case "ip" -> { if (!IPV4.matcher(v).matches()) throw ApiException.bad("Not a valid IPv4 address"); }
            case "hash" -> {
                v = v.toLowerCase();
                if (!HASH.matcher(v).matches()) throw ApiException.bad("Hash must be MD5, SHA-1 or SHA-256 hex");
            }
            case "url" -> {
                if (!v.matches("^https?://[^\\s@]+$")) throw ApiException.bad("URL must start with http:// or https://, contain no credentials or whitespace");
                v = v.replaceFirst("^(?i)(https?)://", "$1://");
            }
            default -> throw ApiException.bad("type must be ip, domain, hash or url");
        }
        return v;
    }
}
