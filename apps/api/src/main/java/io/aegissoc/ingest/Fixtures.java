package io.aegissoc.ingest;

import com.fasterxml.jackson.databind.node.ObjectNode;
import io.aegissoc.common.Json;

import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;

/**
 * Deterministic SYNTHETIC telemetry generator. Same (scenario, seed, anchor) always yields byte-identical events.
 * Every event is labelled synthetic; scenario objects also carry ground-truth expectations used by rule tests.
 * All IPs are RFC 5737 documentation ranges or RFC 1918; all domains use reserved TLDs. Nothing here touches a network.
 */
public final class Fixtures {
    public record Expectation(String ruleId, String key) {}

    public record Scenario(String id, String title, String description, List<String> exercises,
                           List<ObjectNode> events, List<Expectation> positives, List<Expectation> negatives) {}

    public record Meta(String id, String title, String description, List<String> exercises) {}

    public static final List<Meta> CATALOG = List.of(
            new Meta("credential_attack", "Credential attack with a benign look-alike",
                    "A VPN gateway sees 7 rapid failed sign-ins for one account from an external address followed by a success, alongside a user who just mistyped a password and a slow, low-volume guesser.",
                    List.of("AEG-AUTH-001")),
            new Meta("privilege_service_tamper", "Privilege change and security service stop",
                    "An account that just signed in from an external address adds itself to Administrators and a security agent is stopped, alongside an approved patch-service change and an unrelated print service stop.",
                    List.of("AEG-PRIV-001", "AEG-ACCT-001", "AEG-SVC-001")),
            new Meta("suspicious_process", "Office app spawning an encoded script",
                    "A word processor launches a script interpreter with an encoded command and the host then queries a synthetic threat-intel domain; a normal admin backup script runs on another host.",
                    List.of("AEG-PROC-001", "AEG-TI-001")),
            new Meta("ids_lateral", "IDS alert followed by a login from the same source",
                    "An IDS alert on SMB is followed minutes later by a successful login from the same internal address (a lateral-movement HYPOTHESIS), next to IDS alerts with no follow-up and low-severity noise.",
                    List.of("AEG-IDS-001", "AEG-LAT-001")),
            new Meta("sensor_silence", "Telemetry silence",
                    "Five hosts report heartbeats; one firewall stops reporting. Distinguishes a silent sensor from a quiet network.",
                    List.of("AEG-SENS-001")),
            new Meta("benign_baseline", "Benign baseline",
                    "Three hours of ordinary logons, DNS, process and admin activity that must NOT produce alerts. Used to measure false positives.",
                    List.of()),
            new Meta("corrupted_feed", "Corrupted feed (failure drill)",
                    "A feed containing malformed events. Ingestion reports row-level errors and marks the source FAILED; replay with repair=true to recover.",
                    List.of()));

    private Fixtures() {}

    public static Instant defaultAnchor(Instant now) { return now.truncatedTo(ChronoUnit.HOURS).minus(4, ChronoUnit.HOURS); }

    public static Scenario generate(String id, long seed, Instant anchor, boolean repair) {
        Ctx c = new Ctx(id, seed, anchor);
        switch (id) {
            case "credential_attack" -> credentialAttack(c);
            case "privilege_service_tamper" -> privilegeServiceTamper(c);
            case "suspicious_process" -> suspiciousProcess(c);
            case "ids_lateral" -> idsLateral(c);
            case "sensor_silence" -> sensorSilence(c);
            case "benign_baseline" -> benignBaseline(c);
            case "corrupted_feed" -> corruptedFeed(c, repair);
            default -> throw new IllegalArgumentException("Unknown scenario: " + id);
        }
        Meta m = CATALOG.stream().filter(x -> x.id().equals(id)).findFirst().orElseThrow();
        return new Scenario(id, m.title(), m.description(), m.exercises(), c.events, c.pos, c.neg);
    }

    /** The labelled regression dataset used by rule tests: fixed seed and anchor, repair irrelevant. */
    public static final Instant TEST_ANCHOR = Instant.parse("2026-01-15T00:00:00Z");
    public static final long TEST_SEED = 42L;

    public static List<Scenario> testSuite() {
        List<Scenario> out = new ArrayList<>();
        for (String id : List.of("credential_attack", "privilege_service_tamper", "suspicious_process", "ids_lateral", "sensor_silence", "benign_baseline"))
            out.add(generate(id, TEST_SEED, TEST_ANCHOR, false));
        return out;
    }

    // ------------------------------------------------------------------ scenarios

