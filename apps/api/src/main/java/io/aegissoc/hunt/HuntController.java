package io.aegissoc.hunt;

import com.fasterxml.jackson.databind.JsonNode;
import io.aegissoc.audit.AuditService;
import io.aegissoc.auth.Actor;
import io.aegissoc.common.ApiException;
import io.aegissoc.common.Json;
import io.aegissoc.incidents.Redactor;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.*;

/**
 * Bounded, parameterized event search. There is NO free-form query endpoint: every filter is an allowlisted field,
 * values are bound parameters, time range and page size are capped, and statement timeout is enforced by the DB.
 */
@RestController
@RequestMapping("/api")
public class HuntController {
    static final Set<String> FILTERS = Set.of("q", "host", "user", "ip", "domain", "eventClass", "severityMin", "outcome", "source", "from", "to", "incident", "synthetic", "action");
    static final long MAX_RANGE_DAYS = 31;

    private final JdbcClient jdbc;
    private final AuditService audit;

    public HuntController(JdbcClient jdbc, AuditService audit) { this.jdbc = jdbc; this.audit = audit; }

    record Query(String where, Map<String, Object> params) {}

    Query build(Map<String, String> f) {
        for (String k : f.keySet()) if (!FILTERS.contains(k) && !k.equals("page") && !k.equals("size") && !k.equals("redact")) throw ApiException.bad("Unsupported filter '" + k + "'");
        StringBuilder w = new StringBuilder(" WHERE 1=1");
        Map<String, Object> p = new HashMap<>();
        Instant to = parse(f.get("to"), Instant.now().plusSeconds(86400));
        Instant from = parse(f.get("from"), to.minusSeconds(MAX_RANGE_DAYS * 86400));
        if (from.isAfter(to)) throw ApiException.bad("'from' must be before 'to'");
        if (java.time.Duration.between(from, to).toDays() > MAX_RANGE_DAYS) throw ApiException.bad("Time range is limited to " + MAX_RANGE_DAYS + " days");
        w.append(" AND n.ts BETWEEN :from AND :to"); p.put("from", Timestamp.from(from)); p.put("to", Timestamp.from(to));
        eq(w, p, f, "host", "n.host"); eq(w, p, f, "user", "n.username"); eq(w, p, f, "domain", "n.domain");
        eq(w, p, f, "eventClass", "n.event_class"); eq(w, p, f, "outcome", "n.outcome"); eq(w, p, f, "action", "n.action");
        if (f.get("ip") != null && !f.get("ip").isBlank()) { w.append(" AND (n.src_ip = :ip OR n.dst_ip = :ip)"); p.put("ip", f.get("ip")); }
        if (f.get("severityMin") != null && !f.get("severityMin").isBlank()) { w.append(" AND n.severity >= :smin"); p.put("smin", clampInt(f.get("severityMin"), 0, 10)); }
        if (f.get("source") != null && !f.get("source").isBlank()) { w.append(" AND n.source_id = :src"); p.put("src", clampInt(f.get("source"), 1, Integer.MAX_VALUE)); }
        if (f.get("synthetic") != null && !f.get("synthetic").isBlank()) { w.append(" AND n.synthetic = :syn"); p.put("syn", Boolean.parseBoolean(f.get("synthetic"))); }
        if (f.get("incident") != null && !f.get("incident").isBlank()) { w.append(" AND n.id IN (SELECT event_id FROM incident_evidence WHERE incident_id = :inc)"); p.put("inc", clampInt(f.get("incident"), 1, Integer.MAX_VALUE)); }
        if (f.get("q") != null && !f.get("q").isBlank()) {
            String q = f.get("q").trim();
            if (q.length() > 100) throw ApiException.bad("Search text is limited to 100 characters");
            w.append(" AND n.search_vector @@ plainto_tsquery('simple', :q)"); p.put("q", q);
        }
        return new Query(w.toString(), p);
    }

    private static void eq(StringBuilder w, Map<String, Object> p, Map<String, String> f, String key, String col) {
        String v = f.get(key);
        if (v != null && !v.isBlank()) { w.append(" AND ").append(col).append(" = :").append(key); p.put(key, v); }
    }

    private static int clampInt(String s, int min, int max) {
        try { return Math.max(min, Math.min(max, Integer.parseInt(s))); } catch (NumberFormatException e) { throw ApiException.bad("Expected a number, got '" + s + "'"); }
    }

