package io.aegissoc;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** Journey 3 (detection improvement), Journey 4 (source failure and recovery), Journey 7 (hunt) and suppression safety. */
class DetectionEngineeringIT extends IntegrationTestBase {
    static final String R = "from=2026-01-14T00:00:00Z&to=2026-01-17T00:00:00Z";

    @Test
    void builtInRulesScorePerfectlyOnTheirLabelledSuite() throws Exception {
        for (JsonNode r : ok("GET", "/api/rules", "viewer", null)) {
            JsonNode t = ok("POST", "/api/rules/" + r.get("id").asText() + "/versions/1/test", "engineer", null);
            assertThat(t.get("falsePositives").asInt()).as(r.get("id").asText() + " false positives").isZero();
            assertThat(t.get("missed").asInt()).as(r.get("id").asText() + " missed").isZero();
            assertThat(t.get("truePositives").asInt()).as(r.get("id").asText() + " tp").isGreaterThan(0);
            assertThat(t.get("caveat").asText()).contains("SYNTHETIC").contains("not validated real-world");
        }
    }

    @Test
    void tuneRuleDraftTestCompareApproveWithSeparationOfDuties() throws Exception {
        JsonNode rule = ok("GET", "/api/rules/AEG-AUTH-001", "engineer", null);
        ObjectNode def = rule.get("definition").deepCopy();
        def.put("threshold", 3);                                                      // too sensitive
        JsonNode draft = ok("POST", "/api/rules/AEG-AUTH-001/versions", "engineer", Map.of("definition", def, "changeNote", "Try threshold 3"));
        int v = draft.get("version").asInt();
        assertThat(v).isEqualTo(2);

        // cannot approve without testing, nor by the author
        assertThat(status("POST", "/api/rules/AEG-AUTH-001/versions/" + v + "/approve", "admin", null)).isEqualTo(409);
        JsonNode test = ok("POST", "/api/rules/AEG-AUTH-001/versions/" + v + "/test", "engineer", null);
        assertThat(test.get("falsePositives").asInt()).isGreaterThanOrEqualTo(1);     // alice's typo is now flagged
        assertThat(test.at("/details/scenarios").toString()).contains("alice|10.20.0.31");
        assertThat(status("POST", "/api/rules/AEG-AUTH-001/versions/" + v + "/approve", "engineer", null)).isEqualTo(403);

        // the comparison shows the regression honestly
        JsonNode cmp = ok("GET", "/api/rules/AEG-AUTH-001/compare?a=1&b=" + v, "viewer", null);
        assertThat(cmp.at("/a/falsePositives").asInt()).isZero();
        assertThat(cmp.at("/b/falsePositives").asInt()).isGreaterThan(0);

        // reject it, and draft a better one (threshold 6 still catches the 7 attempts)
        ok("POST", "/api/rules/AEG-AUTH-001/versions/" + v + "/reject", "admin", Map.of("comment", "Too noisy"));
        def.put("threshold", 6);
        int v3 = ok("POST", "/api/rules/AEG-AUTH-001/versions", "engineer", Map.of("definition", def, "changeNote", "Threshold 6")).get("version").asInt();
        JsonNode t3 = ok("POST", "/api/rules/AEG-AUTH-001/versions/" + v3 + "/test", "engineer", null);
        assertThat(t3.get("falsePositives").asInt()).isZero();
        assertThat(t3.get("missed").asInt()).isZero();
        JsonNode approved = ok("POST", "/api/rules/AEG-AUTH-001/versions/" + v3 + "/approve", "admin", Map.of("comment", "Measured: no FP, no misses on suite"));
        assertThat(approved.get("deployedToExternalSystems").asBoolean()).isFalse();
        assertThat(ok("GET", "/api/rules/AEG-AUTH-001", "viewer", null).get("currentVersion").asInt()).isEqualTo(v3);

        // an over-high threshold misses the attack and the suite says so
        def.put("threshold", 8);
        int v4 = ok("POST", "/api/rules/AEG-AUTH-001/versions", "engineer", Map.of("definition", def)).get("version").asInt();
        assertThat(ok("POST", "/api/rules/AEG-AUTH-001/versions/" + v4 + "/test", "engineer", null).get("missed").asInt()).isEqualTo(1);

        // new alerts are produced with the approved version and its fingerprint
        runScenario("credential_attack");
        JsonNode a = ok("GET", "/api/alerts/" + firstAlertOfRule("AEG-AUTH-001"), "viewer", null);
        assertThat(a.get("ruleVersion").asInt()).isEqualTo(v3);
        assertThat(a.at("/explanation/conditions").toString()).contains("At least 6");
    }

