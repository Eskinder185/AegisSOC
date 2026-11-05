package io.aegissoc;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MvcResult;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

class SecurityAndSafetyIT extends IntegrationTestBase {
    static final String R = "from=2026-01-14T00:00:00Z&to=2026-01-17T00:00:00Z";

    // ---------------------------------------------------------------- authentication / authorization
    @Test
    void unauthenticatedRequestsAreRejectedExceptHealthAndLogin() throws Exception {
        for (String url : List.of("/api/alerts", "/api/incidents", "/api/events", "/api/overview", "/api/rules", "/api/sources", "/api/audit", "/api/response/proposals"))
            assertThat(mvc.perform(get(url)).andReturn().getResponse().getStatus()).as(url).isEqualTo(401);
        assertThat(mvc.perform(get("/actuator/health")).andReturn().getResponse().getStatus()).isEqualTo(200);
    }

    @Test
    void loginWorksWithRealUsersWrongPasswordFailsAndLocksOut() throws Exception {
        MockHttpSession session = new MockHttpSession();
        MvcResult ok = mvc.perform(post("/api/auth/login").session(session).contentType("application/json")
                .content("{\"username\":\"analyst\",\"password\":\"" + PASSWORD + "\"}")).andReturn();
        assertThat(ok.getResponse().getStatus()).isEqualTo(200);
        assertThat(json(ok).get("role").asText()).isEqualTo("ANALYST");
        // session authenticates later calls
        assertThat(mvc.perform(get("/api/auth/me").session((MockHttpSession) ok.getRequest().getSession())).andReturn().getResponse().getStatus()).isEqualTo(200);

        for (int i = 0; i < 5; i++)
            assertThat(mvc.perform(post("/api/auth/login").contentType("application/json").content("{\"username\":\"viewer\",\"password\":\"wrong-" + i + "\"}")).andReturn().getResponse().getStatus()).isEqualTo(401);
        assertThat(mvc.perform(post("/api/auth/login").contentType("application/json").content("{\"username\":\"viewer\",\"password\":\"" + PASSWORD + "\"}")).andReturn().getResponse().getStatus())
                .as("locked out even with the right password").isEqualTo(429);
    }

    @Test
    void mutationsRequireCsrfToken() throws Exception {
        int s = mvc.perform(post("/api/lab/scenarios/benign_baseline/run").with(org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user("analyst").roles("ANALYST"))).andReturn().getResponse().getStatus();
        assertThat(s).isEqualTo(403);
    }

    @Test
    void roleBypassAttemptsAreRejected() throws Exception {
        assertThat(status("POST", "/api/lab/scenarios/benign_baseline/run", "viewer", null)).isEqualTo(403);
        assertThat(status("POST", "/api/incidents", "viewer", Map.of("title", "x", "eventIds", List.of(1)))).isEqualTo(403);
        assertThat(status("GET", "/api/audit", "analyst", null)).isEqualTo(403);
        assertThat(status("GET", "/api/audit/verify", "lead", null)).isEqualTo(403);
        assertThat(status("POST", "/api/admin/dev/reset", "analyst", null)).isEqualTo(403);
        assertThat(status("PATCH", "/api/rules/AEG-AUTH-001", "analyst", Map.of("enabled", false, "reason", "x"))).isEqualTo(403);
        assertThat(status("POST", "/api/rules/AEG-AUTH-001/versions", "analyst", Map.of("definition", Map.of("type", "match")))).isEqualTo(403);
        assertThat(status("PATCH", "/api/admin/users/viewer", "lead", Map.of("role", "ADMIN"))).isEqualTo(403);
        assertThat(status("POST", "/api/response/proposals/1/decision", "analyst", Map.of("decision", "APPROVED"))).isEqualTo(403);
        assertThat(status("POST", "/api/sources", "analyst", Map.of("name", "x", "sourceType", "fixture"))).isEqualTo(403);
    }

