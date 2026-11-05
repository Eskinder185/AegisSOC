package io.aegissoc;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MvcResult;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** Journeys 2 and 6: triage -> case -> closure with audit, report export, and the response approval boundary. */
class WorkflowIT extends IntegrationTestBase {

    private long incidentFromCredentialAlert() throws Exception {
        runScenario("credential_attack");
        long alertId = firstAlertOfRule("AEG-AUTH-001");
        ok("POST", "/api/alerts/" + alertId + "/transition", "analyst", Map.of("to", "ACKNOWLEDGED", "note", "looking"));
        JsonNode inc = ok("POST", "/api/incidents", "analyst", Map.of("title", "Suspicious sign-ins for jdoe", "summary", "Synthetic test case", "alertIds", List.of(alertId)));
        return inc.get("id").asLong();
    }

    @Test
    void alertToIncidentToClosureToReopenWithFullAudit() throws Exception {
        long id = incidentFromCredentialAlert();
        JsonNode inc = ok("GET", "/api/incidents/" + id, "viewer", null);
        assertThat(inc.get("severity").asText()).isEqualTo("HIGH");
        assertThat(inc.get("synthetic").asBoolean()).isTrue();
        assertThat(inc.get("evidence")).hasSize(8);
        assertThat(inc.at("/guide/know").toString()).contains("jdoe");
        assertThat(inc.at("/guide/uncertain").toString()).contains("SYNTHETIC");
        assertThat(inc.get("entities").get("users").toString()).contains("jdoe");
        // the alert was escalated and linked back
        long alertId = inc.get("alerts").get(0).get("id").asLong();
        JsonNode alert = ok("GET", "/api/alerts/" + alertId, "viewer", null);
        assertThat(alert.get("status").asText()).isEqualTo("ESCALATED");
        assertThat(alert.get("incidents").get(0).get("id").asLong()).isEqualTo(id);

        ok("POST", "/api/incidents/" + id + "/notes", "analyst", Map.of("kind", "OBSERVATION", "body", "7 failures in 150s then a success"));
        JsonNode withTask = ok("POST", "/api/incidents/" + id + "/tasks", "analyst", Map.of("title", "Ask account owner"));
        long taskId = withTask.get("tasks").get(0).get("id").asLong();

        ok("POST", "/api/incidents/" + id + "/transition", "analyst", Map.of("to", "TRIAGE"));
        ok("POST", "/api/incidents/" + id + "/transition", "analyst", Map.of("to", "INVESTIGATING"));
        // open task blocks resolution
        assertThat(status("POST", "/api/incidents/" + id + "/transition", "analyst", Map.of("to", "RESOLVED", "resolution", "TEST_ACTIVITY", "note", "n"))).isEqualTo(409);
        ok("PATCH", "/api/incidents/" + id + "/tasks/" + taskId, "analyst", Map.of("done", true));
        // resolution + note are mandatory
        assertThat(status("POST", "/api/incidents/" + id + "/transition", "analyst", Map.of("to", "RESOLVED"))).isEqualTo(400);
        ok("POST", "/api/incidents/" + id + "/transition", "analyst", Map.of("to", "RESOLVED", "resolution", "TEST_ACTIVITY", "note", "Synthetic fixture, expected"));
        // analysts cannot close; leads can
        assertThat(status("POST", "/api/incidents/" + id + "/transition", "analyst", Map.of("to", "CLOSED"))).isEqualTo(403);
        ok("POST", "/api/incidents/" + id + "/transition", "lead", Map.of("to", "CLOSED", "note", "done"));
        JsonNode closed = ok("GET", "/api/incidents/" + id, "viewer", null);
        assertThat(closed.get("status").asText()).isEqualTo("CLOSED");
        assertThat(closed.get("classification").asText()).isEqualTo("EXPECTED_TEST_ACTIVITY");
        assertThat(ok("GET", "/api/alerts/" + alertId, "viewer", null).get("status").asText()).isEqualTo("CLOSED");

        // reopen needs a lead and a reason
        assertThat(status("POST", "/api/incidents/" + id + "/transition", "analyst", Map.of("to", "INVESTIGATING", "note", "x"))).isEqualTo(403);
        assertThat(status("POST", "/api/incidents/" + id + "/transition", "lead", Map.of("to", "INVESTIGATING"))).isEqualTo(400);
        ok("POST", "/api/incidents/" + id + "/transition", "lead", Map.of("to", "INVESTIGATING", "note", "New evidence"));
        JsonNode reopened = ok("GET", "/api/incidents/" + id, "viewer", null);
        assertThat(reopened.get("status").asText()).isEqualTo("INVESTIGATING");
        assertThat(reopened.get("activity").toString()).contains("RESOLVED → CLOSED").contains("CLOSED → INVESTIGATING");

        // every state change is in the tamper-evident audit log
        assertThat(jdbc.sql("SELECT count(*) FROM audit_events WHERE action = 'incident.transition'").query(Long.class).single()).isGreaterThanOrEqualTo(6);
        assertThat(ok("GET", "/api/audit/verify", "admin", null).get("valid").asBoolean()).isTrue();
    }

