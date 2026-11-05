package io.aegissoc.response;

import io.aegissoc.audit.AuditService;
import io.aegissoc.auth.Actor;
import io.aegissoc.common.ApiException;
import io.aegissoc.common.Json;
import io.aegissoc.config.AegisProperties;
import io.aegissoc.incidents.IncidentService;
import io.aegissoc.incidents.IncidentWorkflow;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;

@RestController
@RequestMapping("/api/response")
public class ResponseController {
    private final JdbcClient jdbc;
    private final ResponsePolicy policy;
    private final AuditService audit;
    private final IncidentService incidents;
    private final AegisProperties props;

    public ResponseController(JdbcClient jdbc, ResponsePolicy policy, AuditService audit, IncidentService incidents, AegisProperties props) {
        this.jdbc = jdbc; this.policy = policy; this.audit = audit; this.incidents = incidents; this.props = props;
    }

    @GetMapping("/capabilities")
    public Map<String, Object> capabilities() { return policy.capabilities(); }

    private static final String SELECT = """
            SELECT p.id, p.incident_id AS "incidentId", i.title AS "incidentTitle", p.action_type AS "actionType", p.target, p.reason,
                   p.expected_impact AS "expectedImpact", p.rollback, p.mode, p.requested_by AS "requestedBy", p.created_at AS "createdAt", p.expires_at AS "expiresAt",
                   CASE WHEN p.status = 'PENDING' AND p.expires_at < now() THEN 'EXPIRED' ELSE p.status END AS status, i.synthetic
            FROM response_proposals p JOIN incidents i ON i.id = p.incident_id""";

    @GetMapping("/proposals")
    public List<Map<String, Object>> list(@RequestParam(required = false) String status) {
        List<Map<String, Object>> all = jdbc.sql(SELECT + " ORDER BY p.id DESC LIMIT 100").query().listOfRows();
        if (status == null || status.isBlank()) return all;
        return all.stream().filter(m -> status.equals(m.get("status"))).toList();
    }

    @GetMapping("/proposals/{id}")
    public Map<String, Object> get(@PathVariable long id) {
        Map<String, Object> p = new LinkedHashMap<>(jdbc.sql(SELECT + " WHERE p.id = :id").param("id", id).query().listOfRows().stream().findFirst().orElseThrow(() -> ApiException.notFound("Proposal")));
        String sim = jdbc.sql("SELECT simulation::text FROM response_proposals WHERE id = :id").param("id", id).query(String.class).optional().orElse(null);
        p.put("simulation", sim == null ? null : Json.read(sim));
        p.put("approvals", jdbc.sql("SELECT approver, decision, comment, at FROM response_approvals WHERE proposal_id = :id ORDER BY id").param("id", id).query().listOfRows());
        p.put("verifications", jdbc.sql("SELECT check_name AS \"check\", status, detail, recorded_by AS \"recordedBy\", at FROM verification_results WHERE proposal_id = :id ORDER BY id").param("id", id).query().listOfRows());
        p.put("banner", banner((String) p.get("status")));
        return p;
    }

    private static String banner(String status) {
        return switch (status) {
            case "APPROVED" -> "Approved in SIMULATION. No real system was changed. Carrying out the action is a manual step outside AegisSOC.";
            case "ATTESTED" -> "A person reports having done this manually. That is user-attested, not verified by AegisSOC.";
            case "VERIFIED" -> "A check measured from ingested telemetry passed. This does not prove a real endpoint was contained.";
            case "REJECTED" -> "Rejected. Nothing was changed.";
            case "EXPIRED" -> "Expired without a decision. Nothing was changed.";
            default -> "Pending review. This is a simulated proposal: approving it does not execute anything.";
        };
    }

    public record Create(@NotBlank String actionType, @NotBlank @Size(max = 200) String target, @NotBlank @Size(max = 1000) String reason) {}

