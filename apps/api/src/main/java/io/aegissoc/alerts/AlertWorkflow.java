package io.aegissoc.alerts;

import java.util.Map;
import java.util.Set;

/** Alert lifecycle rules. Kept as pure data so illegal transitions are unit-testable. */
public final class AlertWorkflow {
    private AlertWorkflow() {}

    public static final Map<String, Set<String>> ALLOWED = Map.of(
            "NEW", Set.of("ACKNOWLEDGED", "INVESTIGATING", "ESCALATED", "SUPPRESSED", "CLOSED"),
            "ACKNOWLEDGED", Set.of("INVESTIGATING", "ESCALATED", "SUPPRESSED", "CLOSED"),
            "INVESTIGATING", Set.of("ESCALATED", "SUPPRESSED", "CLOSED"),
            "ESCALATED", Set.of("INVESTIGATING", "CLOSED"),
            "SUPPRESSED", Set.of("NEW", "CLOSED"),
            "CLOSED", Set.of("INVESTIGATING"));

    public static final Set<String> RESOLUTIONS = Set.of("TRUE_POSITIVE", "FALSE_POSITIVE", "BENIGN_ADMIN_ACTIVITY", "TEST_ACTIVITY", "INCONCLUSIVE");

    public static boolean canMove(String from, String to) { return ALLOWED.getOrDefault(from, Set.of()).contains(to); }

    /** Resolution is an analyst judgement; this maps it onto the classification vocabulary. */
    public static String classificationFor(String resolution) {
        return switch (resolution) {
            case "TRUE_POSITIVE" -> "CONFIRMED_INCIDENT";
            case "FALSE_POSITIVE", "BENIGN_ADMIN_ACTIVITY" -> "BENIGN";
            case "TEST_ACTIVITY" -> "EXPECTED_TEST_ACTIVITY";
            default -> "INCONCLUSIVE";
        };
    }

    public static int severityRank(String s) {
        return switch (s) { case "CRITICAL" -> 4; case "HIGH" -> 3; case "MEDIUM" -> 2; default -> 1; };
    }
}
