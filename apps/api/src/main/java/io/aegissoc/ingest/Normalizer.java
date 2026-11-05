package io.aegissoc.ingest;

import com.fasterxml.jackson.databind.JsonNode;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.Set;

/**
 * Parses vendor payloads into NormalizedEvent. Strict about what it needs (timestamp, recognizable shape),
 * tolerant of missing optional fields. Throws ParseException with a row-level reason on rejection.
 */
public final class Normalizer {
    public static final String VERSION = "norm-1.0";
    public static final Set<String> FORMATS = Set.of("linux_auth", "windows_event", "suricata_eve", "generic");

    public static class ParseException extends RuntimeException {
        public ParseException(String m) { super(m); }
    }

    private Normalizer() {}

    public static NormalizedEvent parse(JsonNode n, boolean synthetic, int maxFieldLength) {
        if (n == null || !n.isObject()) throw new ParseException("event must be a JSON object");
        if (n.has("__unparseable_line")) throw new ParseException(n.path("__reason").asText("line is not valid JSON"));
        String format = text(n, "format");
        if (format == null) format = n.has("event_type") && n.has("timestamp") ? "suricata_eve" : "generic";
        if (!FORMATS.contains(format)) throw new ParseException("unsupported format '" + abbreviate(format) + "'");
        NormalizedEvent e = switch (format) {
            case "linux_auth" -> linuxAuth(n, synthetic);
            case "windows_event" -> windows(n, synthetic);
            case "suricata_eve" -> suricata(n, synthetic);
            default -> generic(n, synthetic);
        };
        enforceLengths(e, maxFieldLength);
        return e;
    }

    private static NormalizedEvent linuxAuth(JsonNode n, boolean syn) {
        String orig = req(n, "timestamp");
        String result = req(n, "result");
        boolean ok = result.equals("accepted");
        return new NormalizedEvent(null, ts(orig), orig, "authentication", ok ? "logon" : "logon_failed", ok ? "success" : "failure",
                ok ? 1 : 3, text(n, "hostname"), text(n, "user"), text(n, "src_ip"), null, null, null, null, null, null,
                text(n, "message") != null ? text(n, "message") : (n.path("program").asText("sshd") + ": " + result + " for " + text(n, "user")),
                "linux", text(n, "event_id"), syn);
    }

    private static NormalizedEvent windows(JsonNode n, boolean syn) {
        String orig = req(n, "TimeCreated");
        int id = n.path("EventID").asInt(-1);
        String host = text(n, "Computer");
        String user = text(n, "TargetUserName") != null ? text(n, "TargetUserName") : text(n, "SubjectUserName");
        return switch (id) {
            case 4624 -> win(n, orig, "authentication", "logon", "success", 1, host, user, text(n, "IpAddress"), null, null, null, syn,
                    "An account was successfully logged on");
            case 4625 -> win(n, orig, "authentication", "logon_failed", "failure", 3, host, user, text(n, "IpAddress"), null, null, null, syn,
                    "An account failed to log on");
            case 4688 -> new NormalizedEvent(null, ts(orig), orig, "process", "process_created", "success", 2, host, text(n, "SubjectUserName"),
                    null, null, null, null, base(text(n, "NewProcessName")), text(n, "CommandLine"), base(text(n, "ParentProcessName")),
                    "A new process has been created: " + base(text(n, "NewProcessName")), "windows", text(n, "event_id"), syn);
            case 4728, 4732 -> win(n, orig, "privilege", "added_to_privileged_group", "success", 6, host, text(n, "SubjectUserName"), null, null, null, null, syn,
                    "A member was added to a privileged group: " + text(n, "MemberName") + " -> " + text(n, "GroupName"));
            case 7036, 7040 -> new NormalizedEvent(null, ts(orig), orig, "service", "stopped", "success", 5, host, null, null, null, null, null,
                    text(n, "ServiceName"), null, null, "Service stopped: " + text(n, "ServiceName"), "windows", text(n, "event_id"), syn);
            case 22 -> new NormalizedEvent(null, ts(orig), orig, "dns", "dns_query", "success", 1, host, text(n, "User"), null, null, null,
                    text(n, "QueryName"), text(n, "Image") != null ? base(text(n, "Image")) : null, null, null,
                    "DNS query for " + text(n, "QueryName"), "windows", text(n, "event_id"), syn);
            default -> throw new ParseException("unsupported Windows EventID " + id);
        };
    }

    private static NormalizedEvent win(JsonNode n, String orig, String cls, String action, String outcome, int sev, String host, String user,
                                       String src, String dst, Integer port, String domain, boolean syn, String msg) {
        return new NormalizedEvent(null, ts(orig), orig, cls, action, outcome, sev, host, user, src, dst, port, domain, null, null, null,
                msg, "windows", text(n, "event_id"), syn);
    }

