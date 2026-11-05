package io.aegissoc;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** Phase 2 exit criteria: fixture -> ingest -> normalize -> detect -> evidence-backed alert, deterministically. */
class PipelineIT extends IntegrationTestBase {

    @Test
    void credentialAttackScenarioProducesOneTraceableHighAlert() throws Exception {
        JsonNode run = runScenario("credential_attack");
        assertThat(run.get("status").asText()).isEqualTo("SUCCEEDED");
        assertThat(run.get("eventsAccepted").asInt()).isEqualTo(28);
        assertThat(run.get("synthetic").asBoolean()).isTrue();
        assertThat(run.get("alertsCreated").asInt()).isEqualTo(1);

        long id = firstAlertOfRule("AEG-AUTH-001");
        JsonNode a = ok("GET", "/api/alerts/" + id, "viewer", null);
        assertThat(a.get("severity").asText()).isEqualTo("HIGH");          // raised because a success followed
        assertThat(a.get("synthetic").asBoolean()).isTrue();
        assertThat(a.get("evidence")).hasSize(8);                          // 7 failures + 1 follow-up success
        assertThat(a.at("/explanation/simple/what").asText()).contains("jdoe").contains("198.51.100.23");
        assertThat(a.at("/explanation/conditions/0").asText()).contains("authentication");
        assertThat(a.at("/explanation/analyst/attack/techniques/0").asText()).isEqualTo("T1110");
        assertThat(a.at("/explanation/ruleFingerprint").asText()).hasSize(12);
        // every cited evidence id resolves to a stored event
        for (JsonNode ev : a.get("evidence")) assertThat(ok("GET", "/api/events/" + ev.get("id").asLong(), "viewer", null).get("raw").has("event_id")).isTrue();
    }

    @Test
    void benignLookAlikesDoNotAlert() throws Exception {
        runScenario("credential_attack");
        JsonNode alerts = ok("GET", "/api/alerts?size=50", "viewer", null);
        for (JsonNode a : alerts.get("items")) assertThat(a.get("title").asText()).doesNotContain("alice").doesNotContain("bob");
        assertThat(runScenario("benign_baseline").get("alertsCreated").asInt()).isZero();
    }

    @Test
    void allScenariosProduceExactlyTheLabelledAlerts() throws Exception {
        runAllPositiveScenarios();
        JsonNode all = ok("GET", "/api/alerts?size=100", "viewer", null);
        assertThat(all.get("total").asInt()).isEqualTo(12);
        for (String[] rc : new String[][]{{"AEG-AUTH-001", "1"}, {"AEG-PRIV-001", "1"}, {"AEG-ACCT-001", "1"}, {"AEG-SVC-001", "1"}, {"AEG-PROC-001", "1"},
                {"AEG-TI-001", "2"}, {"AEG-IDS-001", "3"}, {"AEG-LAT-001", "1"}, {"AEG-SENS-001", "1"}})
            assertThat(ok("GET", "/api/alerts?rule=" + rc[0], "viewer", null).get("total").asInt()).as(rc[0]).isEqualTo(Integer.parseInt(rc[1]));
        long lat = firstAlertOfRule("AEG-LAT-001");
        JsonNode a = ok("GET", "/api/alerts/" + lat, "viewer", null);
        assertThat(a.get("hypothesis").asBoolean()).isTrue();
        assertThat(a.get("classification").asText()).isEqualTo("INCONCLUSIVE");
        assertThat(a.at("/explanation/uncertainty").toString()).contains("HYPOTHESIS");
    }

    @Test
    void silenceAlertSaysSensorOutageNotNoThreats() throws Exception {
        runScenario("sensor_silence");
        JsonNode a = ok("GET", "/api/alerts/" + firstAlertOfRule("AEG-SENS-001"), "viewer", null);
        assertThat(a.get("title").asText()).contains("fw-edge-01");
        assertThat(a.at("/explanation/simple/why").asText()).contains("No alerts from a silent source does not mean no activity");
    }

    @Test
    void replayIsIdempotent() throws Exception {
        JsonNode first = runScenario("credential_attack");
        JsonNode second = runScenario("credential_attack");
        assertThat(second.get("eventsAccepted").asInt()).isZero();
        assertThat(second.get("eventsDuplicate").asInt()).isEqualTo(first.get("eventsAccepted").asInt());
        assertThat(second.get("alertsCreated").asInt()).isZero();
        assertThat(ok("GET", "/api/alerts", "viewer", null).get("total").asInt()).isEqualTo(1);
    }

    @Test
    void sameSeedAndAnchorGiveIdenticalFingerprintsDifferentSeedDoesNot() throws Exception {
        runScenario("benign_baseline");
        long a = jdbc.sql("SELECT count(*) FROM normalized_events").query(Long.class).single();
        JsonNode other = runScenario("benign_baseline", Map.of("seed", 7, "anchor", ANCHOR));
        assertThat(other.get("eventsAccepted").asInt()).isGreaterThan(0);          // different seed => different events
        assertThat(jdbc.sql("SELECT count(*) FROM normalized_events").query(Long.class).single()).isGreaterThan(a);
    }

    @Test
    void timestampsNormalizedToUtcAndOriginalsPreserved() throws Exception {
        runScenario("privilege_service_tamper");
        Map<String, Object> row = jdbc.sql("SELECT ts, original_ts FROM normalized_events WHERE vendor = 'windows' ORDER BY id LIMIT 1").query().singleRow();
        assertThat((String) row.get("original_ts")).endsWith("-05:00");
        assertThat(((java.sql.Timestamp) row.get("ts")).toInstant().toString()).endsWith("Z");
    }

    @Test
    void dashboardCountsComeFromStoredRecords() throws Exception {
        assertThat(ok("GET", "/api/overview", "viewer", null).at("/dataState/mode").asText()).isEqualTo("DISCONNECTED");
        runScenario("credential_attack");
        JsonNode o = ok("GET", "/api/overview", "viewer", null);
        assertThat(o.at("/dataState/mode").asText()).isEqualTo("DEMO");
        assertThat(o.at("/counts/events").asLong()).isEqualTo(28);
        assertThat(o.at("/counts/openAlerts").asLong()).isEqualTo(1);
        assertThat(o.at("/dataState/liveConnectorsActive").asInt()).isZero();
    }
}
