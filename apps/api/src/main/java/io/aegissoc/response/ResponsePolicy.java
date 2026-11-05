package io.aegissoc.response;

import io.aegissoc.common.ApiException;
import io.aegissoc.config.AegisProperties;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

/**
 * Backend policy service. Authorization for response actions lives HERE (not in the UI, not in prompts).
 * Deny-by-default: this build has no connector that can change a real system, so every proposal is SIMULATION mode.
 */
@Component
public class ResponsePolicy {
    public static final List<String> ACTIONS = List.of("ISOLATE_HOST", "BLOCK_IP", "DISABLE_ACCOUNT", "RESET_CREDENTIALS", "COLLECT_EVIDENCE");

    private final AegisProperties props;

    public ResponsePolicy(AegisProperties props) { this.props = props; }

    /** Every creation/approval path calls this. Even if the flag is flipped, no execution connector exists. */
    public void assertSimulationOnly() {
        if (props.response().liveExecutionEnabled())
            throw ApiException.conflict("LIVE_EXECUTION_UNSUPPORTED",
                    "Live response execution is enabled by configuration but no execution connector is implemented. Refusing: only simulation is available.");
    }

    /** Which entity kind each action may target. The target must already appear in the incident's evidence (allowlist). */
    public String targetKind(String action) {
        return switch (action) {
            case "ISOLATE_HOST", "COLLECT_EVIDENCE" -> "host";
            case "BLOCK_IP" -> "ip";
            case "DISABLE_ACCOUNT", "RESET_CREDENTIALS" -> "user";
            default -> throw ApiException.bad("Unsupported action. Allowed: " + ACTIONS);
        };
    }

    public String expectedImpact(String action, String target) {
        return switch (action) {
            case "ISOLATE_HOST" -> "Host " + target + " would lose network connectivity except to a management path. Users and services on it would be interrupted until released.";
            case "BLOCK_IP" -> "Traffic to and from " + target + " would be dropped at the enforcement point. Any legitimate use of that address (including shared/NAT addresses) would also be blocked.";
            case "DISABLE_ACCOUNT" -> "Account " + target + " could no longer sign in and active sessions may end. Scheduled jobs or services using it would fail.";
            case "RESET_CREDENTIALS" -> "Credentials for " + target + " would be invalidated; the owner must re-enroll. Integrations using stored credentials would fail until updated.";
            default -> "Read-only evidence collection for " + target + ". No state change.";
        };
    }

    public String rollback(String action, String target) {
        return switch (action) {
            case "ISOLATE_HOST" -> "Manual: remove the isolation rule or quarantine tag for " + target + " in the tool that enforced it. AegisSOC cannot undo it for you.";
            case "BLOCK_IP" -> "Manual: delete the deny rule for " + target + " from the firewall/ACL. Rollback is not automated and not guaranteed by any webhook.";
            case "DISABLE_ACCOUNT" -> "Manual: re-enable " + target + " in the identity provider and confirm the owner's identity first.";
            case "RESET_CREDENTIALS" -> "Not reversible: the previous credential is gone. The owner sets a new one through your normal process.";
            default -> "Nothing to roll back (read-only).";
        };
    }

    public Map<String, Object> capabilities() {
        String why = "Disabled: no execution connector exists in this build. Enabling needs explicit authorization, a target allowlist, role approval, expiry, rate limits, dry-run preview, timeout, kill switch and a rollback plan (see docs/security/SAFETY_BOUNDARIES.md).";
        return Map.of(
                "mode", "SIMULATION_ONLY",
                "liveExecutionFlag", props.response().liveExecutionEnabled(),
                "connectors", List.of(
                        Map.of("id", "wazuh_active_response", "status", "DISABLED", "reason", why),
                        Map.of("id", "firewall", "status", "DISABLED", "reason", why),
                        Map.of("id", "identity_provider", "status", "DISABLED", "reason", why),
                        Map.of("id", "endpoint_containment", "status", "DISABLED", "reason", why)),
                "supportedActions", ACTIONS,
                "guarantees", List.of("Approval never executes anything.", "Manual actions are recorded as user-attested, not system-verified.", "Targets must already appear in the incident's evidence."));
    }
}
