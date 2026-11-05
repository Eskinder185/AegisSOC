package io.aegissoc.auth;

import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.ConcurrentHashMap;

/** In-memory brute-force guard: 5 failures per username+address locks that pair for 5 minutes. */
@Component
public class LoginThrottle {
    private static final int MAX = 5;
    private static final Duration LOCK = Duration.ofMinutes(5);
    private record State(int fails, Instant lockedUntil) {}
    private final ConcurrentHashMap<String, State> state = new ConcurrentHashMap<>();

    public boolean isLocked(String key) {
        State s = state.get(key);
        if (s == null || s.lockedUntil() == null) return false;
        if (Instant.now().isAfter(s.lockedUntil())) { state.remove(key); return false; }
        return true;
    }

    public void fail(String key) {
        state.merge(key, new State(1, null), (old, n) -> {
            int f = old.fails() + 1;
            return new State(f, f >= MAX ? Instant.now().plus(LOCK) : null);
        });
    }

    public void reset(String key) { state.remove(key); }
}