    @Test
    void invalidRuleDefinitionsAreRejectedWithoutBeingStored() throws Exception {
        for (Map<String, Object> bad : List.<Map<String, Object>>of(
                Map.of("type", "match", "filter", Map.of("message", Map.of("regex", "(a+)+$"))),
                Map.of("type", "match", "filter", Map.of("event_class", "x"), "shell", "rm -rf /"),
                Map.of("type", "threshold", "filter", Map.of("event_class", "x"), "group_by", List.of("password"), "threshold", 3)))
            assertThat(status("POST", "/api/rules/AEG-AUTH-001/versions", "engineer", Map.of("definition", bad))).isEqualTo(422);
        assertThat(jdbc.sql("SELECT count(*) FROM rule_versions WHERE rule_id = 'AEG-AUTH-001'").query(Long.class).single()).isEqualTo(1);
    }

    @Test
    void disablingADetectionNeedsAReasonAndIsAudited() throws Exception {
        assertThat(status("PATCH", "/api/rules/AEG-AUTH-001", "engineer", Map.of("enabled", false))).isEqualTo(400);
        ok("PATCH", "/api/rules/AEG-AUTH-001", "engineer", Map.of("enabled", false, "reason", "Maintenance window"));
        assertThat(runScenario("credential_attack").get("alertsCreated").asInt()).isZero();       // really disabled
        assertThat(jdbc.sql("SELECT count(*) FROM audit_events WHERE action = 'rule.disable'").query(Long.class).single()).isEqualTo(1);
    }

    @Test
    void suppressionsAreScopedExpiringAndNeverHideCriticalEvents() throws Exception {
        assertThat(status("POST", "/api/suppressions", "engineer", Map.of("ruleId", "AEG-AUTH-001", "reason", "x"))).isEqualTo(400);     // no rule-wide suppression
        assertThat(status("POST", "/api/suppressions", "engineer", Map.of("ruleId", "AEG-AUTH-001", "username", "jdoe", "reason", "x", "hours", 9999))).isEqualTo(400);
        ok("POST", "/api/suppressions", "engineer", Map.of("ruleId", "AEG-AUTH-001", "username", "jdoe", "reason", "Pen-test of jdoe", "hours", 4));
        runScenario("credential_attack");
        JsonNode a = ok("GET", "/api/alerts/" + firstAlertOfRule("AEG-AUTH-001"), "viewer", null);
        assertThat(a.get("status").asText()).isEqualTo("SUPPRESSED");                // still visible, labelled, with reason + expiry
        assertThat(a.get("suppressionReason").asText()).contains("Pen-test");
        assertThat(a.get("suppressedUntil").asText()).isNotBlank();
        // a CRITICAL alert can't be manually suppressed
        jdbc.sql("UPDATE alerts SET severity = 'CRITICAL', status = 'NEW' WHERE id = :i").param("i", a.get("id").asLong()).update();
        assertThat(status("POST", "/api/alerts/" + a.get("id").asLong() + "/transition", "analyst", Map.of("to", "SUPPRESSED", "note", "noisy", "suppressHours", 2))).isEqualTo(403);
    }

    // ------------------------------------------------------------------ Journey 4
    @Test
    void sourceFailureShowsRowLevelErrorsAndRecoversOnlyAfterASuccessfulRun() throws Exception {
        runScenario("benign_baseline");
        assertThat(sourceHealth("fixture")).isEqualTo("HEALTHY");
        JsonNode failed = runScenario("corrupted_feed");
        assertThat(failed.get("status").asText()).isEqualTo("FAILED");
        assertThat(failed.get("eventsAccepted").asInt()).isEqualTo(3);
        assertThat(failed.get("eventsRejected").asInt()).isEqualTo(3);
        assertThat(sourceHealth("fixture")).isEqualTo("FAILED");
        JsonNode detail = ok("GET", "/api/ingestion/runs/" + failed.get("id").asLong(), "viewer", null);
        assertThat(detail.get("errors").toString()).contains("missing required field 'timestamp'").contains("unsupported format").contains("unparseable timestamp");
        assertThat(ok("GET", "/api/overview", "viewer", null).at("/dataState/mode").asText()).isEqualTo("FAILED");
        // testing the config does not heal it
        ok("POST", "/api/sources/" + sourceId("fixture") + "/test", "analyst", null);
        assertThat(sourceHealth("fixture")).isEqualTo("FAILED");
        // a repaired replay succeeds and only then is the source healthy
        JsonNode fixed = runScenario("corrupted_feed", Map.of("seed", 42, "anchor", ANCHOR, "repair", true));
        assertThat(fixed.get("status").asText()).isEqualTo("SUCCEEDED");
        assertThat(sourceHealth("fixture")).isEqualTo("HEALTHY");
    }

