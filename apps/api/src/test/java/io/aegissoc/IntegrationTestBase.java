package io.aegissoc;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.testcontainers.containers.PostgreSQLContainer;

import java.util.Map;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;

/** Shared Postgres container (one per JVM) + MockMvc helpers. Each test class starts from a wiped telemetry/case state. */
@SpringBootTest
@AutoConfigureMockMvc
public abstract class IntegrationTestBase {
    static final PostgreSQLContainer<?> PG = new PostgreSQLContainer<>("postgres:16-alpine").withDatabaseName("aegis_test");
    static { PG.start(); }

    public static final String PASSWORD = "Test-Password-123!";
    public static final String ANCHOR = "2026-01-15T00:00:00Z";

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url", PG::getJdbcUrl);
        r.add("spring.datasource.username", PG::getUsername);
        r.add("spring.datasource.password", PG::getPassword);
        r.add("aegis.dev-password", () -> PASSWORD);
    }

    @Autowired protected MockMvc mvc;
    @Autowired protected JdbcClient jdbc;
    protected final ObjectMapper om = new ObjectMapper();

    @BeforeEach
    void wipe() throws Exception {
        mvc.perform(post("/api/admin/dev/reset").with(user("admin").roles("ADMIN")).with(csrf()).header("X-Confirm", "DELETE-DEV-DATA")).andReturn();
        // drafts/versions from earlier classes: reset rules to their built-in v1
        jdbc.sql("DELETE FROM rule_test_runs").update();
        jdbc.sql("DELETE FROM rule_versions WHERE version > 1").update();
        jdbc.sql("UPDATE detection_rules SET current_version = 1, enabled = TRUE").update();
        jdbc.sql("UPDATE data_sources SET enabled = TRUE WHERE source_type IN ('fixture','suricata_eve','json_ingest')").update();
    }

    // ---- request helpers
    public static String roleOf(String username) {
        return switch (username) {
            case "admin" -> "ADMIN"; case "lead" -> "INCIDENT_LEAD"; case "engineer" -> "DETECTION_ENGINEER"; case "viewer" -> "VIEWER"; default -> "ANALYST";
        };
    }

    protected MockHttpServletRequestBuilder as(MockHttpServletRequestBuilder b, String username) {
        return b.with(user(username).roles(roleOf(username))).with(csrf());
    }

    protected JsonNode json(MvcResult r) throws Exception { return om.readTree(r.getResponse().getContentAsString()); }

    protected MvcResult call(String method, String url, String username, Object body) throws Exception {
        MockHttpServletRequestBuilder b = switch (method) {
            case "GET" -> get(url); case "POST" -> post(url); case "PUT" -> put(url); case "PATCH" -> patch(url); case "DELETE" -> delete(url);
            default -> throw new IllegalArgumentException(method);
        };
        b = method.equals("GET") ? b.with(user(username).roles(roleOf(username))) : as(b, username);
        if (body != null) b = b.contentType(MediaType.APPLICATION_JSON).content(body instanceof String s ? s : om.writeValueAsString(body));
        return mvc.perform(b).andReturn();
    }

    protected JsonNode ok(String method, String url, String username, Object body) throws Exception {
        MvcResult r = call(method, url, username, body);
        int s = r.getResponse().getStatus();
        if (s >= 300) throw new AssertionError(method + " " + url + " as " + username + " -> " + s + " " + r.getResponse().getContentAsString());
        return json(r);
    }

    protected int status(String method, String url, String username, Object body) throws Exception { return call(method, url, username, body).getResponse().getStatus(); }

    protected JsonNode runScenario(String id) throws Exception { return runScenario(id, Map.of("seed", 42, "anchor", ANCHOR)); }

    protected JsonNode runScenario(String id, Map<String, Object> body) throws Exception { return ok("POST", "/api/lab/scenarios/" + id + "/run", "analyst", body); }

    protected void runAllPositiveScenarios() throws Exception {
        for (String s : new String[]{"credential_attack", "privilege_service_tamper", "suspicious_process", "ids_lateral", "sensor_silence", "benign_baseline"}) runScenario(s);
    }

    protected long firstAlertOfRule(String ruleId) throws Exception {
        JsonNode list = ok("GET", "/api/alerts?rule=" + ruleId + "&size=5", "viewer", null);
        return list.get("items").get(0).get("id").asLong();
    }
}
