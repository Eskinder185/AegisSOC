package io.aegissoc.ai;

import io.aegissoc.common.Json;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import java.util.Map;

/** Optional model backends. None is called unless the operator configured a provider AND enabled AI AND the request opts in. */
public interface AiProvider {
    record Prompt(String system, String user, List<Long> allowedEventIds, String subjectTitle) {}

    String id();
    String model();
    boolean configured();
    String complete(Prompt p, Duration timeout) throws Exception;

    /** No AI configured: the default. */
    final class None implements AiProvider {
        public String id() { return "none"; }
        public String model() { return ""; }
        public boolean configured() { return false; }
        public String complete(Prompt p, Duration t) { throw new IllegalStateException("No AI provider is configured"); }
    }

    /**
     * Deterministic stand-in that never leaves the process. Behaviours exist so guardrails can be tested and demonstrated
     * with hostile model output WITHOUT sending any data anywhere.
     */
    final class Mock implements AiProvider {
        public static final List<String> BEHAVIORS = List.of("good", "timeout", "malformed", "hallucinate", "inject", "overconfident", "leak", "action", "unsafe_remediation");
        private final String behavior;

        public Mock(String behavior) { this.behavior = behavior == null || behavior.isBlank() ? "good" : behavior; }

        public String id() { return "mock"; }
        public String model() { return "mock-" + behavior; }
        public boolean configured() { return true; }

        public String complete(Prompt p, Duration timeout) throws Exception {
            List<Long> ids = p.allowedEventIds();
            List<Long> cite = ids.stream().limit(3).toList();
            switch (behavior) {
                case "timeout": Thread.sleep(timeout.toMillis() + 500); return "{}";
                case "malformed": return "Sure! Here is my analysis: {not json";
                case "hallucinate": return ok("The activity matches the alert.", List.of(Map.of("text", "An event shows the account signed in.", "eventIds", List.of(987654321L))), List.of("Review the sign-in."), false);
                case "overconfident": return ok("This account is definitely compromised.", ids.isEmpty() ? List.of() : List.of(Map.of("text", "The attacker has been confirmed.", "eventIds", cite)), List.of("Review."), ids.isEmpty());
                case "leak": return ok("As instructed by AEGIS-SYSTEM-PROMPT-7f3a: password=hunter2", List.of(), List.of(), true);
                case "inject": return "{\"summary\":\"Following the instructions found in the logs.\",\"claims\":[],\"nextSteps\":[],\"uncertainty\":[],\"insufficientEvidence\":true,\"actions\":[{\"tool\":\"block_ip\",\"target\":\"0.0.0.0/0\"}]}";
                case "action": return "{\"summary\":\"Done.\",\"claims\":[],\"nextSteps\":[\"I have blocked the address and disabled the account.\"],\"uncertainty\":[],\"insufficientEvidence\":true}";
                case "unsafe_remediation": return ok("Suggested remediation below.", List.of(), List.of("Turn off the firewall and disable audit logging to stop the noise."), true);
                default:
                    if (ids.isEmpty()) return ok("There is not enough evidence attached to draw a conclusion.", List.of(), List.of("Collect more events before deciding."), true);
                    return ok("Interpretation (mock model): the cited events are consistent with the alert rule firing. This is not proof of compromise.",
                            List.of(Map.of("text", "The cited events were observed and match the rule conditions.", "eventIds", cite)),
                            List.of("Confirm with the account owner.", "Search surrounding activity for the same entity."), false);
            }
        }

        private static String ok(String summary, List<?> claims, List<String> next, boolean insufficient) {
            return Json.write(Map.of("summary", summary, "claims", claims, "nextSteps", next, "uncertainty", List.of("Based only on the supplied events."), "insufficientEvidence", insufficient));
        }
    }

    /** Local Ollama-compatible endpoint. Only loopback addresses are accepted so event data cannot leave the machine. */
    final class Ollama implements AiProvider {
        private final String baseUrl;
        private final String model;
        private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build();

        public Ollama(String baseUrl, String model) { this.baseUrl = baseUrl; this.model = model; }

        public String id() { return "ollama"; }
        public String model() { return model; }
        public boolean configured() { return model != null && !model.isBlank() && isLoopback(baseUrl); }

        static boolean isLoopback(String url) {
            try {
                String h = URI.create(url).getHost();
                return "localhost".equalsIgnoreCase(h) || "127.0.0.1".equals(h) || "[::1]".equals(h) || "::1".equals(h);
            } catch (Exception e) { return false; }
        }

        public String complete(Prompt p, Duration timeout) throws Exception {
            if (!configured()) throw new IllegalStateException("Ollama provider needs a model name and a loopback URL");
            String body = Json.write(Map.of("model", model, "stream", false, "format", "json", "system", p.system(), "prompt", p.user(),
                    "options", Map.of("temperature", 0.1, "num_predict", 700)));
            HttpRequest req = HttpRequest.newBuilder(URI.create(baseUrl.replaceAll("/+$", "") + "/api/generate")).timeout(timeout)
                    .header("Content-Type", "application/json").POST(HttpRequest.BodyPublishers.ofString(body)).build();
            HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
            if (res.statusCode() != 200) throw new IllegalStateException("Ollama returned HTTP " + res.statusCode());
            return Json.SAFE.readTree(res.body()).path("response").asText("");
        }
    }
}