    @Test
    void illegalTransitionsAreRejected() throws Exception {
        long id = incidentFromCredentialAlert();
        assertThat(status("POST", "/api/incidents/" + id + "/transition", "lead", Map.of("to", "CLOSED"))).isEqualTo(409);
        assertThat(status("POST", "/api/incidents/" + id + "/transition", "analyst", Map.of("to", "CONTAINED"))).isEqualTo(409);
        assertThat(status("POST", "/api/incidents/" + id + "/transition", "analyst", Map.of("to", "NOPE"))).isEqualTo(409);
        long alertId = firstAlertOfRule("AEG-AUTH-001");
        assertThat(status("POST", "/api/alerts/" + alertId + "/transition", "analyst", Map.of("to", "NEW"))).isEqualTo(409);
        assertThat(status("POST", "/api/alerts/" + alertId + "/transition", "analyst", Map.of("to", "CLOSED"))).isEqualTo(400); // needs resolution
    }

    @Test
    void reportIsBuiltFromStoredRecordsRedactedAndEscaped() throws Exception {
        long id = incidentFromCredentialAlert();
        ok("POST", "/api/incidents/" + id + "/notes", "analyst", Map.of("kind", "ANALYST_NOTE", "body", "<script>alert(1)</script> | pipe"));
        MvcResult md = call("GET", "/api/incidents/" + id + "/report?format=md&redact=true", "analyst", null);
        String body = md.getResponse().getContentAsString();
        assertThat(md.getResponse().getStatus()).isEqualTo(200);
        assertThat(md.getResponse().getHeader("X-Content-SHA256")).hasSize(64);
        assertThat(body).contains("SYNTHETIC").contains("Evidence (immutable event records)").contains("#" + id).contains("&lt;script&gt;").doesNotContain("<script>");
        assertThat(body).doesNotContain("jdoe").doesNotContain("198.51.100.23").contains("198.51.100.x").contains("user-");
        String raw = call("GET", "/api/incidents/" + id + "/report?format=md&redact=false", "analyst", null).getResponse().getContentAsString();
        assertThat(raw).contains("jdoe");
        JsonNode js = json(call("GET", "/api/incidents/" + id + "/report?format=json", "analyst", null));
        assertThat(js.get("redacted").asBoolean()).isTrue();
        assertThat(js.get("evidence")).hasSize(8);
        assertThat(jdbc.sql("SELECT count(*) FROM report_exports WHERE subject_id = :i").param("i", id).query(Long.class).single()).isEqualTo(3);
        assertThat(status("GET", "/api/incidents/" + id + "/report", "viewer", null)).isEqualTo(403);
    }

    @Test
    void bulkActionsRespectRoleSafeguards() throws Exception {
        runAllPositiveScenarios();
        JsonNode high = ok("GET", "/api/alerts?severity=HIGH&size=50", "viewer", null);
        long highId = high.get("items").get(0).get("id").asLong();
        JsonNode r = ok("POST", "/api/alerts/bulk", "analyst", Map.of("ids", List.of(highId), "action", "close", "resolution", "FALSE_POSITIVE", "note", "x"));
        assertThat(r.get("updated").asInt()).isZero();
        assertThat(r.get("skipped")).hasSize(1);
        JsonNode r2 = ok("POST", "/api/alerts/bulk", "lead", Map.of("ids", List.of(highId), "action", "close", "resolution", "FALSE_POSITIVE", "note", "Reviewed"));
        assertThat(r2.get("updated").asInt()).isEqualTo(1);
        assertThat(ok("GET", "/api/alerts/" + highId, "viewer", null).get("classification").asText()).isEqualTo("BENIGN");
    }