    private static void credentialAttack(Ctx c) {
        for (int i = 0; i < 7; i++) c.linux("vpn-gw-01", 600 + i * 25, "jdoe", "198.51.100.23", false);
        c.linux("vpn-gw-01", 600 + 7 * 25 + 40, "jdoe", "198.51.100.23", true);
        c.pos("AEG-AUTH-001", "jdoe|198.51.100.23");
        for (int i = 0; i < 3; i++) c.linux("vpn-gw-01", 1800 + i * 20, "alice", "10.20.0.31", false);
        c.linux("vpn-gw-01", 1890, "alice", "10.20.0.31", true);
        c.neg("AEG-AUTH-001", "alice|10.20.0.31");
        for (int i = 0; i < 4; i++) c.linux("vpn-gw-01", 2400 + i * 480, "bob", "203.0.113.9", false);
        c.neg("AEG-AUTH-001", "bob|203.0.113.9");
        String[] users = {"carol", "dave", "erin"};
        for (int i = 0; i < 12; i++) c.linux(i % 2 == 0 ? "vpn-gw-01" : "srv-app-01", 200 + c.rnd.nextInt(3200), users[i % 3], "10.20.0." + (40 + i % 3), true);
    }

    private static void privilegeServiceTamper(Ctx c) {
        c.winLogon("srv-app-01", 300, "jdoe", "198.51.100.23", true);
        c.winGroupAdd("srv-app-01", 540, "jdoe", "jdoe", "Administrators");
        c.pos("AEG-PRIV-001", "srv-app-01|jdoe");
        c.pos("AEG-ACCT-001", "jdoe");
        c.winLogon("srv-app-01", 1200, "svc-patch", "10.20.0.5", true);
        c.winGroupAdd("srv-app-01", 1260, "svc-patch", "svc-ci", "Remote Management Users");
        c.neg("AEG-PRIV-001", "srv-app-01|svc-patch");
        c.neg("AEG-ACCT-001", "svc-patch");
        c.winService("ws-fin-02", 2000, "wazuh-agent");
        c.pos("AEG-SVC-001", "ws-fin-02");
        c.winService("srv-print-01", 2100, "cups");
        c.neg("AEG-SVC-001", "srv-print-01");
        for (int i = 0; i < 6; i++) c.winLogon("srv-app-01", 100 + c.rnd.nextInt(3000), "carol", "10.20.0.41", true);
    }

    private static void suspiciousProcess(Ctx c) {
        c.winProc("ws-fin-02", 900, "mchen",
                "C:\\Program Files\\Microsoft Office\\root\\Office16\\WINWORD.EXE",
                "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
                "powershell.exe -nop -w hidden -enc U1lOVEhFVElDLUZJWFRVUkU=");
        c.pos("AEG-PROC-001", "ws-fin-02|mchen");
        c.winDns("ws-fin-02", 920, "mchen", "c2-demo.example");
        c.pos("AEG-TI-001", "c2-demo.example");
        c.generic("ws-fin-02", 935, "network", "connection", "success", 2, "mchen", "10.20.0.15", "203.0.113.66", 443, null,
                "Outbound TLS connection to 203.0.113.66:443");
        c.pos("AEG-TI-001", "203.0.113.66");
        c.winProc("ws-dev-01", 1500, "dpark", "C:\\Windows\\explorer.exe",
                "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe", "powershell.exe -File C:\\scripts\\backup.ps1");
        c.neg("AEG-PROC-001", "ws-dev-01|dpark");
        c.winDns("ws-dev-01", 1520, "dpark", "updates.example.net");
        c.neg("AEG-TI-001", "updates.example.net");
        for (int i = 0; i < 8; i++) c.winDns("ws-dev-01", 100 + c.rnd.nextInt(3000), "dpark", i % 2 == 0 ? "docs.example.org" : "mirror.example.org");
    }

    private static void idsLateral(Ctx c) {
        c.eve("srv-file-01", 600, "10.20.0.15", "10.20.0.50", 445, 1, "AEGIS-FIXTURE SMB suspicious transaction (synthetic)", "exploit-attempt");
        c.pos("AEG-IDS-001", "10.20.0.15|10.20.0.50");
        c.winLogon("srv-file-01", 600 + 240, "svc-backup", "10.20.0.15", true);
        c.pos("AEG-LAT-001", "10.20.0.15");
        c.eve("srv-web-01", 1500, "10.20.0.99", "10.20.0.60", 80, 1, "AEGIS-FIXTURE web probe (synthetic)", "web-application-attack");
        c.pos("AEG-IDS-001", "10.20.0.99|10.20.0.60");
        c.neg("AEG-LAT-001", "10.20.0.99");
        for (int i = 0; i < 3; i++) c.eve("srv-web-01", 2000 + i * 60, "10.20.0.40", "10.20.0.60", 80, 3, "AEGIS-FIXTURE informational scan notice (synthetic)", "misc-activity");
        c.neg("AEG-IDS-001", "10.20.0.40|10.20.0.60");
        c.eve("srv-web-01", 3000, "10.20.0.88", "10.20.0.60", 80, 1, "AEGIS-FIXTURE web probe (synthetic)", "web-application-attack");
        c.pos("AEG-IDS-001", "10.20.0.88|10.20.0.60");
        c.winLogon("srv-file-01", 3000 + 7200, "eve", "10.20.0.88", true);
        c.neg("AEG-LAT-001", "10.20.0.88");
        c.eve("srv-web-01", 10140, "10.20.0.60", "10.20.0.99", 80, 3,
                "AEGIS-FIXTURE informational heartbeat (synthetic)", "misc-activity");
    }