    @Test
    void securityHeadersAreSet() throws Exception {
        MvcResult r = mvc.perform(get("/actuator/health")).andReturn();
        assertThat(r.getResponse().getHeader("Content-Security-Policy")).contains("default-src 'self'").contains("frame-ancestors 'none'");
        assertThat(r.getResponse().getHeader("X-Content-Type-Options")).isEqualTo("nosniff");
        assertThat(r.getResponse().getHeader("X-Frame-Options")).isEqualTo("DENY");
        assertThat(r.getResponse().getHeader("Referrer-Policy")).isEqualTo("no-referrer");
    }

    @Test
    void adminCannotLockThemselvesOut() throws Exception {
        assertThat(status("PATCH", "/api/admin/users/admin", "admin", Map.of("enabled", false))).isEqualTo(409);
        assertThat(status("PATCH", "/api/admin/users/admin", "admin", Map.of("role", "VIEWER"))).isEqualTo(409);
        assertThat(status("PATCH", "/api/admin/users/viewer", "admin", Map.of("role", "NOT_A_ROLE"))).isEqualTo(400);
    }

    // ---------------------------------------------------------------- hostile input
    @Test
    void htmlInLogFieldsIsStoredInertAndNeverExecutedByAnyServerSideRenderer() throws Exception {
        String evil = "<img src=x onerror=alert(1)>";
        String body = om.writeValueAsString(Map.of("synthetic", true, "events", List.of(Map.of(
                "timestamp", "2026-01-15T00:00:00Z", "event_class", "authentication", "action", "logon_failed", "outcome", "failure",
                "host", "h1", "user", evil, "message", evil, "event_id", "xss-1"))));
        JsonNode run = ok("POST", "/api/ingest/events?synthetic=true", "analyst", om.readTree(body).get("events"));
        assertThat(run.get("eventsAccepted").asInt()).isEqualTo(1);
        JsonNode ev = ok("GET", "/api/events?q=onerror&" + R, "viewer", null);
        assertThat(ev.get("total").asInt()).isEqualTo(1);
        assertThat(ev.get("items").get(0).get("message").asText()).isEqualTo(evil);          // stored verbatim as data
        // JSON content type + nosniff prevents the browser from treating the response as HTML
        MvcResult r = call("GET", "/api/events?q=onerror&" + R, "viewer", null);
        assertThat(r.getResponse().getContentType()).contains("application/json");
        assertThat(r.getResponse().getHeader("X-Content-Type-Options")).isEqualTo("nosniff");
    }

    @Test
    void oversizedAndMalformedInputsAreRejectedSafely() throws Exception {
        // too many events
        StringBuilder many = new StringBuilder("[");
        for (int i = 0; i < 5001; i++) many.append(i == 0 ? "" : ",").append("{}");
        assertThat(status("POST", "/api/ingest/events", "analyst", many.append("]").toString())).isEqualTo(400);
        // deep nesting (JSON bomb)
        String deep = "[" + "{\"a\":".repeat(30) + "1" + "}".repeat(30) + "]";
        assertThat(status("POST", "/api/ingest/events", "analyst", deep)).isEqualTo(400);
        // not JSON
        assertThat(status("POST", "/api/ingest/events", "analyst", "not json at all {{{")).isEqualTo(400);
        // bad rows are reported per row, good rows still land
        String mixed = "[{\"timestamp\":\"2026-01-15T00:00:00Z\",\"event_class\":\"authentication\",\"action\":\"logon\",\"message\":\"ok\",\"host\":\"h\"}, {\"no\":\"timestamp\"}, {\"timestamp\":\"nope\",\"event_class\":\"x\"}]";
        JsonNode run = ok("POST", "/api/ingest/events?synthetic=true", "analyst", mixed);
        assertThat(run.get("eventsAccepted").asInt()).isEqualTo(1);
        assertThat(run.get("eventsRejected").asInt()).isEqualTo(2);
        JsonNode detail = ok("GET", "/api/ingestion/runs/" + run.get("id").asLong(), "viewer", null);
        assertThat(detail.get("errors")).hasSize(2);
        assertThat(detail.get("errors").get(0).get("rowNo").asInt()).isEqualTo(2);
    }