    @PostMapping("/incidents/{incidentId}/proposals")
    @PreAuthorize("hasRole('ANALYST')")
    @Transactional
    public Map<String, Object> create(@PathVariable long incidentId, @Valid @RequestBody Create c) {
        policy.assertSimulationOnly();
        incidents.ensure(incidentId);
        String kind = policy.targetKind(c.actionType());
        String status = jdbc.sql("SELECT status FROM incidents WHERE id = :i").param("i", incidentId).query(String.class).single();
        if (status.equals("CLOSED") || status.equals("RESOLVED")) throw ApiException.conflict("INCIDENT_FINISHED", "Reopen the incident before proposing response actions");
        List<String> allowed = switch (kind) {
            case "host" -> jdbc.sql("SELECT DISTINCT n.host FROM incident_evidence e JOIN normalized_events n ON n.id = e.event_id WHERE e.incident_id = :i AND n.host IS NOT NULL").param("i", incidentId).query(String.class).list();
            case "user" -> jdbc.sql("SELECT DISTINCT n.username FROM incident_evidence e JOIN normalized_events n ON n.id = e.event_id WHERE e.incident_id = :i AND n.username IS NOT NULL").param("i", incidentId).query(String.class).list();
            default -> jdbc.sql("SELECT DISTINCT ip FROM (SELECT n.src_ip AS ip FROM incident_evidence e JOIN normalized_events n ON n.id = e.event_id WHERE e.incident_id = :i UNION SELECT n.dst_ip FROM incident_evidence e JOIN normalized_events n ON n.id = e.event_id WHERE e.incident_id = :i) x WHERE ip IS NOT NULL").param("i", incidentId).query(String.class).list();
        };
        if (!allowed.contains(c.target())) throw ApiException.unprocessable("TARGET_NOT_IN_SCOPE", "Target '" + c.target() + "' is not a " + kind + " seen in this incident's evidence. Allowed: " + allowed);
        long pending = jdbc.sql("SELECT count(*) FROM response_proposals WHERE incident_id = :i AND status = 'PENDING' AND expires_at > now()").param("i", incidentId).query(Long.class).single();
        if (pending >= 10) throw ApiException.conflict("TOO_MANY_PENDING", "This incident already has 10 pending proposals");
        Map<String, Object> sim = simulate(c.actionType(), c.target());
        long id = jdbc.sql("""
                INSERT INTO response_proposals (incident_id, action_type, target, reason, expected_impact, rollback, requested_by, expires_at, simulation)
                VALUES (:i,:a,:t,:r,:ei,:rb,:by,:exp,CAST(:sim AS jsonb)) RETURNING id""")
                .param("i", incidentId).param("a", c.actionType()).param("t", c.target()).param("r", c.reason())
                .param("ei", policy.expectedImpact(c.actionType(), c.target())).param("rb", policy.rollback(c.actionType(), c.target()))
                .param("by", Actor.name()).param("exp", Timestamp.from(Instant.now().plusSeconds(3600L * props.response().proposalTtlHours()))).param("sim", Json.write(sim)).query(Long.class).single();
        incidents.activity(incidentId, Actor.name(), "PROPOSAL", "Drafted SIMULATED response proposal #" + id + ": " + c.actionType() + " " + c.target());
        if (!c.actionType().equals("COLLECT_EVIDENCE") && IncidentWorkflow.canMove(status, "CONTAINMENT_PROPOSED"))
            jdbc.sql("UPDATE incidents SET status = 'CONTAINMENT_PROPOSED', updated_at = now() WHERE id = :i").param("i", incidentId).update();
        audit.record(Actor.name(), "response.propose", "response_proposal", id, Map.of("action", c.actionType(), "target", c.target(), "mode", "SIMULATION"));
        return get(id);
    }