    private static NormalizedEvent suricata(JsonNode n, boolean syn) {
        String orig = req(n, "timestamp");
        String type = req(n, "event_type");
        String src = text(n, "src_ip");
        String dst = text(n, "dest_ip");
        Integer port = n.has("dest_port") && n.get("dest_port").canConvertToInt() ? n.get("dest_port").asInt() : null;
        String host = text(n, "host") != null ? text(n, "host") : dst;
        switch (type) {
            case "alert": {
                JsonNode a = n.path("alert");
                int sev = switch (a.path("severity").asInt(3)) { case 1 -> 9; case 2 -> 6; default -> 3; };
                return new NormalizedEvent(null, ts(orig), orig, "ids", "ids_alert", "unknown", sev, host, null, src, dst, port, null, null, null, null,
                        "IDS alert: " + a.path("signature").asText("(no signature)") + " [" + a.path("category").asText("uncategorized") + "]",
                        "suricata", text(n, "flow_id") != null ? text(n, "flow_id") + ":" + a.path("signature_id").asText() : null, syn);
            }
            case "dns": {
                String q = n.path("dns").path("rrname").asText(null);
                return new NormalizedEvent(null, ts(orig), orig, "dns", "dns_query", "success", 1, host, null, src, dst, port, q, null, null, null,
                        "DNS " + n.path("dns").path("type").asText("query") + " for " + q, "suricata", text(n, "flow_id"), syn);
            }
            case "http": {
                String h = n.path("http").path("hostname").asText(null);
                return new NormalizedEvent(null, ts(orig), orig, "http", "http_request", "success", 1, host, null, src, dst, port, h, null, null, null,
                        "HTTP " + n.path("http").path("http_method").asText("GET") + " " + h + n.path("http").path("url").asText(""), "suricata", text(n, "flow_id"), syn);
            }
            case "tls": {
                String sni = n.path("tls").path("sni").asText(null);
                return new NormalizedEvent(null, ts(orig), orig, "network", "tls_session", "success", 1, host, null, src, dst, port, sni, null, null, null,
                        "TLS session to " + sni, "suricata", text(n, "flow_id"), syn);
            }
            case "flow": {
                return new NormalizedEvent(null, ts(orig), orig, "network", "flow", "unknown", 1, host, null, src, dst, port, null, null, null, null,
                        "Flow " + src + " -> " + dst + ":" + port + " " + n.path("proto").asText(""), "suricata", text(n, "flow_id"), syn);
            }
            default:
                throw new ParseException("unsupported EVE event_type '" + abbreviate(type) + "'");
        }
    }

    private static NormalizedEvent generic(JsonNode n, boolean syn) {
        String orig = req(n, "timestamp");
        String cls = req(n, "event_class");
        if (!Set.of("authentication", "process", "network", "dns", "http", "firewall", "ids", "privilege", "service", "system", "audit").contains(cls))
            throw new ParseException("unknown event_class '" + abbreviate(cls) + "'");
        int sev = n.has("severity") ? n.get("severity").asInt(1) : 1;
        if (sev < 0 || sev > 10) throw new ParseException("severity must be 0-10");
        Integer port = n.has("dst_port") && n.get("dst_port").canConvertToInt() ? n.get("dst_port").asInt() : null;
        if (port != null && (port < 0 || port > 65535)) throw new ParseException("dst_port out of range");
        return new NormalizedEvent(null, ts(orig), orig, cls, req(n, "action"), text(n, "outcome"), sev, text(n, "host"), text(n, "user"),
                text(n, "src_ip"), text(n, "dst_ip"), port, text(n, "domain"), text(n, "process_name"), text(n, "process_cmdline"),
                text(n, "parent_process"), req(n, "message"), text(n, "vendor") != null ? text(n, "vendor") : "generic", text(n, "event_id"), syn);
    }

    // ---- helpers
    static Instant ts(String s) {
        try { return OffsetDateTime.parse(s).toInstant(); }
        catch (DateTimeParseException e1) {
            try { return Instant.parse(s); }
            catch (DateTimeParseException e2) {
                // Suricata uses +0000 without colon
                try { return OffsetDateTime.parse(s, java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSSSSSxx")).toInstant(); }
                catch (DateTimeParseException e3) { throw new ParseException("unparseable timestamp '" + abbreviate(s) + "'"); }
            }
        }
    }

    private static String text(JsonNode n, String f) {
        JsonNode v = n.get(f);
        return v == null || v.isNull() || v.isContainerNode() ? null : v.asText();
    }

    private static String req(JsonNode n, String f) {
        String v = text(n, f);
        if (v == null || v.isBlank()) throw new ParseException("missing required field '" + f + "'");
        return v;
    }

    private static String base(String path) {
        if (path == null) return null;
        int i = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'));
        return (i >= 0 ? path.substring(i + 1) : path).toLowerCase();
    }

    private static String abbreviate(String s) { return s == null ? "null" : s.length() > 40 ? s.substring(0, 40) + "…" : s; }

    private static void enforceLengths(NormalizedEvent e, int max) {
        for (String f : new String[]{"host", "username", "src_ip", "dst_ip", "domain", "process_name", "process_cmdline", "parent_process", "message", "action"}) {
            Object v = e.field(f);
            if (v instanceof String s && s.length() > max) throw new ParseException("field '" + f + "' exceeds " + max + " characters");
        }
    }
}
