package io.aegissoc.audit;

import io.aegissoc.common.Json;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Append-only audit log with a SHA-256 hash chain (each row hashes the previous row's hash).
 * The application never exposes update/delete for audit rows; verifyChain() detects tampering at rest.
 */
@Service
public class AuditService {
    private final JdbcClient jdbc;

    public AuditService(JdbcClient jdbc) { this.jdbc = jdbc; }

    @Transactional(propagation = Propagation.REQUIRED)
    public void record(String actor, String action, String objectType, Object objectId, Map<String, Object> detail) {
        jdbc.sql("SELECT pg_advisory_xact_lock(7001)").query().singleRow();
        String prev = jdbc.sql("SELECT hash FROM audit_events ORDER BY id DESC LIMIT 1").query(String.class).optional().orElse("GENESIS");
        Instant at = Instant.now().truncatedTo(ChronoUnit.MICROS);
        String detailJson = Json.write(detail == null ? Map.of() : detail);
        String oid = objectId == null ? null : String.valueOf(objectId);
        String hash = hash(prev, at, actor, action, objectType, oid, detailJson);
        jdbc.sql("""
                INSERT INTO audit_events (at, actor, action, object_type, object_id, detail, prev_hash, hash)
                VALUES (:at, :actor, :action, :ot, :oid, CAST(:detail AS jsonb), :prev, :hash)""")
                .param("at", java.sql.Timestamp.from(at))
                .param("actor", actor).param("action", action).param("ot", objectType).param("oid", oid)
                .param("detail", detailJson).param("prev", prev).param("hash", hash).update();
    }

    static String hash(String prev, Instant at, String actor, String action, String ot, String oid, String detailJson) {
        return Json.sha256(String.join("|", prev, at.toString(), actor, action, String.valueOf(ot), String.valueOf(oid), canonicalDetail(detailJson)));
    }

    private static String canonicalDetail(String json) { return Json.canonical(Json.read(json)); }

    /** Returns {valid, checked, firstBrokenId}. */
    public Map<String, Object> verifyChain() {
        List<Map<String, Object>> rows = jdbc.sql("SELECT id, at, actor, action, object_type, object_id, detail::text AS detail, prev_hash, hash FROM audit_events ORDER BY id")
                .query().listOfRows();
        String prev = "GENESIS";
        List<Long> broken = new ArrayList<>();
        for (Map<String, Object> r : rows) {
            Instant at = ((java.sql.Timestamp) r.get("at")).toInstant().truncatedTo(ChronoUnit.MICROS);
            String expected = hash(prev, at, (String) r.get("actor"), (String) r.get("action"),
                    (String) r.get("object_type"), (String) r.get("object_id"), (String) r.get("detail"));
            if (!prev.equals(r.get("prev_hash")) || !expected.equals(r.get("hash"))) {
                broken.add(((Number) r.get("id")).longValue());
                if (broken.size() >= 5) break;
            }
            prev = (String) r.get("hash");
        }
        return Map.of("valid", broken.isEmpty(), "checked", rows.size(), "brokenIds", broken);
    }
}
