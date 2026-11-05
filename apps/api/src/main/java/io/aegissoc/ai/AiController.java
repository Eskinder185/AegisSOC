package io.aegissoc.ai;

import io.aegissoc.audit.AuditService;
import io.aegissoc.auth.Actor;
import io.aegissoc.common.ApiException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/ai")
public class AiController {
    private final AiService ai;
    private final AuditService audit;
    private final JdbcClient jdbc;

    public AiController(AiService ai, AuditService audit, JdbcClient jdbc) { this.ai = ai; this.audit = audit; this.jdbc = jdbc; }

    @GetMapping("/status")
    public Map<String, Object> status() { return ai.status(); }

    public record AnalyzeBody(@NotBlank String subjectType, long subjectId, @NotBlank String task, Boolean useAi) {}

    @PostMapping("/analyze")
    @PreAuthorize("hasRole('ANALYST')")
    public Map<String, Object> analyze(@Valid @RequestBody AnalyzeBody b) {
        return ai.analyze(b.subjectType(), b.subjectId(), b.task(), Boolean.TRUE.equals(b.useAi()), Actor.name());
    }

    public record Settings(Boolean enabled, String mockBehavior) {}

    @PutMapping("/settings")
    @PreAuthorize("hasRole('ADMIN')")
    public Map<String, Object> settings(@RequestBody Settings s) {
        if (s.enabled() != null) {
            ai.setSetting("ai.enabled", String.valueOf(s.enabled()), Actor.name());
            audit.record(Actor.name(), s.enabled() ? "ai.enable" : "ai.disable", "ai", null, Map.of());
        }
        if (s.mockBehavior() != null) {
            if (!AiProvider.Mock.BEHAVIORS.contains(s.mockBehavior())) throw ApiException.bad("Unknown mock behaviour");
            ai.setSetting("ai.mock.behavior", s.mockBehavior(), Actor.name());
            audit.record(Actor.name(), "ai.mock.behavior", "ai", null, Map.of("behavior", s.mockBehavior()));
        }
        return ai.status();
    }

    @PostMapping("/evaluate")
    @PreAuthorize("hasRole('DETECTION_ENGINEER')")
    public Map<String, Object> evaluate() { return ai.evaluate(Actor.name()); }

    @GetMapping("/runs")
    public List<Map<String, Object>> runs() {
        return jdbc.sql("""
                SELECT id, subject_type AS "subjectType", subject_id AS "subjectId", provider, model, mode, status, fallback_reason AS "fallbackReason",
                       latency_ms AS "latencyMs", created_by AS "createdBy", created_at AS "createdAt" FROM ai_analysis_runs ORDER BY id DESC LIMIT 50""").query().listOfRows();
    }
}
