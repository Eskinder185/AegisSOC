-- AegisSOC core schema (V1). Evidence tables are append-only by application convention;
-- audit_events additionally carries a hash chain for tamper evidence.

CREATE TABLE users (
    id            BIGSERIAL PRIMARY KEY,
    username      TEXT NOT NULL UNIQUE,
    display_name  TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL CHECK (role IN ('VIEWER','ANALYST','INCIDENT_LEAD','DETECTION_ENGINEER','ADMIN')),
    enabled       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE data_sources (
    id                    BIGSERIAL PRIMARY KEY,
    name                  TEXT NOT NULL UNIQUE,
    source_type           TEXT NOT NULL,            -- fixture, suricata_eve, json_ingest, wazuh, aegisai, netshield, cloud_json
    description           TEXT NOT NULL DEFAULT '',
    synthetic             BOOLEAN NOT NULL DEFAULT TRUE,
    enabled               BOOLEAN NOT NULL DEFAULT TRUE,
    direction             TEXT NOT NULL DEFAULT 'READ_ONLY',
    sensitivity           TEXT NOT NULL DEFAULT 'LOW',
    owner                 TEXT NOT NULL DEFAULT 'unassigned',
    integration_status    TEXT NOT NULL DEFAULT 'PLANNED', -- VERIFIED_LIVE | HISTORICALLY_REPORTED | PLANNED | UNCERTAIN | RETIRED | LOCAL_FIXTURE
    health                TEXT NOT NULL DEFAULT 'NEVER_INGESTED', -- HEALTHY | STALE | FAILED | NEVER_INGESTED | DISABLED
    expected_interval_sec INT NOT NULL DEFAULT 3600,
    last_test_at          TIMESTAMPTZ,
    last_success_at       TIMESTAMPTZ,
    last_error            TEXT,
    checkpoint            TEXT,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ingestion_runs (
    id                BIGSERIAL PRIMARY KEY,
    source_id         BIGINT NOT NULL REFERENCES data_sources(id),
    scenario          TEXT,
    seed              BIGINT,
    started_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at       TIMESTAMPTZ,
    status            TEXT NOT NULL DEFAULT 'RUNNING' CHECK (status IN ('RUNNING','SUCCEEDED','PARTIAL','FAILED')),
    events_received   INT NOT NULL DEFAULT 0,
    events_accepted   INT NOT NULL DEFAULT 0,
    events_duplicate  INT NOT NULL DEFAULT 0,
    events_rejected   INT NOT NULL DEFAULT 0,
    alerts_created    INT NOT NULL DEFAULT 0,
    parser_version    TEXT NOT NULL,
    synthetic         BOOLEAN NOT NULL,
    triggered_by      TEXT,
    error_summary     TEXT
);

CREATE TABLE ingestion_errors (
    id      BIGSERIAL PRIMARY KEY,
    run_id  BIGINT NOT NULL REFERENCES ingestion_runs(id) ON DELETE CASCADE,
    row_no  INT NOT NULL,
    message TEXT NOT NULL
);

CREATE TABLE raw_events (
    id             BIGSERIAL PRIMARY KEY,
    source_id      BIGINT NOT NULL REFERENCES data_sources(id),
    run_id         BIGINT NOT NULL REFERENCES ingestion_runs(id),
    payload        JSONB NOT NULL,
    payload_sha256 TEXT NOT NULL,
    received_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    synthetic      BOOLEAN NOT NULL
);

CREATE TABLE normalized_events (
    id             BIGSERIAL PRIMARY KEY,
    raw_event_id   BIGINT NOT NULL REFERENCES raw_events(id),
    source_id      BIGINT NOT NULL REFERENCES data_sources(id),
    run_id         BIGINT NOT NULL REFERENCES ingestion_runs(id),
    fingerprint    TEXT NOT NULL,
    ts             TIMESTAMPTZ NOT NULL,
    original_ts    TEXT,
    event_class    TEXT NOT NULL,   -- authentication, process, network, dns, http, firewall, ids, privilege, service, system, audit
    action         TEXT NOT NULL,
    outcome        TEXT,            -- success | failure | unknown
    severity       INT NOT NULL DEFAULT 1 CHECK (severity BETWEEN 0 AND 10),
    host           TEXT,
    username       TEXT,
    src_ip         TEXT,
    dst_ip         TEXT,
    dst_port       INT,
    domain         TEXT,
    process_name   TEXT,
    process_cmdline TEXT,
    parent_process TEXT,
    message        TEXT NOT NULL,
    vendor         TEXT,
    vendor_ref     TEXT,
    synthetic      BOOLEAN NOT NULL,
    parser_version TEXT NOT NULL,
    ingested_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    search_vector  TSVECTOR GENERATED ALWAYS AS (
        to_tsvector('simple', coalesce(message,'') || ' ' || coalesce(process_cmdline,'') || ' ' || coalesce(username,'') || ' ' || coalesce(host,''))
    ) STORED,
    UNIQUE (source_id, fingerprint)
);
CREATE INDEX idx_ne_ts ON normalized_events (ts DESC, id DESC);
CREATE INDEX idx_ne_host ON normalized_events (host, ts DESC);
CREATE INDEX idx_ne_user ON normalized_events (username, ts DESC);
CREATE INDEX idx_ne_srcip ON normalized_events (src_ip, ts DESC);
CREATE INDEX idx_ne_class ON normalized_events (event_class, ts DESC);
CREATE INDEX idx_ne_run ON normalized_events (run_id);
CREATE INDEX idx_ne_domain ON normalized_events (domain);
CREATE INDEX idx_ne_fts ON normalized_events USING GIN (search_vector);

CREATE TABLE assets (
    id          BIGSERIAL PRIMARY KEY,
    hostname    TEXT NOT NULL UNIQUE,
    os          TEXT,
    owner_tag   TEXT,
    environment TEXT NOT NULL DEFAULT 'lab',
    criticality TEXT NOT NULL DEFAULT 'MEDIUM',
    first_seen  TIMESTAMPTZ,
    last_seen   TIMESTAMPTZ,
    event_count BIGINT NOT NULL DEFAULT 0,
    synthetic   BOOLEAN NOT NULL DEFAULT TRUE
);

-- What the operator expects to see per event class (drives "silent" vs "never configured" coverage states)
CREATE TABLE coverage_expectations (
    event_class        TEXT PRIMARY KEY,
    max_silence_minutes INT NOT NULL,
    description        TEXT NOT NULL
);

CREATE TABLE detection_rules (
    id               TEXT PRIMARY KEY,
    name             TEXT NOT NULL,
    description      TEXT NOT NULL,
    purpose          TEXT NOT NULL,
    severity         TEXT NOT NULL CHECK (severity IN ('LOW','MEDIUM','HIGH','CRITICAL')),
    confidence       TEXT NOT NULL CHECK (confidence IN ('LOW','MEDIUM','HIGH')),
    attack_techniques TEXT[] NOT NULL DEFAULT '{}',
    attack_justification TEXT,
    enabled          BOOLEAN NOT NULL DEFAULT TRUE,
    owner            TEXT NOT NULL DEFAULT 'detection-engineering',
    current_version  INT NOT NULL DEFAULT 1,
    last_reviewed_at TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE rule_versions (
    rule_id     TEXT NOT NULL REFERENCES detection_rules(id),
    version     INT NOT NULL,
    definition  JSONB NOT NULL,
    fingerprint TEXT NOT NULL,
    status      TEXT NOT NULL CHECK (status IN ('DRAFT','APPROVED','REJECTED','SUPERSEDED')),
    change_note TEXT,
    created_by  TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    approved_by TEXT,
    approved_at TIMESTAMPTZ,
    PRIMARY KEY (rule_id, version)
);

CREATE TABLE rule_test_runs (
    id           BIGSERIAL PRIMARY KEY,
    rule_id      TEXT NOT NULL REFERENCES detection_rules(id),
    version      INT NOT NULL,
    fingerprint  TEXT NOT NULL,
    fixture_set  TEXT NOT NULL,
    tp INT NOT NULL, fp INT NOT NULL, fn INT NOT NULL, tn INT NOT NULL,
    details      JSONB NOT NULL,
    run_by       TEXT NOT NULL,
    run_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE alerts (
    id            BIGSERIAL PRIMARY KEY,
    dedupe_key    TEXT NOT NULL UNIQUE,
    rule_id       TEXT NOT NULL REFERENCES detection_rules(id),
    rule_version  INT NOT NULL,
    title         TEXT NOT NULL,
    severity      TEXT NOT NULL,
    confidence    TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW','ACKNOWLEDGED','INVESTIGATING','ESCALATED','SUPPRESSED','CLOSED')),
    resolution    TEXT,
    classification TEXT NOT NULL DEFAULT 'SUSPICIOUS' CHECK (classification IN ('SUSPICIOUS','CONFIRMED_INCIDENT','EXPECTED_TEST_ACTIVITY','INCONCLUSIVE','BENIGN')),
    entity_host   TEXT,
    entity_user   TEXT,
    entity_ip     TEXT,
    first_event_at TIMESTAMPTZ NOT NULL,
    last_event_at  TIMESTAMPTZ NOT NULL,
    event_count   INT NOT NULL,
    assignee      TEXT,
    explanation   JSONB NOT NULL,
    suppressed_until TIMESTAMPTZ,
    suppression_reason TEXT,
    synthetic     BOOLEAN NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_alerts_status ON alerts (status, severity);
CREATE INDEX idx_alerts_rule ON alerts (rule_id);

CREATE TABLE alert_evidence (
    alert_id BIGINT NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
    event_id BIGINT NOT NULL REFERENCES normalized_events(id),
    role     TEXT NOT NULL DEFAULT 'matched',  -- matched | context
    PRIMARY KEY (alert_id, event_id)
);

CREATE TABLE alert_history (
    id          BIGSERIAL PRIMARY KEY,
    alert_id    BIGINT NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
    at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    actor       TEXT NOT NULL,
    from_status TEXT,
    to_status   TEXT,
    note        TEXT
);

CREATE TABLE suppressions (
    id         BIGSERIAL PRIMARY KEY,
    rule_id    TEXT NOT NULL REFERENCES detection_rules(id),
    scope_host TEXT,
    scope_user TEXT,
    scope_ip   TEXT,
    reason     TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE incidents (
    id          BIGSERIAL PRIMARY KEY,
    title       TEXT NOT NULL,
    summary     TEXT NOT NULL DEFAULT '',
    severity    TEXT NOT NULL,
    priority    INT NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 4),
    status      TEXT NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW','TRIAGE','INVESTIGATING','CONTAINMENT_PROPOSED','CONTAINED','RECOVERY','RESOLVED','CLOSED')),
    classification TEXT NOT NULL DEFAULT 'SUSPICIOUS',
    resolution  TEXT,
    assignee    TEXT,
    created_by  TEXT NOT NULL,
    synthetic   BOOLEAN NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    triaged_at  TIMESTAMPTZ,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    closed_at   TIMESTAMPTZ,
    merged_into BIGINT REFERENCES incidents(id),
    post_incident JSONB NOT NULL DEFAULT '{}'::jsonb,
    containment_verified BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE TABLE incident_alerts (
    incident_id BIGINT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    alert_id    BIGINT NOT NULL REFERENCES alerts(id),
    PRIMARY KEY (incident_id, alert_id)
);
CREATE TABLE incident_evidence (
    incident_id BIGINT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    event_id    BIGINT NOT NULL REFERENCES normalized_events(id),
    note        TEXT,
    added_by    TEXT NOT NULL,
    added_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (incident_id, event_id)
);
CREATE TABLE incident_notes (
    id          BIGSERIAL PRIMARY KEY,
    incident_id BIGINT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    kind        TEXT NOT NULL CHECK (kind IN ('OBSERVATION','ANALYST_NOTE','HYPOTHESIS','SYSTEM')),
    body        TEXT NOT NULL,
    author      TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE incident_tasks (
    id          BIGSERIAL PRIMARY KEY,
    incident_id BIGINT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    done        BOOLEAN NOT NULL DEFAULT FALSE,
    assignee    TEXT,
    created_by  TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ
);
CREATE TABLE incident_activity (
    id          BIGSERIAL PRIMARY KEY,
    incident_id BIGINT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    actor       TEXT NOT NULL,
    kind        TEXT NOT NULL,
    detail      TEXT NOT NULL
);

CREATE TABLE hunt_searches (
    id         BIGSERIAL PRIMARY KEY,
    name       TEXT NOT NULL,
    filter     JSONB NOT NULL,
    owner      TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE hunt_notebooks (
    id         BIGSERIAL PRIMARY KEY,
    title      TEXT NOT NULL,
    hypothesis TEXT NOT NULL,
    steps      JSONB NOT NULL DEFAULT '[]'::jsonb,
    outcome    TEXT,
    owner      TEXT NOT NULL,
    incident_id BIGINT REFERENCES incidents(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE threat_indicators (
    id             BIGSERIAL PRIMARY KEY,
    ioc_type       TEXT NOT NULL CHECK (ioc_type IN ('ip','domain','hash','url')),
    value          TEXT NOT NULL,
    classification TEXT NOT NULL,
    confidence     TEXT NOT NULL,
    source         TEXT NOT NULL,
    description    TEXT NOT NULL DEFAULT '',
    first_seen     TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at     TIMESTAMPTZ,
    synthetic      BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (ioc_type, value)
);

CREATE TABLE response_proposals (
    id              BIGSERIAL PRIMARY KEY,
    incident_id     BIGINT NOT NULL REFERENCES incidents(id),
    action_type     TEXT NOT NULL CHECK (action_type IN ('ISOLATE_HOST','BLOCK_IP','DISABLE_ACCOUNT','RESET_CREDENTIALS','COLLECT_EVIDENCE')),
    target          TEXT NOT NULL,
    reason          TEXT NOT NULL,
    expected_impact TEXT NOT NULL,
    rollback        TEXT NOT NULL,
    mode            TEXT NOT NULL DEFAULT 'SIMULATION' CHECK (mode IN ('SIMULATION')),
    status          TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED','EXPIRED','ATTESTED','VERIFIED')),
    requested_by    TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at      TIMESTAMPTZ NOT NULL,
    simulation      JSONB
);
CREATE TABLE response_approvals (
    id          BIGSERIAL PRIMARY KEY,
    proposal_id BIGINT NOT NULL REFERENCES response_proposals(id),
    approver    TEXT NOT NULL,
    decision    TEXT NOT NULL CHECK (decision IN ('APPROVED','REJECTED')),
    comment     TEXT,
    at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE verification_results (
    id          BIGSERIAL PRIMARY KEY,
    proposal_id BIGINT NOT NULL REFERENCES response_proposals(id),
    check_name  TEXT NOT NULL,
    status      TEXT NOT NULL CHECK (status IN ('PASSED','FAILED','USER_ATTESTED','NOT_MEASURABLE')),
    detail      TEXT NOT NULL,
    recorded_by TEXT NOT NULL,
    at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ai_analysis_runs (
    id            BIGSERIAL PRIMARY KEY,
    subject_type  TEXT NOT NULL,
    subject_id    BIGINT NOT NULL,
    provider      TEXT NOT NULL,
    model         TEXT,
    mode          TEXT NOT NULL CHECK (mode IN ('DETERMINISTIC','AI','FALLBACK')),
    status        TEXT NOT NULL,
    fallback_reason TEXT,
    latency_ms    BIGINT,
    output        JSONB NOT NULL,
    created_by    TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE notifications (
    id         BIGSERIAL PRIMARY KEY,
    recipient  TEXT,                -- null = everyone
    kind       TEXT NOT NULL,
    title      TEXT NOT NULL,
    body       TEXT NOT NULL DEFAULT '',
    link       TEXT,
    dedupe_key TEXT UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    read_at    TIMESTAMPTZ
);

CREATE TABLE audit_events (
    id          BIGSERIAL PRIMARY KEY,
    at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    actor       TEXT NOT NULL,
    action      TEXT NOT NULL,
    object_type TEXT,
    object_id   TEXT,
    detail      JSONB NOT NULL DEFAULT '{}'::jsonb,
    prev_hash   TEXT NOT NULL,
    hash        TEXT NOT NULL
);

CREATE TABLE system_settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_by TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE report_exports (
    id          BIGSERIAL PRIMARY KEY,
    report_type TEXT NOT NULL,
    subject_id  BIGINT,
    format      TEXT NOT NULL,
    redacted    BOOLEAN NOT NULL,
    synthetic   BOOLEAN NOT NULL,
    created_by  TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    sha256      TEXT NOT NULL
);
