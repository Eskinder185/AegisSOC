package io.aegissoc;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class ReportsIT extends IntegrationTestBase {

    @Test
    void emptyDatabaseReportsNoDataNotZeroRisk() throws Exception {
        JsonNode m = ok("GET", "/api/reports/metrics", "viewer", null);
        assertThat(m.get("caveats").toString()).contains("empty, not zero risk");
        assertThat(m.at("/incidents/timeToClose/average").asText()).isEqualTo("no data");
        assertThat(m.get("executiveSummary").get(0).asText()).contains("nothing can be said about risk");
    }

    @Test
    void metricsAreDerivedFromStoredRecordsWithDefinitionsAndCaveats() throws Exception {
        runAllPositiveScenarios();
        long alertId = firstAlertOfRule("AEG-AUTH-001");
        long inc = ok("POST", "/api/incidents", "analyst", Map.of("title", "t", "alertIds", List.of(alertId))).get("id").asLong();
        ok("POST", "/api/incidents/" + inc + "/transition", "analyst", Map.of("to", "TRIAGE"));
        ok("POST", "/api/incidents/" + inc + "/transition", "analyst", Map.of("to", "INVESTIGATING"));
        ok("POST", "/api/incidents/" + inc + "/transition", "analyst", Map.of("to", "RESOLVED", "resolution", "TEST_ACTIVITY", "note", "fixture"));
        ok("POST", "/api/rules/AEG-AUTH-001/versions/1/test", "engineer", null);

        JsonNode m = ok("GET", "/api/reports/metrics?days=30", "viewer", null);
        assertThat(m.at("/incidents/created").asInt()).isEqualTo(1);
        assertThat(m.at("/alerts/created").asInt()).isEqualTo(12);
        assertThat(m.at("/incidents/timeToTriage/sampleSize").asInt()).isEqualTo(1);
        assertThat(m.at("/incidents/timeToTriage/definition").asText()).contains("first left status NEW");
        assertThat(m.at("/detectionQuality/rulesTested").asInt()).isEqualTo(1);
        assertThat(m.at("/detectionQuality/caveat").asText()).contains("SYNTHETIC");
        assertThat(m.get("caveats").toString()).contains("SYNTHETIC").contains("No live connector");
        assertThat(m.at("/incidents/drilldown").asText()).isEqualTo("/app/incidents");

        String md = call("GET", "/api/reports/export?format=md&audience=executive", "analyst", null).getResponse().getContentAsString();
        assertThat(md).contains("executive summary").contains("Caveats").doesNotContain("Weekly review checklist");
        String full = call("GET", "/api/reports/export?format=md", "analyst", null).getResponse().getContentAsString();
        assertThat(full).contains("Weekly review checklist").contains("Rule noise");
        assertThat(call("GET", "/api/reports/export?format=csv", "analyst", null).getResponse().getContentAsString()).startsWith("metric,value");
        assertThat(status("GET", "/api/reports/export?format=pdf", "analyst", null)).isEqualTo(400);
    }
}