    private static void sensorSilence(Ctx c) {
        String[] hosts = {"srv-app-01", "srv-db-01", "ws-fin-02", "fw-edge-01"};
        for (String h : hosts) {
            int end = h.equals("fw-edge-01") ? 1800 : 5400;
            for (int t = 0; t <= end; t += 300) c.generic(h, t, "system", "heartbeat", "success", 0, null, null, null, null, null, "Sensor heartbeat from " + h);
        }
        c.generic("ws-dev-01", 0, "system", "heartbeat", "success", 0, null, null, null, null, null, "Sensor heartbeat from ws-dev-01");
        c.generic("ws-dev-01", 300, "system", "heartbeat", "success", 0, null, null, null, null, null, "Sensor heartbeat from ws-dev-01");
        c.pos("AEG-SENS-001", "fw-edge-01");
        for (String h : List.of("srv-app-01", "srv-db-01", "ws-fin-02", "ws-dev-01")) c.neg("AEG-SENS-001", h);
    }

    private static void benignBaseline(Ctx c) {
        String[] users = {"carol", "dave", "erin", "frank"};
        for (int i = 0; i < 24; i++) c.linux(i % 2 == 0 ? "srv-app-01" : "vpn-gw-01", c.rnd.nextInt(10800), users[i % 4], "10.20.0." + (30 + i % 4), true);
        c.linux("vpn-gw-01", 4000, "dave", "10.20.0.33", false);
        c.linux("vpn-gw-01", 4030, "dave", "10.20.0.33", false);
        c.linux("vpn-gw-01", 4070, "dave", "10.20.0.33", true);
        c.neg("AEG-AUTH-001", "dave|10.20.0.33");
        for (int i = 0; i < 10; i++)
            c.winProc("ws-dev-01", c.rnd.nextInt(10800), "dpark", "C:\\Windows\\explorer.exe", "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "chrome.exe --profile-directory=Default");
        for (int i = 0; i < 12; i++) c.winDns("ws-dev-01", c.rnd.nextInt(10800), "dpark", i % 3 == 0 ? "docs.example.org" : i % 3 == 1 ? "mirror.example.org" : "updates.example.net");
        c.winLogon("srv-app-01", 5000, "svc-patch", "10.20.0.5", true);
        c.neg("AEG-ACCT-001", "svc-patch");
    }

    private static void corruptedFeed(Ctx c, boolean repair) {
        c.linux("vpn-gw-01", 60, "carol", "10.20.0.41", true);
        c.linux("vpn-gw-01", 120, "dave", "10.20.0.42", true);
        c.linux("vpn-gw-01", 180, "erin", "10.20.0.43", true);
        if (repair) {
            c.linux("vpn-gw-01", 240, "carol", "10.20.0.41", true);
            c.linux("vpn-gw-01", 300, "dave", "10.20.0.42", true);
            c.linux("vpn-gw-01", 360, "erin", "10.20.0.43", true);
            return;
        }
        ObjectNode noTs = c.base("linux_auth", "vpn-gw-01");
        noTs.put("result", "accepted").put("user", "frank");
        c.events.add(noTs);
        ObjectNode badFormat = Json.MAPPER.createObjectNode();
        badFormat.put("format", "carrier_pigeon").put("event_id", c.id());
        c.events.add(badFormat);
        ObjectNode badTs = c.base("linux_auth", "vpn-gw-01");
        badTs.put("timestamp", "yesterday-ish").put("result", "accepted").put("user", "gina");
        c.events.add(badTs);
    }

    // ------------------------------------------------------------------ builder

    private static final class Ctx {
        final String scenario;
        final Instant anchor;
        final Random rnd;
        final List<ObjectNode> events = new ArrayList<>();
        final List<Expectation> pos = new ArrayList<>();
        final List<Expectation> neg = new ArrayList<>();
        int counter = 0;

        Ctx(String scenario, long seed, Instant anchor) {
            this.scenario = scenario; this.anchor = anchor; this.rnd = new Random(seed * 31 + scenario.hashCode());
        }

        void pos(String rule, String key) { pos.add(new Expectation(rule, key)); }
        void neg(String rule, String key) { neg.add(new Expectation(rule, key)); }
        String id() { return scenario + "-" + String.format("%04d", ++counter); }
        String iso(int offsetSec) { return DateTimeFormatter.ISO_INSTANT.format(anchor.plusSeconds(offsetSec)); }

        ObjectNode base(String format, String host) {
            ObjectNode n = Json.MAPPER.createObjectNode();
            n.put("format", format).put("event_id", id()).put("synthetic", true).put("fixture_scenario", scenario);
            if (host != null) n.put("hostname", host);
            return n;
        }

        void linux(String host, int t, String user, String ip, boolean ok) {
            ObjectNode n = base("linux_auth", host);
            n.put("timestamp", iso(t)).put("program", "sshd").put("user", user).put("src_ip", ip).put("result", ok ? "accepted" : "failed");
            n.put("message", "sshd[" + (1000 + rnd.nextInt(8000)) + "]: " + (ok ? "Accepted" : "Failed") + " password for " + user + " from " + ip);
            events.add(n);
        }

        private ObjectNode win(int eventId, String host, int t) {
            ObjectNode n = base("windows_event", null);
            n.put("EventID", eventId).put("Computer", host);
            // Windows events carry a non-UTC offset on purpose: exercises timezone normalization.
            n.put("TimeCreated", anchor.plusSeconds(t).atOffset(java.time.ZoneOffset.ofHours(-5)).toString());
            return n;
        }

        void winLogon(String host, int t, String user, String ip, boolean ok) {
            ObjectNode n = win(ok ? 4624 : 4625, host, t);
            n.put("TargetUserName", user).put("IpAddress", ip);
            events.add(n);
        }

        void winGroupAdd(String host, int t, String actor, String member, String group) {
            ObjectNode n = win(4728, host, t);
            n.put("SubjectUserName", actor).put("MemberName", member).put("GroupName", group);
            events.add(n);
        }

        void winService(String host, int t, String svc) {
            ObjectNode n = win(7036, host, t);
            n.put("ServiceName", svc);
            events.add(n);
        }

        void winProc(String host, int t, String user, String parent, String image, String cmd) {
            ObjectNode n = win(4688, host, t);
            n.put("SubjectUserName", user).put("ParentProcessName", parent).put("NewProcessName", image).put("CommandLine", cmd);
            events.add(n);
        }

        void winDns(String host, int t, String user, String query) {
            ObjectNode n = win(22, host, t);
            n.put("User", user).put("QueryName", query).put("Image", "C:\\Windows\\System32\\svchost.exe");
            events.add(n);
        }

        void eve(String host, int t, String src, String dst, int port, int severity, String sig, String cat) {
            ObjectNode n = Json.MAPPER.createObjectNode();
            n.put("event_id", id()).put("synthetic", true).put("fixture_scenario", scenario);
            n.put("timestamp", anchor.plusSeconds(t).atOffset(java.time.ZoneOffset.UTC).format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSSSSSxx")));
            n.put("event_type", "alert").put("src_ip", src).put("dest_ip", dst).put("dest_port", port).put("proto", "TCP").put("host", host);
            n.put("flow_id", String.valueOf(1000000L + counter));
            ObjectNode a = n.putObject("alert");
            a.put("signature", sig).put("category", cat).put("severity", severity).put("signature_id", 9000000 + counter);
            events.add(n);
        }

        void generic(String host, int t, String cls, String action, String outcome, int sev, String user, String src, String dst, Integer port, String domain, String msg) {
            ObjectNode n = base("generic", host);
            n.remove("hostname");
            n.put("host", host).put("timestamp", iso(t)).put("event_class", cls).put("action", action).put("severity", sev).put("message", msg);
            if (outcome != null) n.put("outcome", outcome);
            if (user != null) n.put("user", user);
            if (src != null) n.put("src_ip", src);
            if (dst != null) n.put("dst_ip", dst);
            if (port != null) n.put("dst_port", port);
            if (domain != null) n.put("domain", domain);
            events.add(n);
        }
    }

    /** For API consumers: describe a scenario without events. */
    public static Map<String, Object> describe(Meta m) {
        Map<String, Object> o = new LinkedHashMap<>();
        o.put("id", m.id()); o.put("title", m.title()); o.put("description", m.description()); o.put("exercisesRules", m.exercises());
        o.put("synthetic", true);
        return o;
    }
}