    @Test
    void suricataEveImportParsesAlertDnsAndRejectsUnsupportedTypes() throws Exception {
        String eve = String.join("\n",
                "{\"timestamp\":\"2026-01-15T00:00:01.123456+0000\",\"event_type\":\"alert\",\"src_ip\":\"10.20.0.15\",\"dest_ip\":\"10.20.0.50\",\"dest_port\":445,\"proto\":\"TCP\",\"flow_id\":1,\"alert\":{\"signature\":\"TEST\",\"category\":\"x\",\"severity\":1,\"signature_id\":1}}",
                "{\"timestamp\":\"2026-01-15T00:00:02.000000+0000\",\"event_type\":\"dns\",\"src_ip\":\"10.20.0.15\",\"dest_ip\":\"10.20.0.1\",\"flow_id\":2,\"dns\":{\"rrname\":\"c2-demo.example\",\"type\":\"query\"}}",
                "{\"timestamp\":\"2026-01-15T00:00:03.000000+0000\",\"event_type\":\"stats\"}",
                "this line is not json");
        MvcResult r = mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart("/api/ingest/suricata")
                .file(new org.springframework.mock.web.MockMultipartFile("file", "eve.json", "application/json", eve.getBytes()))
                .param("synthetic", "true").with(org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user("analyst").roles("ANALYST")).with(csrf())).andReturn();
        JsonNode run = json(r);
        assertThat(r.getResponse().getStatus()).isEqualTo(200);
        assertThat(run.get("eventsAccepted").asInt()).isEqualTo(2);
        assertThat(run.get("eventsRejected").asInt()).isEqualTo(2);
        assertThat(run.get("alertsCreated").asInt()).isGreaterThanOrEqualTo(2);  // IDS-001 + TI-001 (synthetic indicator domain)
        // wrong file type
        MvcResult bad = mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart("/api/ingest/suricata")
                .file(new org.springframework.mock.web.MockMultipartFile("file", "evil.exe", "application/octet-stream", "MZ".getBytes()))
                .with(org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user("analyst").roles("ANALYST")).with(csrf())).andReturn();
        assertThat(bad.getResponse().getStatus()).isEqualTo(400);
    }

    @Test
    void searchIsBoundedAndAllowlisted() throws Exception {
        runScenario("credential_attack");
        assertThat(status("GET", "/api/events?sql=drop%20table%20users", "viewer", null)).isEqualTo(400);
        assertThat(status("GET", "/api/events?from=2020-01-01T00:00:00Z&to=2026-01-01T00:00:00Z", "viewer", null)).isEqualTo(400);   // > 31 days
        assertThat(status("GET", "/api/events?q=" + "a".repeat(101), "viewer", null)).isEqualTo(400);
        assertThat(status("GET", "/api/events?from=garbage", "viewer", null)).isEqualTo(400);
        JsonNode big = ok("GET", "/api/events?size=100000", "viewer", null);
        assertThat(big.get("size").asInt()).isEqualTo(200);                         // capped
        // injection attempt in a filter value is just a non-matching literal
        JsonNode inj = ok("GET", "/api/events?host=" + java.net.URLEncoder.encode("x' OR '1'='1", "UTF-8"), "viewer", null);
        assertThat(inj.get("total").asInt()).isZero();
        assertThat(jdbc.sql("SELECT count(*) FROM users").query(Long.class).single()).isEqualTo(5);
    }

    @Test
    void csvExportNeutralizesFormulasAndIsAuditedAndRedactedByDefault() throws Exception {
        ok("POST", "/api/ingest/events?synthetic=true", "analyst", List.of(Map.of("timestamp", "2026-01-15T00:00:00Z", "event_class", "authentication", "action", "logon", "host", "box-1", "user", "mallory",
                "message", "=HYPERLINK(\"http://evil.example\",\"x\")", "event_id", "csv-1")));
        MvcResult r = call("GET", "/api/events/export?from=2026-01-14T00:00:00Z&to=2026-01-16T00:00:00Z", "analyst", null);
        String csv = r.getResponse().getContentAsString();
        assertThat(csv).contains("'=HYPERLINK").doesNotContain(",\"=HYPERLINK").doesNotContain("mallory").doesNotContain("box-1").contains("user-").contains("host-");
        assertThat(jdbc.sql("SELECT count(*) FROM audit_events WHERE action = 'events.export'").query(Long.class).single()).isEqualTo(1);
    }

    @Test
    void auditChainDetectsTampering() throws Exception {
        runScenario("benign_baseline");
        assertThat(ok("GET", "/api/audit/verify", "admin", null).get("valid").asBoolean()).isTrue();
        jdbc.sql("UPDATE audit_events SET actor = 'mallory' WHERE id = (SELECT min(id) FROM audit_events WHERE action = 'ingest.start')").update();
        JsonNode v = ok("GET", "/api/audit/verify", "admin", null);
        assertThat(v.get("valid").asBoolean()).isFalse();
        assertThat(v.get("brokenIds")).isNotEmpty();
        jdbc.sql("UPDATE audit_events SET actor = 'analyst' WHERE actor = 'mallory'").update();
        assertThat(ok("GET", "/api/audit/verify", "admin", null).get("valid").asBoolean()).isTrue();
    }

    @Test
    void networkConnectorsStayDisabledAndUntestable() throws Exception {
        JsonNode sources = ok("GET", "/api/sources", "viewer", null);
        for (JsonNode s : sources) {
            if (List.of("wazuh", "aegisai", "netshield", "cloud_json").contains(s.get("sourceType").asText())) {
                assertThat(s.get("enabled").asBoolean()).as(s.get("name").asText()).isFalse();
                assertThat(s.get("health").asText()).isEqualTo("DISABLED");
            }
        }
        long wazuh = sources.findParents("sourceType").stream().filter(n -> n.get("sourceType").asText().equals("wazuh")).findFirst().orElseThrow().get("id").asLong();
        JsonNode t = ok("POST", "/api/sources/" + wazuh + "/test", "analyst", null);
        assertThat(t.get("networkAttempted").asBoolean()).isFalse();
        assertThat(t.get("configured").asBoolean()).isFalse();
        assertThat(status("PATCH", "/api/sources/" + wazuh, "admin", Map.of("enabled", true))).isEqualTo(409);
        assertThat(status("POST", "/api/ingest/events", "analyst", "[]")).isEqualTo(400);
    }

    @Test
    void retentionAndDevResetRequireExplicitConfirmation() throws Exception {
        runScenario("credential_attack");
        assertThat(status("POST", "/api/admin/retention/run", "admin", Map.of("days", 1))).isEqualTo(400);
        assertThat(status("POST", "/api/admin/dev/reset", "admin", null)).isEqualTo(400);
        // retention never removes events cited as alert evidence
        MvcResult r = mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/admin/retention/run").contentType("application/json").content("{\"days\":1}")
                .header("X-Confirm", "DELETE-OLD-EVENTS").with(org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user("admin").roles("ADMIN")).with(csrf())).andReturn();
        assertThat(r.getResponse().getStatus()).isEqualTo(200);
        assertThat(json(r).get("eventsDeleted").asInt()).isEqualTo(20);      // 28 events - 8 cited as alert evidence
        assertThat(jdbc.sql("SELECT count(*) FROM normalized_events").query(Long.class).single()).isEqualTo(8);
        assertThat(jdbc.sql("SELECT count(*) FROM alert_evidence").query(Long.class).single()).isEqualTo(8);
    }
}