    private static Instant parse(String s, Instant def) {
        if (s == null || s.isBlank()) return def;
        try { return Instant.parse(s); } catch (DateTimeParseException e) { throw ApiException.bad("Timestamps must be ISO-8601, e.g. 2026-01-15T00:00:00Z"); }
    }

    private JdbcClient.StatementSpec bind(JdbcClient.StatementSpec s, Map<String, Object> p) {
        for (var e : p.entrySet()) s = s.param(e.getKey(), e.getValue());
        return s;
    }

    static final String SELECT = """
            SELECT n.id, n.ts, n.event_class AS "eventClass", n.action, n.outcome, n.severity, n.host, n.username, n.src_ip AS "srcIp", n.dst_ip AS "dstIp",
                   n.dst_port AS "dstPort", n.domain, n.process_name AS "processName", n.message, n.synthetic, s.name AS "sourceName"
            FROM normalized_events n JOIN data_sources s ON s.id = n.source_id""";

    @GetMapping("/events")
    public Map<String, Object> search(@RequestParam Map<String, String> f) {
        int size = clampInt(f.getOrDefault("size", "50"), 1, 200);
        int page = clampInt(f.getOrDefault("page", "0"), 0, 10000);
        Query q = build(f);
        long t0 = System.nanoTime();
        long total = bind(jdbc.sql("SELECT count(*) FROM normalized_events n" + q.where()), q.params()).query(Long.class).single();
        List<Map<String, Object>> items = bind(jdbc.sql(SELECT + q.where() + " ORDER BY n.ts DESC, n.id DESC LIMIT :lim OFFSET :off"), q.params())
                .param("lim", size).param("off", page * size).query().listOfRows();
        // 24-bucket histogram over the selected range for the timeline view
        List<Map<String, Object>> hist = bind(jdbc.sql("""
                SELECT width_bucket(extract(epoch FROM n.ts)::float8, extract(epoch FROM CAST(:from AS timestamptz))::float8, extract(epoch FROM CAST(:to AS timestamptz))::float8 + 1, 24) AS bucket, count(*) AS count
                FROM normalized_events n""" + q.where() + " GROUP BY 1 ORDER BY 1"), q.params()).query().listOfRows();
        return Map.of("items", items, "total", total, "page", page, "size", size, "histogram", hist,
                "rangeFrom", q.params().get("from").toString(), "rangeTo", q.params().get("to").toString(), "elapsedMs", (System.nanoTime() - t0) / 1_000_000);
    }

    @GetMapping("/events/facets")
    public Map<String, Object> facets(@RequestParam Map<String, String> f) {
        Query q = build(f);
        Map<String, Object> out = new LinkedHashMap<>();
        for (String[] col : new String[][]{{"eventClass", "n.event_class"}, {"host", "n.host"}, {"user", "n.username"}, {"outcome", "n.outcome"}}) {
            out.put(col[0], bind(jdbc.sql("SELECT " + col[1] + " AS value, count(*) AS count FROM normalized_events n" + q.where() + " AND " + col[1] + " IS NOT NULL GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 15"), q.params()).query().listOfRows());
        }
        return out;
    }

    /** Entity pivot: everything touching a host/user/ip within +/- N minutes of an anchor time, bounded to 500 rows. */
    @GetMapping("/pivot")
    public Map<String, Object> pivot(@RequestParam String type, @RequestParam String value, @RequestParam(required = false) String around,
                                     @RequestParam(defaultValue = "60") int minutes) {
        String col = switch (type) {
            case "host" -> "n.host = :v";
            case "user" -> "n.username = :v";
            case "ip" -> "(n.src_ip = :v OR n.dst_ip = :v)";
            case "domain" -> "n.domain = :v";
            default -> throw ApiException.bad("type must be host, user, ip or domain");
        };
        if (value.length() > 255) throw ApiException.bad("value too long");
        int m = Math.max(1, Math.min(minutes, 1440));
        Instant center = parse(around, null);
        if (center == null) center = jdbc.sql("SELECT max(ts) FROM normalized_events n WHERE " + col).param("v", value).query(Timestamp.class).optional().map(Timestamp::toInstant).orElse(Instant.now());
        List<Map<String, Object>> items = jdbc.sql(SELECT + " WHERE " + col + " AND n.ts BETWEEN :a AND :b ORDER BY n.ts, n.id LIMIT 500")
                .param("v", value).param("a", Timestamp.from(center.minusSeconds(m * 60L))).param("b", Timestamp.from(center.plusSeconds(m * 60L))).query().listOfRows();
        List<Map<String, Object>> alerts = jdbc.sql("""
                SELECT id, title, severity, status FROM alerts WHERE (entity_host = :v OR entity_user = :v OR entity_ip = :v) ORDER BY id DESC LIMIT 20""").param("v", value).query().listOfRows();
        return Map.of("type", type, "value", value, "center", center.toString(), "windowMinutes", m, "events", items, "alerts", alerts, "truncated", items.size() >= 500);
    }

