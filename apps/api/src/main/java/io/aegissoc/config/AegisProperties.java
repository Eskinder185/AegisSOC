package io.aegissoc.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** All feature flags default to the safest value: optional integrations OFF, live response OFF. */
@ConfigurationProperties(prefix = "aegis")
public record AegisProperties(
        String devPassword,
        boolean devResetEnabled,
        Ai ai,
        Response response,
        Ingest ingest) {

    public record Ai(String provider, String ollamaUrl, String model, int timeoutSeconds, int maxContextEvents) {}

    /** Live response execution does not exist in this build; the flag exists so policy tests can prove deny-by-default. */
    public record Response(boolean liveExecutionEnabled, int proposalTtlHours) {}

    public record Ingest(int maxBatchEvents, long maxUploadBytes, int maxJsonDepth, int maxFieldLength) {}
}
