package io.aegissoc.config;

import jakarta.servlet.http.HttpServletResponse;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.access.hierarchicalroles.RoleHierarchy;
import org.springframework.security.access.hierarchicalroles.RoleHierarchyImpl;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;
import org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter;

/**
 * Server-side session auth, CSRF double-submit cookie for the SPA, strict security headers.
 * Authorization is enforced by @PreAuthorize on controllers AND by service-level policy checks.
 */
@Configuration
@EnableMethodSecurity
public class SecurityConfig {

    @Bean
    PasswordEncoder passwordEncoder() { return new BCryptPasswordEncoder(11); }

    /** ADMIN > INCIDENT_LEAD > ANALYST > VIEWER ; ADMIN > DETECTION_ENGINEER > ANALYST */
    @Bean
    static RoleHierarchy roleHierarchy() {
        return RoleHierarchyImpl.fromHierarchy("""
                ROLE_ADMIN > ROLE_INCIDENT_LEAD
                ROLE_ADMIN > ROLE_DETECTION_ENGINEER
                ROLE_INCIDENT_LEAD > ROLE_ANALYST
                ROLE_DETECTION_ENGINEER > ROLE_ANALYST
                ROLE_ANALYST > ROLE_VIEWER
                """);
    }

    @Bean
    UserDetailsService userDetailsService(JdbcClient jdbc) {
        return username -> jdbc.sql("SELECT username, password_hash, role, enabled FROM users WHERE username = :u")
                .param("u", username)
                .query((rs, n) -> User.withUsername(rs.getString("username"))
                        .password(rs.getString("password_hash"))
                        .authorities(new SimpleGrantedAuthority("ROLE_" + rs.getString("role")))
                        .disabled(!rs.getBoolean("enabled"))
                        .build())
                .optional().orElseThrow(() -> new UsernameNotFoundException("unknown user"));
    }

    @Bean
    AuthenticationManager authenticationManager(UserDetailsService uds, PasswordEncoder pe) {
        DaoAuthenticationProvider p = new DaoAuthenticationProvider(uds);
        p.setPasswordEncoder(pe);
        p.setHideUserNotFoundExceptions(true);
        return new org.springframework.security.authentication.ProviderManager(p);
    }

    @Bean
    SecurityContextRepository securityContextRepository() { return new HttpSessionSecurityContextRepository(); }

    @Bean
    SecurityFilterChain chain(HttpSecurity http, SecurityContextRepository repo) throws Exception {
        CsrfTokenRequestAttributeHandler csrfHandler = new CsrfTokenRequestAttributeHandler();
        csrfHandler.setCsrfRequestAttributeName(null); // resolve token eagerly so the cookie is always issued
        http
            .securityContext(c -> c.securityContextRepository(repo))
            .csrf(c -> c.csrfTokenRepository(CookieCsrfTokenRepository.withHttpOnlyFalse())
                    .csrfTokenRequestHandler(csrfHandler)
                    .ignoringRequestMatchers("/api/auth/login"))
            .cors(AbstractHttpConfigurer::disable)
            .sessionManagement(s -> s.sessionFixation(f -> f.changeSessionId()).maximumSessions(5))
            .headers(h -> h
                .contentSecurityPolicy(csp -> csp.policyDirectives(
                    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; " +
                    "connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'"))
                .referrerPolicy(r -> r.policy(ReferrerPolicyHeaderWriter.ReferrerPolicy.NO_REFERRER))
                .frameOptions(f -> f.deny())
                .permissionsPolicyHeader(p -> p.policy("camera=(), microphone=(), geolocation=()")))
            .authorizeHttpRequests(a -> a
                .requestMatchers("/api/auth/login", "/api/auth/csrf").permitAll()
                .requestMatchers("/actuator/health/**", "/actuator/info").permitAll()
                .requestMatchers("/v3/api-docs/**", "/swagger-ui/**", "/swagger-ui.html").permitAll()
                .requestMatchers("/api/**").authenticated()
                .anyRequest().permitAll())
            .exceptionHandling(e -> e
                .authenticationEntryPoint((req, res, ex) -> writeJson(res, 401, "UNAUTHENTICATED", "Sign in required"))
                .accessDeniedHandler((req, res, ex) -> writeJson(res, 403, "FORBIDDEN", "Your role does not permit this action")))
            .httpBasic(AbstractHttpConfigurer::disable)
            .formLogin(AbstractHttpConfigurer::disable)
            .logout(l -> l.logoutUrl("/api/auth/logout").logoutSuccessHandler((req, res, a) -> res.setStatus(204)));
        return http.build();
    }

    private static void writeJson(HttpServletResponse res, int status, String code, String msg) throws java.io.IOException {
        res.setStatus(status);
        res.setContentType(MediaType.APPLICATION_JSON_VALUE);
        res.getWriter().write("{\"status\":" + status + ",\"code\":\"" + code + "\",\"message\":\"" + msg + "\"}");
    }
}