    // ------------------------------------------------------------------ Journey 6
    @Test
    void responseApprovalNeverExecutesAndEnforcesScopeAndSeparationOfDuties() throws Exception {
        long id = incidentFromCredentialAlert();
        ok("POST", "/api/incidents/" + id + "/transition", "analyst", Map.of("to", "INVESTIGATING"));
        // out-of-scope target
        assertThat(status("POST", "/api/response/incidents/" + id + "/proposals", "analyst", Map.of("actionType", "BLOCK_IP", "target", "8.8.8.8", "reason", "x"))).isEqualTo(422);
        assertThat(status("POST", "/api/response/incidents/" + id + "/proposals", "analyst", Map.of("actionType", "FORMAT_DISK", "target", "jdoe", "reason", "x"))).isEqualTo(400);
        JsonNode p = ok("POST", "/api/response/incidents/" + id + "/proposals", "analyst", Map.of("actionType", "BLOCK_IP", "target", "198.51.100.23", "reason", "Source of guessing"));
        long pid = p.get("id").asLong();
        assertThat(p.get("mode").asText()).isEqualTo("SIMULATION");
        assertThat(p.get("status").asText()).isEqualTo("PENDING");
        assertThat(p.at("/simulation/eventsInvolvingAddress").asInt()).isGreaterThan(0);
        assertThat(p.at("/simulation/warnings").toString()).contains("shared");
        assertThat(p.get("rollback").asText()).contains("Manual");
        assertThat(ok("GET", "/api/incidents/" + id, "viewer", null).get("status").asText()).isEqualTo("CONTAINMENT_PROPOSED");

        // analysts cannot approve; requester (lead) cannot approve own
        assertThat(status("POST", "/api/response/proposals/" + pid + "/decision", "analyst", Map.of("decision", "APPROVED"))).isEqualTo(403);
        JsonNode leadsOwn = ok("POST", "/api/response/incidents/" + id + "/proposals", "lead", Map.of("actionType", "ISOLATE_HOST", "target", "vpn-gw-01", "reason", "Contain"));
        assertThat(status("POST", "/api/response/proposals/" + leadsOwn.get("id").asLong() + "/decision", "lead", Map.of("decision", "APPROVED"))).isEqualTo(403);
        assertThat(status("POST", "/api/response/proposals/" + pid + "/decision", "lead", Map.of("decision", "REJECTED"))).isEqualTo(400); // comment required for rejection

        JsonNode approved = ok("POST", "/api/response/proposals/" + pid + "/decision", "lead", Map.of("decision", "APPROVED", "comment", "OK in simulation"));
        assertThat(approved.get("status").asText()).isEqualTo("APPROVED");
        assertThat(approved.get("banner").asText()).contains("SIMULATION").contains("No real system was changed");
        assertThat(status("POST", "/api/response/proposals/" + pid + "/decision", "lead", Map.of("decision", "APPROVED"))).isEqualTo(409); // already decided

        // approval alone cannot make the incident CONTAINED
        assertThat(status("POST", "/api/incidents/" + id + "/transition", "analyst", Map.of("to", "CONTAINED"))).isEqualTo(409);
    }

    @Test
    void containedRequiresSystemMeasuredVerificationNotJustAttestation() throws Exception {
        long id = incidentFromCredentialAlert();
        ok("POST", "/api/incidents/" + id + "/transition", "analyst", Map.of("to", "INVESTIGATING"));
        long pid = ok("POST", "/api/response/incidents/" + id + "/proposals", "analyst", Map.of("actionType", "DISABLE_ACCOUNT", "target", "jdoe", "reason", "Reset")).get("id").asLong();
        ok("POST", "/api/response/proposals/" + pid + "/decision", "lead", Map.of("decision", "APPROVED", "comment", "ok"));
        assertThat(status("POST", "/api/response/proposals/" + pid + "/verify", "analyst", null)).isEqualTo(409);  // must attest first
        assertThat(status("POST", "/api/incidents/" + id + "/transition", "analyst", Map.of("to", "CONTAINED"))).isEqualTo(409);

        JsonNode att = ok("POST", "/api/response/proposals/" + pid + "/attest", "analyst", Map.of("detail", "Disabled in the identity provider manually"));
        assertThat(att.get("status").asText()).isEqualTo("ATTESTED");
        assertThat(att.at("/verifications/0/status").asText()).isEqualTo("USER_ATTESTED");
        assertThat(status("POST", "/api/incidents/" + id + "/transition", "analyst", Map.of("to", "CONTAINED"))).isEqualTo(409); // still not verified

        JsonNode ver = ok("POST", "/api/response/proposals/" + pid + "/verify", "analyst", null);
        assertThat(ver.get("status").asText()).isEqualTo("VERIFIED");
        assertThat(ver.get("banner").asText()).contains("does not prove");
        ok("POST", "/api/incidents/" + id + "/transition", "analyst", Map.of("to", "CONTAINED"));
        assertThat(ok("GET", "/api/incidents/" + id, "viewer", null).get("status").asText()).isEqualTo("CONTAINED");
    }

    @Test
    void liveExecutionCapabilitiesAreAllDisabled() throws Exception {
        JsonNode c = ok("GET", "/api/response/capabilities", "viewer", null);
        assertThat(c.get("mode").asText()).isEqualTo("SIMULATION_ONLY");
        assertThat(c.get("liveExecutionFlag").asBoolean()).isFalse();
        for (JsonNode k : c.get("connectors")) assertThat(k.get("status").asText()).isEqualTo("DISABLED");
    }
}