    /** What the action would have touched, measured from the stored telemetry. Purely read-only. */
    private Map<String, Object> simulate(String action, String target) {
        Map<String, Object> s = new LinkedHashMap<>();
        s.put("mode", "SIMULATION");
        s.put("note", "Computed from stored telemetry only. Nothing was executed and nothing outside AegisSOC was contacted.");
        switch (action) {
            case "BLOCK_IP" -> {
                s.put("eventsInvolvingAddress", count("SELECT count(*) FROM normalized_events WHERE src_ip = :t OR dst_ip = :t", target));
                s.put("distinctHostsAffected", count("SELECT count(DISTINCT host) FROM normalized_events WHERE (src_ip = :t OR dst_ip = :t) AND host IS NOT NULL", target));
                long successes = count("SELECT count(*) FROM normalized_events WHERE src_ip = :t AND event_class = 'authentication' AND outcome = 'success'", target);
                s.put("successfulSignInsFromAddress", successes);
                s.put("warnings", successes > 0 ? List.of("Successful sign-ins originate from this address: blocking could lock out a legitimate user, or the address may be shared (NAT/VPN).") : List.of());
            }
            case "DISABLE_ACCOUNT", "RESET_CREDENTIALS" -> {
                s.put("eventsByAccount", count("SELECT count(*) FROM normalized_events WHERE username = :t", target));
                s.put("hostsTouched", count("SELECT count(DISTINCT host) FROM normalized_events WHERE username = :t AND host IS NOT NULL", target));
                s.put("successfulSignIns", count("SELECT count(*) FROM normalized_events WHERE username = :t AND event_class = 'authentication' AND outcome = 'success'", target));
                s.put("warnings", target.startsWith("svc-") || target.startsWith("svc_") ? List.of("Looks like a service account: dependent automation would break.") : List.of());
            }
            case "ISOLATE_HOST" -> {
                s.put("eventsFromHost", count("SELECT count(*) FROM normalized_events WHERE host = :t", target));
                s.put("openAlertsOnHost", count("SELECT count(*) FROM alerts WHERE entity_host = :t AND status IN ('NEW','ACKNOWLEDGED','INVESTIGATING','ESCALATED')", target));
                String crit = jdbc.sql("SELECT criticality FROM assets WHERE hostname = :t").param("t", target).query(String.class).optional().orElse("UNKNOWN");
                s.put("assetCriticality", crit);
                s.put("warnings", crit.equals("HIGH") || crit.equals("CRITICAL") ? List.of("Asset is marked " + crit + ": isolation may interrupt important services.") : List.of());
            }
            default -> { s.put("collects", List.of("Recent events for the target (already in AegisSOC)", "Alert history for the target")); s.put("warnings", List.of()); }
        }
        return s;
    }

    private long count(String sql, String t) { return jdbc.sql(sql).param("t", t).query(Long.class).single(); }

    public record Decision(@NotBlank String decision, @Size(max = 600) String comment) {}

    @PostMapping("/proposals/{id}/decision")
    @PreAuthorize("hasRole('INCIDENT_LEAD')")
    @Transactional
    public Map<String, Object> decide(@PathVariable long id, @Valid @RequestBody Decision d) {
        policy.assertSimulationOnly();
        Map<String, Object> p = jdbc.sql("SELECT status, requested_by, expires_at, incident_id FROM response_proposals WHERE id = :id FOR UPDATE").param("id", id).query().listOfRows().stream().findFirst()
                .orElseThrow(() -> ApiException.notFound("Proposal"));
        if (!List.of("APPROVED", "REJECTED").contains(d.decision())) throw ApiException.bad("decision must be APPROVED or REJECTED");
        if (!"PENDING".equals(p.get("status"))) throw ApiException.conflict("NOT_PENDING", "Proposal is " + p.get("status"));
        if (((Timestamp) p.get("expires_at")).toInstant().isBefore(Instant.now())) {
            jdbc.sql("UPDATE response_proposals SET status = 'EXPIRED' WHERE id = :id").param("id", id).update();
            throw ApiException.conflict("EXPIRED", "Proposal expired before a decision was made");
        }
        if (Actor.name().equals(p.get("requested_by"))) throw ApiException.forbidden("Approver must be a different person than the requester");
        if (d.decision().equals("REJECTED") && (d.comment() == null || d.comment().isBlank())) throw ApiException.bad("A rejection needs a comment");
        jdbc.sql("UPDATE response_proposals SET status = :s WHERE id = :id").param("s", d.decision()).param("id", id).update();
        jdbc.sql("INSERT INTO response_approvals (proposal_id, approver, decision, comment) VALUES (:p,:a,:d,:c)").param("p", id).param("a", Actor.name()).param("d", d.decision()).param("c", d.comment()).update();
        long incidentId = ((Number) p.get("incident_id")).longValue();
        incidents.activity(incidentId, Actor.name(), "PROPOSAL", "Proposal #" + id + " " + d.decision() + " (SIMULATION: no real change made)");
        audit.record(Actor.name(), "response.decision", "response_proposal", id, Map.of("decision", d.decision(), "executed", false));
        return get(id);
    }

