package io.aegissoc.common;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;

import java.security.MessageDigest;
import java.util.HexFormat;

/** Shared JSON + hashing helpers. */
public final class Json {
    public static final ObjectMapper MAPPER = new ObjectMapper()
            .registerModule(new JavaTimeModule())
            .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)
            .enable(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS);

    /** Mapper for UNTRUSTED input: bounded nesting depth and string length (defends against JSON bombs). */
    public static final ObjectMapper SAFE = new ObjectMapper(com.fasterxml.jackson.core.JsonFactory.builder()
            .streamReadConstraints(com.fasterxml.jackson.core.StreamReadConstraints.builder()
                    .maxNestingDepth(12).maxStringLength(65536).maxNumberLength(50).build())
            .build());

    private Json() {}

    public static String write(Object o) {
        try { return MAPPER.writeValueAsString(o); } catch (JsonProcessingException e) { throw new IllegalStateException(e); }
    }

    public static JsonNode read(String s) {
        try { return MAPPER.readTree(s); } catch (JsonProcessingException e) { throw new IllegalArgumentException("invalid JSON: " + e.getOriginalMessage()); }
    }

    public static <T> T convert(Object o, Class<T> c) { return MAPPER.convertValue(o, c); }

    public static String sha256(String s) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(s.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        } catch (Exception e) { throw new IllegalStateException(e); }
    }

    /** Stable canonical form for hashing: object keys are sorted. */
    public static String canonical(JsonNode n) {
        try {
            return MAPPER.writeValueAsString(MAPPER.treeToValue(n, Object.class));
        } catch (JsonProcessingException e) { throw new IllegalStateException(e); }
    }
}
