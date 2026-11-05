package io.aegissoc.incidents;

import java.util.Map;
import java.util.Set;

/** Incident stages. CONTAINED additionally requires verified containment (checked in the service, not here). */
public final class IncidentWorkflow {
    private IncidentWorkflow() {}

    public static final Map<String, Set<String>> ALLOWED = Map.of(
            "NEW", Set.of("TRIAGE", "INVESTIGATING", "RESOLVED"),
            "TRIAGE", Set.of("INVESTIGATING", "RESOLVED"),
            "INVESTIGATING", Set.of("CONTAINMENT_PROPOSED", "RESOLVED"),
            "CONTAINMENT_PROPOSED", Set.of("CONTAINED", "INVESTIGATING"),
            "CONTAINED", Set.of("RECOVERY", "INVESTIGATING"),
            "RECOVERY", Set.of("RESOLVED", "INVESTIGATING"),
            "RESOLVED", Set.of("CLOSED", "INVESTIGATING"),
            "CLOSED", Set.of("INVESTIGATING"));

    public static final Set<String> RESOLUTIONS = Set.of("CONFIRMED_INCIDENT_REMEDIATED", "FALSE_POSITIVE", "BENIGN_ADMIN_ACTIVITY", "TEST_ACTIVITY", "INCONCLUSIVE", "DUPLICATE");
    public static final Set<String> SEVERITIES = Set.of("LOW", "MEDIUM", "HIGH", "CRITICAL");

    public static boolean canMove(String from, String to) { return ALLOWED.getOrDefault(from, Set.of()).contains(to); }

    public static String classificationFor(String resolution) {
        return switch (resolution) {
            case "CONFIRMED_INCIDENT_REMEDIATED" -> "CONFIRMED_INCIDENT";
            case "FALSE_POSITIVE", "BENIGN_ADMIN_ACTIVITY" -> "BENIGN";
            case "TEST_ACTIVITY" -> "EXPECTED_TEST_ACTIVITY";
            default -> "INCONCLUSIVE";
        };
    }
}