    public record Attest(@NotBlank @Size(max = 1000) String detail) {}

    @PostMapping("/proposals/{id}/attest")
    @PreAuthorize("hasRole('ANALYST')")
    @Transactional
    public Map<String, Object> attest(@PathVariable long id, @Valid @RequestBody Attest a) {
        Map<String, Object> p = lockApproved(id, "APPROVED");
        jdbc.sql("UPDATE response_proposals SET status = 'ATTESTED' WHERE id = :id").param("id", id).update();
        jdbc.sql("INSERT INTO verification_results (proposal_id, check_name, status, detail, recorded_by) VALUES (:p,'MANUAL_ACTION','USER_ATTESTED',:d,:by)")
                .param("p", id).param("d", a.detail()).param("by", Actor.name()).update();
        incidents.activity(((Number) p.get("incident_id")).longValue(), Actor.name(), "PROPOSAL", "Manual action for proposal #" + id + " recorded as USER-ATTESTED (not system-verified)");
        audit.record(Actor.name(), "response.attest", "response_proposal", id, Map.of());
        return get(id);
    }

    /** The only system-measured check: no new events involving the target after the attestation. */
    @PostMapping("/proposals/{id}/verify")
    @PreAuthorize("hasRole('ANALYST')")
    @Transactional
    public Map<String, Object> verify(@PathVariable long id) {
        Map<String, Object> p = lockApproved(id, "ATTESTED");
        String target = (String) p.get("target");
        String action = (String) p.get("action_type");
        Timestamp since = jdbc.sql("SELECT max(at) FROM verification_results WHERE proposal_id = :id AND status = 'USER_ATTESTED'").param("id", id).query(Timestamp.class).single();
        String col = switch (action) { case "ISOLATE_HOST", "COLLECT_EVIDENCE" -> "host = :t"; case "BLOCK_IP" -> "(src_ip = :t OR dst_ip = :t)"; default -> "username = :t"; };
        long newer = jdbc.sql("SELECT count(*) FROM normalized_events WHERE " + col + " AND ingested_at > :since").param("t", target).param("since", since).query(Long.class).single();
        boolean passed = newer == 0;
        String detail = passed
                ? "No events involving " + target + " were ingested after the attestation. This is measured from AegisSOC's own data only; it does not prove containment of a real system, and silence can also mean a telemetry gap."
                : newer + " event(s) involving " + target + " were ingested after the attestation. Containment is NOT demonstrated.";
        jdbc.sql("INSERT INTO verification_results (proposal_id, check_name, status, detail, recorded_by) VALUES (:p,'NO_NEW_ACTIVITY',:s,:d,'system')")
                .param("p", id).param("s", passed ? "PASSED" : "FAILED").param("d", detail).update();
        if (passed) {
            jdbc.sql("UPDATE response_proposals SET status = 'VERIFIED' WHERE id = :id").param("id", id).update();
            jdbc.sql("UPDATE incidents SET containment_verified = TRUE WHERE id = :i").param("i", p.get("incident_id")).update();
        }
        incidents.activity(((Number) p.get("incident_id")).longValue(), "system", "PROPOSAL", "Verification for proposal #" + id + ": " + (passed ? "PASSED" : "FAILED"));
        audit.record(Actor.name(), "response.verify", "response_proposal", id, Map.of("passed", passed));
        return get(id);
    }

    private Map<String, Object> lockApproved(long id, String expected) {
        Map<String, Object> p = jdbc.sql("SELECT status, incident_id, target, action_type FROM response_proposals WHERE id = :id FOR UPDATE").param("id", id).query().listOfRows().stream().findFirst()
                .orElseThrow(() -> ApiException.notFound("Proposal"));
        if (!expected.equals(p.get("status"))) throw ApiException.conflict("WRONG_STATE", "Proposal is " + p.get("status") + "; expected " + expected);
        return p;
    }
}
