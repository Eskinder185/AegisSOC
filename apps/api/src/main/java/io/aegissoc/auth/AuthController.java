package io.aegissoc.auth;

import io.aegissoc.audit.AuditService;
import io.aegissoc.common.ApiException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.DisabledException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class AuthController {
    public record LoginRequest(@NotBlank @Size(max = 64) String username, @NotBlank @Size(max = 128) String password) {}

    private final AuthenticationManager authManager;
    private final SecurityContextRepository repo;
    private final JdbcClient jdbc;
    private final AuditService audit;
    private final LoginThrottle throttle;

    public AuthController(AuthenticationManager am, SecurityContextRepository repo, JdbcClient jdbc, AuditService audit, LoginThrottle throttle) {
        this.authManager = am; this.repo = repo; this.jdbc = jdbc; this.audit = audit; this.throttle = throttle;
    }

    /** Issues the CSRF cookie (XSRF-TOKEN) the SPA echoes in X-XSRF-TOKEN. */
    @GetMapping("/auth/csrf")
    public Map<String, String> csrf(CsrfToken token) { return Map.of("headerName", token.getHeaderName(), "token", token.getToken()); }

    @PostMapping("/auth/login")
    public Map<String, Object> login(@Valid @RequestBody LoginRequest req, HttpServletRequest http, HttpServletResponse res) {
        String key = req.username().toLowerCase() + "@" + http.getRemoteAddr();
        if (throttle.isLocked(key)) {
            audit.record(req.username(), "auth.login.locked", "user", req.username(), Map.of());
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "TOO_MANY_ATTEMPTS", "Too many failed sign-in attempts. Try again in a few minutes.");
        }
        try {
            Authentication auth = authManager.authenticate(UsernamePasswordAuthenticationToken.unauthenticated(req.username(), req.password()));
            SecurityContext ctx = SecurityContextHolder.createEmptyContext();
            ctx.setAuthentication(auth);
            SecurityContextHolder.setContext(ctx);
            http.getSession(true);
            http.changeSessionId();
            repo.saveContext(ctx, http, res);
            throttle.reset(key);
            audit.record(auth.getName(), "auth.login", "user", auth.getName(), Map.of());
            return me(auth);
        } catch (DisabledException e) {
            throttle.fail(key);
            throw new ApiException(HttpStatus.UNAUTHORIZED, "INVALID_CREDENTIALS", "Invalid username or password");
        } catch (AuthenticationException e) {
            throttle.fail(key);
            audit.record(req.username(), "auth.login.failed", "user", req.username(), Map.of());
            throw new ApiException(HttpStatus.UNAUTHORIZED, "INVALID_CREDENTIALS", "Invalid username or password");
        }
    }

    @GetMapping("/auth/me")
    public Map<String, Object> me(Authentication auth) {
        if (auth == null) throw new ApiException(HttpStatus.UNAUTHORIZED, "UNAUTHENTICATED", "Sign in required");
        String role = auth.getAuthorities().iterator().next().getAuthority().replace("ROLE_", "");
        String display = jdbc.sql("SELECT display_name FROM users WHERE username = :u").param("u", auth.getName()).query(String.class).optional().orElse(auth.getName());
        return Map.of("username", auth.getName(), "displayName", display, "role", role);
    }

    @GetMapping("/users")
    public List<Map<String, Object>> users() {
        return jdbc.sql("SELECT username, display_name AS \"displayName\", role, enabled FROM users ORDER BY username").query().listOfRows();
    }

    public record UserPatch(String role, Boolean enabled) {}

    @PatchMapping("/admin/users/{username}")
    @PreAuthorize("hasRole('ADMIN')")
    public Map<String, Object> patch(@PathVariable String username, @RequestBody UserPatch p) {
        if (p.role() != null && !List.of("VIEWER", "ANALYST", "INCIDENT_LEAD", "DETECTION_ENGINEER", "ADMIN").contains(p.role()))
            throw ApiException.bad("Unknown role");
        if (username.equals(Actor.name()) && (Boolean.FALSE.equals(p.enabled()) || (p.role() != null && !p.role().equals("ADMIN"))))
            throw ApiException.conflict("SELF_LOCKOUT", "You cannot disable or demote your own account");
        int n = jdbc.sql("UPDATE users SET role = COALESCE(:r, role), enabled = COALESCE(:e, enabled) WHERE username = :u")
                .param("r", p.role()).param("e", p.enabled()).param("u", username).update();
        if (n == 0) throw ApiException.notFound("User");
        audit.record(Actor.name(), "user.update", "user", username, Map.of("role", String.valueOf(p.role()), "enabled", String.valueOf(p.enabled())));
        return Map.of("updated", username);
    }
}
