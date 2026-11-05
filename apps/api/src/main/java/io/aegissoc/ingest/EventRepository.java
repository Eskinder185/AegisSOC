package io.aegissoc.ingest;

import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Repository
public class EventRepository {
    static final String COLS = "id, ts, original_ts, event_class, action, outcome, severity, host, username, src_ip, dst_ip, dst_port, domain, " +
            "process_name, process_cmdline, parent_process, message, vendor, vendor_ref, synthetic";

    public static final RowMapper<NormalizedEvent> MAPPER = (rs, n) -> new NormalizedEvent(
            rs.getLong("id"), rs.getTimestamp("ts").toInstant(), rs.getString("original_ts"), rs.getString("event_class"), rs.getString("action"),
            rs.getString("outcome"), rs.getInt("severity"), rs.getString("host"), rs.getString("username"), rs.getString("src_ip"),
            rs.getString("dst_ip"), (Integer) rs.getObject("dst_port"), rs.getString("domain"), rs.getString("process_name"),
            rs.getString("process_cmdline"), rs.getString("parent_process"), rs.getString("message"), rs.getString("vendor"),
            rs.getString("vendor_ref"), rs.getBoolean("synthetic"));

    private final JdbcClient jdbc;

    public EventRepository(JdbcClient jdbc) { this.jdbc = jdbc; }

    public List<NormalizedEvent> byRun(long runId) {
        return jdbc.sql("SELECT " + COLS + " FROM normalized_events WHERE run_id = :r ORDER BY ts, id").param("r", runId).query(MAPPER).list();
    }

    public List<NormalizedEvent> lookback(long excludeRunId, Instant from, Instant to) {
        return jdbc.sql("SELECT " + COLS + " FROM normalized_events WHERE run_id <> :r AND ts BETWEEN :f AND :t ORDER BY ts, id LIMIT 20000")
                .param("r", excludeRunId).param("f", Timestamp.from(from)).param("t", Timestamp.from(to)).query(MAPPER).list();
    }

    public List<NormalizedEvent> byIds(List<Long> ids) {
        if (ids.isEmpty()) return List.of();
        return jdbc.sql("SELECT " + COLS + " FROM normalized_events WHERE id IN (:ids) ORDER BY ts, id").param("ids", ids).query(MAPPER).list();
    }

    public boolean exists(long sourceId, String fingerprint) {
        return jdbc.sql("SELECT 1 FROM normalized_events WHERE source_id = :s AND fingerprint = :f").param("s", sourceId).param("f", fingerprint)
                .query().listOfRows().size() > 0;
    }

    public long insertRaw(long sourceId, long runId, String payloadJson, String sha, boolean synthetic) {
        return jdbc.sql("""
                INSERT INTO raw_events (source_id, run_id, payload, payload_sha256, synthetic)
                VALUES (:s, :r, CAST(:p AS jsonb), :h, :syn) RETURNING id""")
                .param("s", sourceId).param("r", runId).param("p", payloadJson).param("h", sha).param("syn", synthetic).query(Long.class).single();
    }

    public long insert(long rawId, long sourceId, long runId, String fingerprint, NormalizedEvent e, String parserVersion) {
        return jdbc.sql("""
                INSERT INTO normalized_events (raw_event_id, source_id, run_id, fingerprint, ts, original_ts, event_class, action, outcome, severity,
                    host, username, src_ip, dst_ip, dst_port, domain, process_name, process_cmdline, parent_process, message, vendor, vendor_ref,
                    synthetic, parser_version)
                VALUES (:raw, :s, :r, :fp, :ts, :ots, :cls, :act, :out, :sev, :host, :usr, :sip, :dip, :dp, :dom, :pn, :pc, :pp, :msg, :ven, :vref, :syn, :pv)
                RETURNING id""")
                .param("raw", rawId).param("s", sourceId).param("r", runId).param("fp", fingerprint).param("ts", Timestamp.from(e.ts()))
                .param("ots", e.originalTs()).param("cls", e.eventClass()).param("act", e.action()).param("out", e.outcome()).param("sev", e.severity())
                .param("host", e.host()).param("usr", e.username()).param("sip", e.srcIp()).param("dip", e.dstIp()).param("dp", e.dstPort())
                .param("dom", e.domain()).param("pn", e.processName()).param("pc", e.processCmdline()).param("pp", e.parentProcess())
                .param("msg", e.message()).param("ven", e.vendor()).param("vref", e.vendorRef()).param("syn", e.synthetic()).param("pv", parserVersion)
                .query(Long.class).single();
    }

    /** Full event incl. raw vendor payload, for the evidence drawer. */
    public Optional<Map<String, Object>> detail(long id) {
        return jdbc.sql("""
                SELECT n.id, n.ts, n.original_ts AS "originalTs", n.event_class AS "eventClass", n.action, n.outcome, n.severity, n.host, n.username,
                       n.src_ip AS "srcIp", n.dst_ip AS "dstIp", n.dst_port AS "dstPort", n.domain, n.process_name AS "processName",
                       n.process_cmdline AS "processCmdline", n.parent_process AS "parentProcess", n.message, n.vendor, n.vendor_ref AS "vendorRef",
                       n.synthetic, n.parser_version AS "parserVersion", n.ingested_at AS "ingestedAt", n.run_id AS "runId",
                       s.name AS "sourceName", s.source_type AS "sourceType", r.payload::text AS raw, r.payload_sha256 AS "rawSha256"
                FROM normalized_events n JOIN data_sources s ON s.id = n.source_id JOIN raw_events r ON r.id = n.raw_event_id
                WHERE n.id = :id""").param("id", id).query().listOfRows().stream().findFirst();
    }
}
