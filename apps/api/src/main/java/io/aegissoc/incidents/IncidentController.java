package io.aegissoc.incidents;

import com.fasterxml.jackson.databind.JsonNode;
import io.aegissoc.audit.AuditService;
import io.aegissoc.auth.Actor;
import io.aegissoc.common.ApiException;
import io.aegissoc.common.Json;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.nio.charset.StandardCharsets;
import java.util.*;

@RestController
@RequestMapping("/api/incidents")
public class IncidentController {
    private final IncidentService svc;
    private final IncidentReportService reports;
    private final JdbcClient jdbc;
    private final AuditService audit;

    public IncidentController(IncidentService svc, IncidentReportService reports, JdbcClient jdbc, AuditService audit) {
        this.svc = svc; this.reports = reports; this.jdbc = jdbc; this.audit = audit;
    }

    @GetMapping
    public Map<String, Object> list(@RequestParam(required = false) String status, @RequestParam(required = false) String assignee, @RequestParam(required = false) String q,
                                    @RequestParam(defaultValue = "false") boolean openOnly, @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "25") int size) {
        return svc.list(status, assignee, q, openOnly, page, size);
    }

    @GetMapping("/{id}")
    public Map<String, Object> get(@PathVariable long id) { return svc.detail(id); }

    public record Create(@NotBlank @Size(max = 200) String title, @Size(max = 4000) String summary, String severity,
                         @Size(max = 50) List<Long> alertIds, @Size(max = 200) List<Long> eventIds, Integer priority) {}

    @PostMapping
    @PreAuthorize("hasRole('ANALYST')")
    public Map<String, Object> create(@Valid @RequestBody Create c) {
        long id = svc.create(Actor.name(), c.title(), c.summary(), c.severity(), c.alertIds() == null ? List.of() : c.alertIds(), c.eventIds() == null ? List.of() : c.eventIds(), c.priority());
        return svc.detail(id);
    }

    public record Patch(@Size(max = 200) String title, @Size(max = 4000) String summary, String severity, Integer priority, String assignee) {}

    @PatchMapping("/{id}")
    @PreAuthorize("hasRole('ANALYST')")
    public Map<String, Object> patch(@PathVariable long id, @Valid @RequestBody Patch p) {
        svc.ensure(id);
        if (p.severity() != null && !IncidentWorkflow.SEVERITIES.contains(p.severity())) throw ApiException.bad("Invalid severity");
        if (p.priority() != null && (p.priority() < 1 || p.priority() > 4)) throw ApiException.bad("priority must be 1-4");
        if (p.assignee() != null && !p.assignee().isBlank() && jdbc.sql("SELECT 1 FROM users WHERE username = :u AND enabled").param("u", p.assignee()).query().listOfRows().isEmpty())
            throw ApiException.bad("Unknown or disabled user");
        jdbc.sql("UPDATE incidents SET title = COALESCE(:t,title), summary = COALESCE(:s,summary), severity = COALESCE(:sev,severity), priority = COALESCE(:p,priority), " +
                        "assignee = CASE WHEN :a IS NULL THEN assignee WHEN :a = '' THEN NULL ELSE :a END, updated_at = now() WHERE id = :id")
                .param("t", p.title()).param("s", p.summary()).param("sev", p.severity()).param("p", p.priority()).param("a", p.assignee()).param("id", id).update();
        svc.activity(id, Actor.name(), "UPDATE", "Updated" + (p.assignee() != null ? " assignee → " + (p.assignee().isBlank() ? "unassigned" : p.assignee()) : "")
                + (p.severity() != null ? " severity → " + p.severity() : "") + (p.priority() != null ? " priority → P" + p.priority() : ""));
        audit.record(Actor.name(), "incident.update", "incident", id, Map.of());
        return svc.detail(id);
    }

    public record Transition(@NotBlank String to, @Size(max = 1000) String note, String resolution, Boolean force) {}

    @PostMapping("/{id}/transition")
    @PreAuthorize("hasRole('ANALYST')")
    public Map<String, Object> transition(@PathVariable long id, @Valid @RequestBody Transition t, Authentication auth) {
        boolean lead = auth.getAuthorities().stream().anyMatch(g -> g.getAuthority().equals("ROLE_INCIDENT_LEAD") || g.getAuthority().equals("ROLE_ADMIN"));
        svc.transition(id, t.to(), t.note(), t.resolution(), Actor.name(), lead, Boolean.TRUE.equals(t.force()));
        return svc.detail(id);
    }

    public record NoteBody(@NotBlank String kind, @NotBlank @Size(max = 4000) String body) {}

    @PostMapping("/{id}/notes")
    @PreAuthorize("hasRole('ANALYST')")
    public Map<String, Object> note(@PathVariable long id, @Valid @RequestBody NoteBody n) { svc.addNote(id, Actor.name(), n.kind(), n.body()); return svc.detail(id); }

    public record TaskBody(@NotBlank @Size(max = 300) String title, String assignee) {}

    @PostMapping("/{id}/tasks")
    @PreAuthorize("hasRole('ANALYST')")
    public Map<String, Object> task(@PathVariable long id, @Valid @RequestBody TaskBody t) { svc.addTask(id, Actor.name(), t.title(), t.assignee()); return svc.detail(id); }

    public record TaskDone(boolean done) {}

    @PatchMapping("/{id}/tasks/{taskId}")
    @PreAuthorize("hasRole('ANALYST')")
    public Map<String, Object> taskDone(@PathVariable long id, @PathVariable long taskId, @RequestBody TaskDone d) { svc.setTask(id, taskId, d.done(), Actor.name()); return svc.detail(id); }

    public record EvidenceBody(long eventId, @Size(max = 500) String note) {}

    @PostMapping("/{id}/evidence")
    @PreAuthorize("hasRole('ANALYST')")
    public Map<String, Object> evidence(@PathVariable long id, @RequestBody EvidenceBody b) { svc.addEvidence(id, b.eventId(), b.note(), Actor.name()); return svc.detail(id); }

    public record AlertLink(long alertId) {}

    @PostMapping("/{id}/alerts")
    @PreAuthorize("hasRole('ANALYST')")
    public Map<String, Object> link(@PathVariable long id, @RequestBody AlertLink b) { svc.linkAlert(id, b.alertId(), Actor.name()); return svc.detail(id); }

    public record MergeBody(long intoId) {}

    @PostMapping("/{id}/merge")
    @PreAuthorize("hasRole('INCIDENT_LEAD')")
    public Map<String, Object> merge(@PathVariable long id, @RequestBody MergeBody b) { svc.merge(id, b.intoId(), Actor.name()); return svc.detail(id); }

    private static final Set<String> PI_KEYS = Set.of("rootCauseHypothesis", "verifiedCause", "responseSteps", "lessonsLearned", "ruleImprovements", "unresolvedQuestions");

    @PutMapping("/{id}/post-incident")
    @PreAuthorize("hasRole('ANALYST')")
    public Map<String, Object> postIncident(@PathVariable long id, @RequestBody Map<String, String> review) {
        svc.ensure(id);
        Map<String, String> clean = new LinkedHashMap<>();
        for (var e : review.entrySet()) {
            if (!PI_KEYS.contains(e.getKey())) throw ApiException.bad("Unknown review field '" + e.getKey() + "'");
            if (e.getValue() != null && e.getValue().length() > 4000) throw ApiException.bad(e.getKey() + " is too long");
            if (e.getValue() != null && !e.getValue().isBlank()) clean.put(e.getKey(), e.getValue());
        }
        jdbc.sql("UPDATE incidents SET post_incident = CAST(:p AS jsonb), updated_at = now() WHERE id = :id").param("p", Json.write(clean)).param("id", id).update();
        svc.activity(id, Actor.name(), "REVIEW", "Post-incident review updated (root cause is recorded as hypothesis unless 'verifiedCause' is filled)");
        return svc.detail(id);
    }

    @GetMapping("/{id}/report")
    @PreAuthorize("hasRole('ANALYST')")
    public ResponseEntity<byte[]> report(@PathVariable long id, @RequestParam(defaultValue = "md") String format, @RequestParam(defaultValue = "true") boolean redact) {
        if (!format.equals("md") && !format.equals("json")) throw ApiException.bad("format must be md or json");
        Map<String, Object> r = reports.build(id, redact, format, Actor.name());
        return ResponseEntity.ok().contentType(MediaType.parseMediaType((String) r.get("contentType") + ";charset=UTF-8"))
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + r.get("filename") + "\"")
                .header("X-Content-SHA256", (String) r.get("sha256"))
                .header("X-Content-Type-Options", "nosniff")
                .body(((String) r.get("body")).getBytes(StandardCharsets.UTF_8));
    }
}
