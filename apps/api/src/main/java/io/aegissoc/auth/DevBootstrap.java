package io.aegissoc.auth;

import io.aegissoc.config.AegisProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import java.security.SecureRandom;

/**
 * Seeds LOCAL DEVELOPMENT users on an empty database. There is no built-in default password:
 * it comes from AEGIS_DEV_PASSWORD or is randomly generated and logged exactly once.
 */
@Component
@Order(1)
public class DevBootstrap implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(DevBootstrap.class);
    private final JdbcClient jdbc;
    private final PasswordEncoder encoder;
    private final AegisProperties props;

    public DevBootstrap(JdbcClient jdbc, PasswordEncoder encoder, AegisProperties props) {
        this.jdbc = jdbc; this.encoder = encoder; this.props = props;
    }

    @Override
    public void run(ApplicationArguments args) {
        Long count = jdbc.sql("SELECT count(*) FROM users").query(Long.class).single();
        if (count > 0) return;
        String pw = props.devPassword();
        boolean generated = false;
        if (pw == null || pw.isBlank()) { pw = randomPassword(); generated = true; }
        if (pw.length() < 12) throw new IllegalStateException("AEGIS_DEV_PASSWORD must be at least 12 characters");
        String hash = encoder.encode(pw);
        String[][] users = {
                {"admin", "Avery Admin", "ADMIN"},
                {"lead", "Lena Lead (Incident Lead)", "INCIDENT_LEAD"},
                {"analyst", "Alex Analyst", "ANALYST"},
                {"engineer", "Eli Engineer (Detection)", "DETECTION_ENGINEER"},
                {"viewer", "Val Viewer", "VIEWER"}};
        for (String[] u : users) {
            jdbc.sql("INSERT INTO users (username, display_name, password_hash, role) VALUES (:u,:d,:h,:r)")
                    .param("u", u[0]).param("d", u[1]).param("h", hash).param("r", u[2]).update();
        }
        if (generated) log.warn("Seeded dev users (admin, lead, analyst, engineer, viewer). Generated password (shown once): {}", pw);
        else log.info("Seeded dev users (admin, lead, analyst, engineer, viewer) with the password from AEGIS_DEV_PASSWORD");
    }

    private static String randomPassword() {
        String chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
        SecureRandom r = new SecureRandom();
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < 20; i++) sb.append(chars.charAt(r.nextInt(chars.length())));
        return sb.toString();
    }
}