    // ------------------------------------------------------------------ saved searches
    public record SaveSearch(@NotBlank @Size(max = 100) String name, Map<String, String> filter) {}

    @PostMapping("/hunt/searches")
    @PreAuthorize("hasRole('ANALYST')")
    public Map<String, Object> save(@Valid @RequestBody SaveSearch s) {
        if (s.filter() == null) throw ApiException.bad("filter required");
        build(s.filter()); // validates against the allowlist
        long id = jdbc.sql("INSERT INTO hunt_searches (name, filter, owner) VALUES (:n, CAST(:f AS jsonb), :o) RETURNING id").param("n", s.name()).param("f", Json.write(s.filter())).param("o", Actor.name()).query(Long.class).single();
        audit.record(Actor.name(), "hunt.search.save", "hunt_search", id, Map.of("name", s.name()));
        return Map.of("id", id);
    }

    @GetMapping("/hunt/searches")
    public List<Map<String, Object>> searches() {
        return jdbc.sql("SELECT id, name, filter::text AS filter, owner, created_at AS \"createdAt\" FROM hunt_searches ORDER BY id DESC LIMIT 100").query((rs, n) -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", rs.getLong("id")); m.put("name", rs.getString("name")); m.put("filter", Json.read(rs.getString("filter"))); m.put("owner", rs.getString("owner"));
            m.put("createdAt", rs.getTimestamp("createdAt").toInstant().toString());
            return m;
        }).list();
    }

    @DeleteMapping("/hunt/searches/{id}")
    @PreAuthorize("hasRole('ANALYST')")
    public Map<String, Object> deleteSearch(@PathVariable long id) {
        int n = jdbc.sql("DELETE FROM hunt_searches WHERE id = :id AND (owner = :o OR :admin)").param("id", id).param("o", Actor.name()).param("admin", Actor.role().equals("ADMIN")).update();
        if (n == 0) throw ApiException.notFound("Saved search you own");
        audit.record(Actor.name(), "hunt.search.delete", "hunt_search", id, Map.of());
        return Map.of("deleted", id);
    }

    // ------------------------------------------------------------------ notebooks
    public record NotebookBody(@NotBlank @Size(max = 160) String title, @NotBlank @Size(max = 1000) String hypothesis, JsonNode steps, @Size(max = 2000) String outcome, Long incidentId) {}

    @PostMapping("/hunt/notebooks")
    @PreAuthorize("hasRole('ANALYST')")
    public Map<String, Object> createNotebook(@Valid @RequestBody NotebookBody b) {
        checkSteps(b.steps());
        long id = jdbc.sql("INSERT INTO hunt_notebooks (title, hypothesis, steps, outcome, owner, incident_id) VALUES (:t,:h,CAST(:s AS jsonb),:o,:ow,:i) RETURNING id")
                .param("t", b.title()).param("h", b.hypothesis()).param("s", Json.write(b.steps() == null ? List.of() : b.steps())).param("o", b.outcome()).param("ow", Actor.name()).param("i", b.incidentId()).query(Long.class).single();
        audit.record(Actor.name(), "hunt.notebook.create", "hunt_notebook", id, Map.of());
        return notebook(id);
    }

    @PutMapping("/hunt/notebooks/{id}")
    @PreAuthorize("hasRole('ANALYST')")
    public Map<String, Object> updateNotebook(@PathVariable long id, @Valid @RequestBody NotebookBody b) {
        checkSteps(b.steps());
        int n = jdbc.sql("UPDATE hunt_notebooks SET title=:t, hypothesis=:h, steps=CAST(:s AS jsonb), outcome=:o, incident_id=:i, updated_at=now() WHERE id=:id AND (owner=:ow OR :admin)")
                .param("t", b.title()).param("h", b.hypothesis()).param("s", Json.write(b.steps() == null ? List.of() : b.steps())).param("o", b.outcome()).param("i", b.incidentId())
                .param("id", id).param("ow", Actor.name()).param("admin", Actor.role().equals("ADMIN")).update();
        if (n == 0) throw ApiException.notFound("Notebook you own");
        audit.record(Actor.name(), "hunt.notebook.update", "hunt_notebook", id, Map.of());
        return notebook(id);
    }

    private static void checkSteps(JsonNode steps) {
        if (steps == null) return;
        if (!steps.isArray() || steps.size() > 30) throw ApiException.bad("steps must be an array of at most 30 entries");
        for (JsonNode s : steps) if (!s.isObject() || s.toString().length() > 2000) throw ApiException.bad("each step must be a small object");
    }

    @GetMapping("/hunt/notebooks")
    public List<Map<String, Object>> notebooks() {
        return jdbc.sql("SELECT id FROM hunt_notebooks ORDER BY updated_at DESC LIMIT 100").query(Long.class).list().stream().map(this::notebook).toList();
    }

    @GetMapping("/hunt/notebooks/{id}")
    public Map<String, Object> notebook(@PathVariable long id) {
        return jdbc.sql("SELECT id, title, hypothesis, steps::text AS steps, outcome, owner, incident_id AS \"incidentId\", created_at AS \"createdAt\", updated_at AS \"updatedAt\" FROM hunt_notebooks WHERE id=:id")
                .param("id", id).query((rs, n) -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", rs.getLong("id")); m.put("title", rs.getString("title")); m.put("hypothesis", rs.getString("hypothesis")); m.put("steps", Json.read(rs.getString("steps")));
                    m.put("outcome", rs.getString("outcome")); m.put("owner", rs.getString("owner")); m.put("incidentId", rs.getObject("incidentId"));
                    m.put("createdAt", rs.getTimestamp("createdAt").toInstant().toString()); m.put("updatedAt", rs.getTimestamp("updatedAt").toInstant().toString());
                    return m;
                }).optional().orElseThrow(() -> ApiException.notFound("Notebook"));
    }

    // ------------------------------------------------------------------ scoped export (audited, redaction on by default)
    @GetMapping("/events/export")
    @PreAuthorize("hasRole('ANALYST')")
    public ResponseEntity<byte[]> export(@RequestParam Map<String, String> f) {
        boolean redact = !"false".equals(f.get("redact"));
        Query q = build(f);
        List<Map<String, Object>> rows = bind(jdbc.sql(SELECT + q.where() + " ORDER BY n.ts, n.id LIMIT 1000"), q.params()).query().listOfRows();
        Set<String> users = new HashSet<>(), hosts = new HashSet<>();
        for (Map<String, Object> r : rows) { if (r.get("username") != null) users.add((String) r.get("username")); if (r.get("host") != null) hosts.add((String) r.get("host")); }
        Redactor red = new Redactor(redact, users, hosts);
        StringBuilder csv = new StringBuilder("id,time,class,action,outcome,severity,host,user,src_ip,dst_ip,domain,synthetic,message\n");
        for (Map<String, Object> r : rows) {
            csv.append(r.get("id")).append(',').append(r.get("ts")).append(',').append(cell(r.get("eventClass"))).append(',').append(cell(r.get("action"))).append(',').append(cell(r.get("outcome")))
               .append(',').append(r.get("severity")).append(',').append(cell(red.apply((String) r.get("host")))).append(',').append(cell(red.apply((String) r.get("username"))))
               .append(',').append(cell(red.apply((String) r.get("srcIp")))).append(',').append(cell(red.apply((String) r.get("dstIp")))).append(',').append(cell(r.get("domain")))
               .append(',').append(r.get("synthetic")).append(',').append(cell(red.apply((String) r.get("message")))).append('\n');
        }
        String body = csv.toString();
        audit.record(Actor.name(), "events.export", "events", null, Map.of("rows", rows.size(), "redacted", redact, "filters", Json.write(f), "sha256", Json.sha256(body)));
        return ResponseEntity.ok().contentType(MediaType.parseMediaType("text/csv;charset=UTF-8"))
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"events-export.csv\"").header("X-Content-Type-Options", "nosniff").body(body.getBytes(StandardCharsets.UTF_8));
    }

    /** CSV cell with formula-injection protection (leading = + - @ are neutralized) and quote escaping. */
    static String cell(Object o) {
        if (o == null) return "";
        String s = o.toString().replace("\r", " ").replace("\n", " ");
        if (!s.isEmpty() && "=+-@".indexOf(s.charAt(0)) >= 0) s = "'" + s;
        return "\"" + s.replace("\"", "\"\"") + "\"";
    }
}
