package io.aegissoc.auth;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

/** Resolves the authenticated principal for service-layer checks (never trust client-supplied identities). */
public final class Actor {
    private Actor() {}

    public static String name() {
        Authentication a = SecurityContextHolder.getContext().getAuthentication();
        return a == null || !a.isAuthenticated() ? "system" : a.getName();
    }

    public static String role() {
        Authentication a = SecurityContextHolder.getContext().getAuthentication();
        if (a == null) return "SYSTEM";
        return a.getAuthorities().stream().map(g -> g.getAuthority().replace("ROLE_", "")).findFirst().orElse("NONE");
    }
}