    @Test
    void staleSourcesAreDetectedFromWallClock() throws Exception {
        runScenario("benign_baseline");
        jdbc.sql("UPDATE data_sources SET last_success_at = now() - interval '3 days' WHERE source_type = 'fixture'").update();
        assertThat(sourceHealth("fixture")).isEqualTo("STALE");
    }

    // ------------------------------------------------------------------ Journey 7
    @Test
    void huntPivotSaveSearchNotebookAndLinkEvidenceToCase() throws Exception {
        runAllPositiveScenarios();
        JsonNode byUser = ok("GET", "/api/events?user=jdoe&" + R, "viewer", null);
        assertThat(byUser.get("total").asInt()).isGreaterThan(8);
        assertThat(byUser.get("histogram")).isNotEmpty();
        assertThat(ok("GET", "/api/events?eventClass=ids&severityMin=7&" + R, "viewer", null).get("total").asInt()).isEqualTo(3);
        assertThat(ok("GET", "/api/events/facets?user=jdoe&" + R, "viewer", null).get("eventClass").size()).isGreaterThan(0);

        JsonNode pivot = ok("GET", "/api/pivot?type=ip&value=10.20.0.15&minutes=30", "viewer", null);
        assertThat(pivot.get("events").size()).isGreaterThanOrEqualTo(2);
        assertThat(pivot.get("alerts")).isNotEmpty();

        long sid = ok("POST", "/api/hunt/searches", "analyst", Map.of("name", "jdoe activity", "filter", Map.of("user", "jdoe"))).get("id").asLong();
        assertThat(status("POST", "/api/hunt/searches", "analyst", Map.of("name", "bad", "filter", Map.of("drop", "x")))).isEqualTo(400);
        assertThat(ok("GET", "/api/hunt/searches", "viewer", null).toString()).contains("jdoe activity");
        assertThat(status("DELETE", "/api/hunt/searches/" + sid, "lead", null)).isEqualTo(404);       // not the owner

        JsonNode nb = ok("POST", "/api/hunt/notebooks", "analyst", Map.of("title", "Hunt for jdoe pivots", "hypothesis", "jdoe's account was used from one address only",
                "steps", List.of(Map.of("query", Map.of("user", "jdoe"), "finding", "Two sources"), Map.of("query", Map.of("ip", "198.51.100.23"), "finding", "Only VPN"))));
        assertThat(nb.get("steps")).hasSize(2);

        long eventId = byUser.get("items").get(0).get("id").asLong();
        long incident = ok("POST", "/api/incidents", "analyst", Map.of("title", "Manual hunt case", "summary", "From hunt", "eventIds", List.of(eventId))).get("id").asLong();
        JsonNode linked = ok("POST", "/api/incidents/" + incident + "/evidence", "analyst", Map.of("eventId", byUser.get("items").get(1).get("id").asLong(), "note", "pivot result"));
        assertThat(linked.get("evidence")).hasSize(2);
        assertThat(ok("GET", "/api/events?incident=" + incident + "&" + R, "viewer", null).get("total").asInt()).isEqualTo(2);
        assertThat(status("POST", "/api/incidents", "analyst", Map.of("title", "no evidence"))).isEqualTo(400);
    }

    @Test
    void coverageDistinguishesObservedUnavailableAndNotObserved() throws Exception {
        runScenario("sensor_silence");
        JsonNode cov = ok("GET", "/api/coverage", "viewer", null);
        assertThat(cov.at("/summary/assetCount").asInt()).isEqualTo(5);
        assertThat(cov.get("caveats").toString()).contains("NOT a security score");
        JsonNode cells = cov.get("matrix").get(0).get("cells");
        // fixture timestamps are ~hours old: the 30-minute 'system' expectation is stale => TEMPORARILY_UNAVAILABLE; auth never seen => NOT_OBSERVED
        assertThat(cells.at("/system/state").asText()).isEqualTo("TEMPORARILY_UNAVAILABLE");
        assertThat(cells.at("/authentication/state").asText()).isEqualTo("NOT_OBSERVED");
        assertThat(cov.get("sources").toString()).contains("NEVER_CONFIGURED");
    }

    private String sourceHealth(String type) throws Exception {
        for (JsonNode s : ok("GET", "/api/sources", "viewer", null)) if (s.get("sourceType").asText().equals(type)) return s.get("health").asText();
        throw new AssertionError("no source " + type);
    }

    private long sourceId(String type) throws Exception {
        for (JsonNode s : ok("GET", "/api/sources", "viewer", null)) if (s.get("sourceType").asText().equals(type)) return s.get("id").asLong();
        throw new AssertionError("no source " + type);
    }
}
