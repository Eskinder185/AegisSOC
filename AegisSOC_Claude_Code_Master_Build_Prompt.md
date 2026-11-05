# AEGISSOC — AUTONOMOUS DEFENSIVE SECURITY OPERATIONS PLATFORM
## Claude Code Master Build Directive — v1.0 (November 2026)

> **INSTRUCTIONS FOR CLAUDE CODE:** Read this document completely, inspect the existing repository, and then **build working software**. This is an implementation directive, not a request for a project plan, pitch deck, or static UI mockup. Work independently on safe local tasks, keep your progress durable, and deliver a usable defensive SOC platform even when external infrastructure is unavailable.

---

# 0. YOUR ROLE, MISSION, AND PRODUCT POSITIONING

Act as a coordinated engineering team with the judgment of a:

1. Principal software architect and Java/Spring Boot engineer.
2. Senior TypeScript/React frontend engineer.
3. Senior product designer and UX researcher.
4. Detection engineer and incident responder.
5. SOC analyst, security telemetry architect, and threat hunter.
6. Defensive AI/LLM engineer and evaluation engineer.
7. Security/privacy engineer and threat modeler.
8. PostgreSQL/data engineer.
9. SRE/DevOps engineer.
10. Independent QA, accessibility, and security reviewer.

Build **AegisSOC**, a professional, locally runnable, AI-assisted **Security Operations Center** application that helps people collect and understand permitted security telemetry, identify suspicious behavior, investigate incidents, organize evidence, improve detection coverage, and verify defensive improvements.

AegisSOC must be a **real project**, not a decorative cyber-themed dashboard, generic log viewer, or duplicate of existing SIEM products. It should transform security data into useful decisions and reproducible investigation workflows.

### One-sentence value proposition

> **AegisSOC turns noisy security events into understandable, evidence-backed investigations and measurable defensive improvements—with AI that assists analysts but never bypasses human authority.**

### Distinct roles of related projects

- **AegisSOC:** The **defensive operations product**: telemetry ingestion, alert detection, case management, SOC analyst workflow, threat hunting, incident response planning, evidence, reporting, and AI-assisted triage.
- **AegisAI:** A **separate** authorized security-validation project. It may later produce normalized test results and detection-coverage evidence for AegisSOC. Create an optional, versioned integration; do **not** make AegisSOC depend on AegisAI running.
- **NetShield:** A **separate** consumer network-security and Internet Doctor project. It may later contribute consented, normalized security alerts; do not merge codebases or turn AegisSOC into a residential troubleshooting portal.
- **HomeLab Command Center:** Supervises infrastructure and evidence/status. It is not automatically AegisSOC's backend.

AegisSOC should stand on its own when other projects are offline.

---

# 1. NON-NEGOTIABLE WORKING PRINCIPLES

1. **Implement, don't just plan.** Write code, migrations, components, tests, seed fixtures, deployment manifests, developer tooling, and complete documentation.
2. **Inspect first.** This may be an existing project. Survey the repository, branch status, file layout, uncommitted changes, prior decisions, and tests before editing. Preserve work; do not overwrite, delete, or reformat unrelated code.
3. **No assumptions about installed infrastructure.** Prior references to Wazuh, Suricata, Proxmox, Ubuntu SOC servers, agents, Docker or Ollama are historical—not proof that they are healthy or available today. Do not claim integration is working without a verified test.
4. **Offline-first development.** The whole product must run with **synthetic but realistic labeled datasets** and a local deterministic detection engine; no secret keys, cloud accounts, local network permissions, actual Wazuh server, or GPU should be necessary.
5. **Real workflows, not fake visuals.** Each important button performs an actual supported action or explains why it is unavailable. Synthetic examples must be labeled. Do not manufacture “live attacks,” incidents, successful actions, threat counts, certifications, customers or detection coverage.
6. **Defensive and approval-gated.** AegisSOC must never automatically block IPs, disable accounts, quarantine endpoints, modify firewall rules, change DNS, edit cloud resources, or terminate processes without explicit scoped user approval, capability checks, rollback guidance, and a separate execution boundary.
7. **Evidence before interpretation.** Facts come from telemetry, rules and verifiable evidence. AI summarizes or hypothesizes; it cannot fabricate events, citations, MITRE technique associations, successful containment, or closed incidents.
8. **Fast to understand.** Create a delightful professional UI with a straightforward default experience for learners, and optional advanced investigation details for experts.
9. **Secure by design.** Least privilege, authentication, authorization, input validation, audit logging, secrets protection, bounded ingestion and safe error handling are required.
10. **Safe resource consumption.** Prioritize a light, useful single-node development deployment, not a resource-hungry enterprise cluster.
11. **Cost-conscious.** Prefer free/open-source, included, and locally runnable tools. AI provider integrations must be optional and disabled unless explicitly configured.
12. **Measure what works.** Every phase must include automated tests, observable results, and a truthful status ledger.

---

# 2. SAFETY BOUNDARY: WHAT YOU MAY AND MAY NOT DO

## You may do autonomously

- Read the local AegisSOC repository and documentation.
- Create a dedicated development branch if git is already initialized.
- Implement the application, Docker development setup, docs, tests, assets, and local synthetic telemetry datasets.
- Install routine development dependencies from package registries using lockfiles.
- Run non-destructive local builds, linters, type checks, vulnerability scans of this project's source/dependencies, unit tests, UI tests, and integration tests.
- Generate and replay **offline fixture events** and incidents; run ingestion against test inputs and synthetic local log streams.
- Create optional Wazuh/Suricata/cloud/agent integration adapters with disabled-by-default configuration.
- Create local commits of your own verified changes on the dedicated development branch, unless the repository explicitly prohibits this.
- Use deterministic rules to analyze supplied fixture data and demonstrate incident workflow end-to-end.

## You must NOT do without separate explicit authorization

- Scan, enumerate, exploit, or actively probe the user's actual LAN, Wi-Fi, router, NAS, computers, Proxmox host, VMs, servers, or public systems.
- Connect to or modify a historical SOC server, Wazuh manager, SIEM database, Suricata sensor, Proxmox host, VPN, AWS account, or third-party service.
- Open firewall ports, change routing, DNS, segmentation, endpoint protections, scheduled services, systemd state, or actual alerting configuration.
- Push to GitHub/any remote, create production deployments, expose services publicly, procure subscriptions, send emails/SMS/webhooks externally, or incur cloud/API expenses.
- Ingest real personal or organizational security logs into an external LLM or cloud endpoint.
- Perform live response/remediation actions such as blocking, isolating, revoking, deleting, restarting production services, or applying firewall rules.
- Alter any existing infrastructure while trying to make tests pass.

### Implementation rule

Include a strict **read-only / simulation / approved-action** capability model. External integrations and active response connectors are **disabled by default**, with explicit service-side policy enforcement, target allowlists, role-based approval, and immutable audit records. Do not rely on frontend controls or natural-language prompts for authorization.

When blocked by an external dependency, document it and continue with the next independent task. Do not stall the whole build.

---

# 3. HISTORICAL LAB CONTEXT — NOT LIVE STATE

You may discover documentation referring to this existing hardware and software:

- A **GEEKOM AX8 MAX mini PC**, historically running **Proxmox VE 9.1**, Ryzen 7 8745HS, 8 cores/16 threads, 32 GB RAM, 1 TB NVMe, 8 TB external storage. This machine is resource-constrained and also supports other projects.
- An **Ubuntu HP SOC laptop/server**, historically called `soc-server`, which has been used/planned for Wazuh and defensive telemetry. Reports about its RAM/storage and always-on status have differed; **verify before integration**.
- Separate Linux/Kali lab laptops and a Windows PC with **RTX 4070 SUPER**, which is **not guaranteed to be running 24/7**.
- **Wazuh** historically reported as working for endpoint monitoring. **Suricata** reported as planned/partial proof of concept; successful Suricata-to-Wazuh correlation is **unverified**.
- An **Ollama/Qwen local-model environment** historically used for compact CPU-first inference; do not assume it exists, is up-to-date, or has free RAM at build time.
- OPNsense/pfSense, VLANs, network segmentation, Docker, Wazuh/Suricata, Tailscale and home-lab infrastructure mentioned across past work.

**Never hardcode historical hostnames, IP addresses, tokens or access credentials.** Never treat historical descriptions as live verification. Keep the product operational with generated fixture telemetry and a local application database only.

## Required status language in documentation and UI

- **Verified Live:** Actually executed and demonstrated using current evidence.
- **Historically Reported:** Described in prior notes but not verified now.
- **Planned:** Not implemented or not enabled.
- **Uncertain / Conflicting:** Evidence missing or inconsistent.
- **Retired:** Explicitly no longer part of the design.

Every integration card should explain: not configured, connection tested, last successful ingestion, permissions, data coverage, and failure/staleness conditions.

---

# 4. ARCHITECTURE: PRESERVE EXISTING PROJECT DECISIONS

## Preferred core stack

- **Frontend:** React + TypeScript + Vite; a modern component system with Tailwind CSS or a compatible existing styling approach; React Router; TanStack Query or equivalent reliable data-fetching; accessible headless UI primitives; a small visualization library only where justified.
- **Backend:** **Java 21+ and Spring Boot 3.x/compatible supported release**, Spring Web, Spring Security, Bean Validation, Spring Data JPA / carefully chosen SQL, and OpenAPI documentation.
- **Database:** PostgreSQL with **Flyway** (or the repository's existing tested migration system). Local Docker Compose setup.
- **Event ingestion:** Spring ingestion services for initial MVP, with bounded background queues and batch processing. Do not add Kafka, Elasticsearch, or an elaborate service mesh by default.
- **Search:** For the initial dataset, PostgreSQL indexes, structured filters, and carefully implemented full-text search; evaluate a dedicated search backend only if scale and benchmarks require it.
- **Auth:** Safe local-development auth appropriate to the repo, with server-side sessions or a well-engineered token implementation, role checks, CSRF protection where relevant, and sensible password policies. No production default passwords.
- **AI:** Optional adapter for local Ollama or approved cloud LLM. Deterministic, useful results when no AI is configured. AI work is asynchronous, timeout-bound and resource-limited.
- **Containerization:** Lightweight Docker Compose profiles. AegisSOC must be runnable without a deployed Wazuh manager or a GPU.
- **Testing:** JUnit 5, Spring Boot integration tests, Testcontainers when available, Vitest/React Testing Library, Playwright, accessibility checks, linters, dependency reviews, and a real local end-to-end smoke test.
- **CI:** GitHub Actions workflows using free-tier-friendly jobs; never require the user's secrets to run essential checks.

## Architectural boundaries

Use clear modules or packages (not necessarily microservices):

```text
AegisSOC/
  apps/
    web/                   # React application and marketing pages
    api/                   # Spring Boot application
  packages/                 # only if useful for shared types/design tokens
  tooling/
    fixtures/              # labeled synthetic telemetry + generators
    scripts/               # repeatable developer commands
  infra/
    docker/                # isolated dev profile, sample overrides
  docs/
    architecture/
    security/
    product/
    ai/
    runbooks/
    evidence/
  tests/
    e2e/
    fixtures/
```

**Adapt to the existing repository.** Do not reorganize recklessly or create three frameworks when one suffices.

### Suggested logical data path

```text
Wazuh (optional, read-only) ---\
Suricata EVE JSON (optional) ----> Ingestion adapters
Endpoint fixture events --------/         |
                                         v
                             Normalize + validate + dedupe
                                         |
                                         v
                             Durable event store (PostgreSQL)
                                         |
                         +---------------+----------------+
                         |               |                |
                         v               v                v
                   Detection rules   Search/hunting    Asset context
                         |               |                |
                         +---------------+----------------+
                                         |
                                         v
                                Alerts + case workflow
                                         |
                          +--------------+---------------+
                          |                              |
                          v                              v
                    Human investigation              AI enrichment
                          |                       (optional, bounded)
                          +--------------+---------------+
                                         |
                                         v
                            Actions, audit & verification
                                         |
                                         v
                                Dashboard + reports
```

AI is **not** part of critical detection/ingestion or packet-forwarding paths. A failed AI request must not break telemetry processing, alerting, search, or ordinary case management.

---

# 5. PREMIUM UI/UX — A TOP-PRIORITY REQUIREMENT

Treat product usability and visual quality as core engineering deliverables, not last-minute polish.

## Design intent

Create a distinctive, credible enterprise-security product that is:

- Polished enough to resemble commercial SOC software.
- Calm and readable enough for beginners.
- Efficient for analysts under time pressure.
- Mobile-responsive for review/notification workflows, while recognizing that deep investigation is best on larger screens.
- Accessible to WCAG 2.2 AA as a target, including screen readers, keyboard navigation, clear focus states, contrast, text alternatives for charts and reduced motion.
- Excellent in both light and dark mode, with a coherent design system and consistent iconography.

Avoid: excessive neon, matrix backgrounds, frightening animated attacks, tiny text, meaningless donut charts, fake “real-time” numbers, 30-card landing screens, jargon-only labels, low-contrast tables, overwhelming filter panels, and layouts that only work at desktop widths.

## Nontechnical explanation policy

Every significant alert or security recommendation should answer:

1. **What happened?**
2. **Why does it matter?**
3. **How sure are we?**
4. **What evidence supports this finding?**
5. **What should someone do next?**
6. **How will we know the issue is resolved?**

Provide two levels of language:

- **Simple view:** "This computer had several failed sign-in attempts followed by a successful sign-in. Review whether the sign-in was expected."
- **Analyst details:** source, timestamps, process/user identity, event ids, rule conditions, correlation window, evidence references, ATT&CK mapping when supported.

Never call a user or device compromised solely because a rule triggered. Clearly distinguish confirmed incident, suspicious event, expected test activity, and inconclusive finding.

## Navigation blueprint

Design purposeful pages and flows for:

1. **Overview / Command Center** — health, queue, coverage, priority actions and trends.
2. **Alerts** — filterable queue, prioritization, triage, bulk actions with role safeguards.
3. **Incidents / Cases** — investigative timeline, artifacts, ownership, notes, tasks, resolution.
4. **Investigations / Hunt** — guided queries, saved searches, pivoting, evidence links.
5. **Assets / Endpoints** — host inventory, observed telemetry coverage, last seen, high-risk items.
6. **Detections** — rule catalog, metadata, enable/disable only within local app, revisions, tests, coverage and noise.
7. **Threat Intelligence** — carefully attributed enrichment, local test data, indicator handling.
8. **AI Analyst** — evidence-grounded summaries and follow-up questions (optional model).
9. **Response Center** — containment recommendations, approval flow, dry runs and verification.
10. **Reports / Metrics** — security outcomes, analyst effectiveness, coverage and exports.
11. **Data Sources** — connectors, health, last-ingest, sample events, error recovery.
12. **Lab / Simulations** — clearly labeled fixture scenarios and replayable detections.
13. **Settings / Access / Audit** — users, roles, retention, privacy, model opt-in and audit logs.

Do not implement 13 useless empty pages. Build complete workflows in priority order, adding modules as supporting backend behavior becomes real. Disabled future capabilities should be plainly labeled with helpful setup explanations.

## Dashboard information hierarchy

Above the fold, show:

- Product/data-source state: **Demo mode, Live connected, Disconnected, Stale**.
- Incident queue with critical/high items requiring actual attention.
- Last successful ingest and events processed.
- Data coverage (by source and asset; unknown coverage distinguished from zero risk).
- High-priority work and investigation ownership.
- A clear entry point to “Investigate alert” and “Run safe demo scenario.”

Advanced charts should explain trends, not decorate the screen.

## UX interactions and states

All components must have working navigation, responsive interaction, validation, loading, error, empty, offline, stale, permission-denied and success states where applicable. Include skeletons only for actual pending operations. Every data widget shows source and freshness. Provide a global consistent time zone/relative-time representation with accessible absolute timestamps. Use keyboard shortcuts only when documented and non-conflicting. Warn before destructive local changes. Support meaningful undo for reversible actions. Provide drill-down from a metric to the exact records behind it.

## Public site

Build a tasteful public homepage explaining the value of AegisSOC without invented customer testimonials, production certifications, or unbuilt capabilities. Include Features, How it Works, Demo, Architecture, Documentation, and project About/Contact sections. Build a clear separation between marketing descriptions and actual application capabilities.

---

# 6. FEATURE MODULE A — DATA SOURCES, COLLECTION, AND INGESTION

Implement a complete data-source management workflow. Initial usable inputs must be **offline fixtures** and **user-supplied local test files**. External connectors are adapters, disabled until authorized.

### A1. Source registry
- Add, edit, label, disable/enable local source definitions.
- Source type, capabilities, directionality (read-only by default), status, last test, last successful ingestion, cursor/checkpoint, owner, data sensitivity, error state.
- Distinguish network reachability from successful authenticated collection.

### A2. Fixture ingestion
- Generate realistic and documented synthetic auth, process, DNS, HTTP, firewall, IDS and endpoint events.
- Replay at configurable safe speeds; pause/reset demo; replay the same scenario deterministically using a seed.
- Label generated data **SYNTHETIC** in DB, UI, reports, exports and API.

### A3. Wazuh read-only connector (optional)
- Define a typed adapter for Wazuh manager/indexer API data appropriate to supported versions, configured through environment variables and secure secret references.
- Cap request rate, page sizes, lookback window and retained records.
- Retry with bounded exponential backoff, avoid silent gaps, maintain checkpoints, surface health/credential errors.
- Do not call the existing Wazuh server or alter its configuration without approval.

### A4. Suricata EVE JSON import
- Accept controlled, local exported EVE JSON test files; parse alert, dns, http, tls, flow, and relevant event types only when valid.
- Preserve vendor fields as raw evidence without assuming all fields are present.
- Reject malformed/unbounded payloads safely; produce import summary and row-level validation errors.
- Streaming/import from a real sensor remains optional and disabled until approved.

### A5. Additional adapters (build interfaces and offline tests)
- Standard JSON event ingest endpoint with authentication and schema validation.
- Safe syslog ingestion design, but do not expose a network listener by default.
- Windows and Linux endpoint event schema and fixture parsers.
- Future AWS CloudTrail/GuardDuty/Security Hub import via offline exported JSON.
- AegisAI and NetShield optional, versioned normalized event imports.

### A6. Data quality
- Normalize timestamps to UTC while preserving originals, timezone metadata and parse errors.
- Normalize severity, source, identities, host, network context and event class.
- Preserve vendor-specific raw data separately from normalized fields.
- Dedupe using stable source+event identifiers or defensible fingerprinting, without accidentally collapsing truly distinct incidents.
- Add bounded import size, pagination, indexed search, retention/cleanup and explicit import error reporting.
- Track provenance, parser version, ingestion status, original source and synthetic/real labeling.

Deliver at least **five distinct repeatable source scenarios** with seeded data and full ingestion tests.

---

# 7. FEATURE MODULE B — DETECTION, TRIAGE AND CORRELATION

Build a **deterministic detection pipeline** that works without AI.

### B1. Rules
- Local rule catalog with unique IDs, name, description, purpose, severity, confidence guidance, ATT&CK mapping only when justified, and citations to raw evidence.
- A safe, constrained rule schema or approved DSL; **no eval**, arbitrary runtime code, dynamic shell, or untrusted regex that could cause catastrophic performance.
- Support simple filters, counts, aggregation, time windows and entity grouping (e.g., host, user, source).
- Version rules, show change history, run tests against fixture datasets.

### B2. Initial detection scenarios
- Repeated failed logins with context (not automatically a breach).
- Unexpected privilege change in synthetic audit logs.
- Endpoint suspicious process creation from intentionally labeled fixtures.
- Security service stopped/disabled in a test event stream.
- Suspicious connection flagged by a synthetic IDS alert.
- Potential lateral-movement pattern inferred from multiple connected synthetic events, clearly marked hypothesis.
- Unusual sequence of account activity in a bounded demonstration.
- Security telemetry goes silent, distinguishing sensor outage from absence of threats.
- Known benign/admin behavior that tests false-positive handling.

### B3. Alerts and correlation
- Alert lifecycle: new, acknowledged, investigating, escalated, suppressed with reason/expiry, closed with resolution.
- Dedupe/correlation by entity, timing, matching rules and evidence; avoid suppressing critical independent events.
- Severity separate from confidence and confirmed impact.
- Explain **exactly which rule and inputs** led to the alert.
- Ownership, assignment, comment history, review and reopen.
- Alert-to-incident escalation and incident-to-alert backlinks.
- Correlation provenance and replayable explanation.

### B4. Noise reduction
- Analyst-reviewed tuning, suppression with scope/expiry, rule test history and noise metrics.
- Never silently disable critical detection because an AI recommends it.
- Test detection against expected positives and negatives to avoid overstating effectiveness.

---

# 8. FEATURE MODULE C — INVESTIGATION AND INCIDENT MANAGEMENT

Implement a real SOC analyst workflow, not just an “Incident Details” modal.

### Required features

- Work queue with status, severity, confidence, priority and assignee.
- Create case from alert or manual observed evidence.
- Incident stages: New → Triage → Investigating → Containment Proposed → Contained (only when verified) → Recovery → Resolved / Closed; allow exceptions with audit trail.
- Incident timeline built from evidence, analyst observations and actions (clearly distinguishing them).
- Analyst notes, tags, tasks, links, attachments **with safe file restrictions**, and handoff summary.
- Entities pane for affected user, device, IP/domain, process and account when supported by data.
- Evidence list that links directly to immutable original records.
- Status and ownership changes audited by actor and timestamp.
- Related alert/incident linking and duplicate merge with reversible/traceable metadata.
- Post-incident review: root-cause *hypothesis* vs verified cause, response steps, lessons learned, rule improvements, unresolved questions.
- Exportable sanitized case report: Markdown, JSON and optionally PDF when an appropriate library is already available.

### Guided incident workflow

Each investigation should show:

1. **What we know** (observed events).
2. **Why we care** (security context and potential impact).
3. **What is uncertain** (missing coverage, alternative explanations).
4. **What to check next** (read-only queries and evidence requests).
5. **Recommended action** (with explicit permission requirements).
6. **How to verify** (clear criteria and follow-up measurements).

For example, a cluster of failed logins followed by a successful login is **suspicious**, not automatically proof of account takeover. Provide timestamps, account, source and associated evidence; recommend verification rather than misleading certainty.

---

# 9. FEATURE MODULE D — THREAT HUNTING, ENTITY PIVOTING, SEARCH

- Search normalized events by time range, source, host, user, severity, event type, indicator, event ID and case.
- Paginated backend search, stable ordering, safe query limits, indexes and request cancellation.
- Simple “Search security events” interface with understandable facets; advanced structured filters for technical users.
- Saved searches and hunt notebooks with names, hypothesis, steps, queries, outcomes, analyst and timestamps.
- Entity pivot: start from a host/account/IP and see related records within a bounded period.
- Timeline view, histogram and event detail drawer with source and freshness.
- Export selected, scoped results with redaction policy and audit entry.
- Natural-language-to-filter recommendations are **preview only**; require analyst confirmation before running, validate against an allowlisted query schema and cap cost/time.
- Do not provide an arbitrary SQL query endpoint in the application.

---

# 10. FEATURE MODULE E — ASSETS AND COVERAGE

Build an asset inventory derived from ingested telemetry. Do not claim complete device discovery without the necessary authorized sensor.

- Asset and identity entities: host, operating system if available, last seen, observed sources, security sensor status, owner tag, environment tag and confidence in identity matching.
- Endpoint details: event count, last known telemetry, related alerts, cases, coverage gaps, observed security-control status if present.
- Coverage matrix: assets × data sources / event classes.
- Clearly distinguish **never configured**, **temporarily unavailable**, **not observed** and **observed healthy**.
- Flag stale sources and missing required signals based on configured expectations.
- Suppress misleading “100% secure” scores. Any health score must disclose inputs and unknowns.
- Historical coverage trend for verified events and fixture simulations.

---

# 11. FEATURE MODULE F — RESPONSE CENTER AND APPROVALS

Build **response planning and simulation first**, not uncontrolled automation.

### Initial supported actions
- Write a recommended containment plan for an incident.
- Generate a read-only investigation checklist.
- Simulate consequences of a proposed isolation/firewall/account action against fixture data only.
- Create an approval request with scope, reason, requester, approver, expiration, expected impact and rollback guidance.
- Approve/reject requests with role separation and audit history; approval does **not** automatically run a real-world action.
- Record manual response actions as **user-attested**, not system-verified.
- Add post-action verification tasks with measured status when a test fixture or data source supports it.

### Future external execution (never enabled by default)
- Define typed interfaces for Wazuh active response, firewall integrations, identity-provider controls or endpoint containment **without invoking them**.
- Enforce deny-by-default at backend policy service, not only UI.
- Require explicit live enablement, allowlist, role approval, scope/expiry, rate limits, dry-run preview, timeout, audit logs, stop/kill switch and rollback strategy.
- Never assume a webhook can safely undo a change; state when rollback is manual or unavailable.

---

# 12. FEATURE MODULE G — AI SOC ANALYST (OPTIONAL, EVIDENCE-BOUND)

AI should improve clarity and analyst productivity, not invent evidence or autonomously run commands.

### Working without AI

A deterministic explanation engine must generate useful templates based on rule metadata, event fields and investigation playbooks. All key workflows must still work when Ollama/cloud AI is offline.

### Optional providers

- Local Ollama-compatible adapter as first optional integration; no hardcoded model name or requirement to run a local LLM.
- A cloud provider adapter behind explicit opt-in/secret configuration and strict data egress controls; no automatic transmission of raw alerts.
- Provider health/status, model identifier, cost-awareness, timeouts, concurrency limits, retries, fallback mode and per-incident opt-in where appropriate.

### AI-supported user flows

1. Plain-English alert explanation.
2. Evidence-grounded investigation summary.
3. Proposed next read-only investigative steps.
4. Correlate and summarize a bounded set of related events.
5. Generate a concise analyst handoff and case narrative.
6. Draft a response plan requiring analyst approval.
7. Explain MITRE ATT&CK technique relevance with uncertainty.
8. Suggest detection rule improvements as **reviewable proposals**, not automatic changes.
9. Explain why alternative interpretations are plausible.
10. Guide beginners through SOC terminology without fabricating facts.

### AI security requirements

- Prompt injection defense: treat log fields, domain names, alert descriptions and externally fetched intelligence as **untrusted data**. No log content may override instructions or issue tool commands.
- Strict tool registry with fixed allowlisted operations, least-privilege read-only access by default, schema validation and permission checks independent of the model.
- Limit retrieved context, output size, token budget, execution duration and concurrency.
- Show source event IDs for factual statements; distinguish model interpretation from deterministic evidence.
- Block system prompts and secrets from output; redact sensitive fields before optional external provider requests.
- Validate structured outputs with JSON schema; reject unsupported action requests.
- Log model/provider/latency/token or cost estimates, evaluation result and reason for fallback, without storing secrets.
- Offer a clear “AI generated—review before acting” label; explanations are not proof of an incident.

### AI evaluation

Create a fixture-based evaluation harness testing groundedness, hallucinated event IDs, inappropriate certainty, prompt injection resistance, sensitive-data leakage, bad remediation suggestions and failure/fallback behavior. Include test cases where the correct answer is “insufficient evidence.” Measure accuracy and regression, not just model fluency.

---

# 13. FEATURE MODULE H — DETECTION ENGINEERING STUDIO

Build a useful environment for analysts to improve detection quality:

- Rule library with version history, enabled state within AegisSOC, owner and last review.
- Rule tests against seeded positive and negative event fixtures.
- Test report: matches, misses, false positives, event IDs and rule-version fingerprint.
- Replay before/after rule changes and comparison of detection performance.
- ATT&CK technique mapping where defensible; no technique mapping claims without rule evidence.
- Rule-tuning suggestions treated as drafts pending reviewer action.
- Import/export of safe, declared local rule formats; do not import arbitrary executable code.
- Review and approval workflow for changes to production-like detection packs.
- Link detection tests to incidents and postmortem actions.

### Measurable detection quality

Track sensitivity/precision on **labeled test datasets** with clear caveats. Never present a small synthetic test as validated real-world detection effectiveness.

---

# 14. FEATURE MODULE I — THREAT INTELLIGENCE AND CONTEXT

- Local indicator registry: domain, IP, hash, URL, classification, confidence, source, timestamps, expiry and description.
- Show **provenance and freshness** of every indicator. Unknown does not mean safe; reported malicious does not prove local compromise.
- Matching against normalized telemetry with clear limitations and false-positive handling.
- Optional reputation/feed provider interfaces disabled by default; no external requests in core tests.
- Safe link handling: do not automatically fetch suspicious URLs or render untrusted content inline.
- Redaction and canonicalization practices; protect against poisoning, duplicates and stale entries.
- Confidence-aware narrative: explain why an indicator is relevant and when it is not sufficient to conclude a breach.

---

# 15. FEATURE MODULE J — INCIDENT METRICS, REPORTING AND EXECUTIVE VIEW

Create actionable reporting for analysts and nontechnical stakeholders.

- Incident volume, severity breakdown, time-to-triage and time-to-close using accurately defined timestamps.
- Workload and case status, analyst assignments, recurring patterns, data-source health and coverage gaps.
- Detection performance **only** where test labels permit credible calculation.
- SOC operations report, incident postmortem, lab test report and weekly review template.
- One-click drill-down from every key metric to supporting records.
- Export CSV, JSON, Markdown and printable/PDF-ready views where feasible.
- Reports use correct timezone and period boundaries, with export timestamp and data provenance.
- Explain caveats: missing sensor data, fixture data, no live infrastructure, sample size and unknowns.
- Optional “Executive summary” mode avoiding analyst jargon, but never hiding important uncertainty.

---

# 16. FEATURE MODULE K — ALERTING AND NOTIFICATIONS

- In-app notifications for important AegisSOC events, incident assignments, expiring approvals and stale connectors.
- Severity-appropriate notification settings and preference controls.
- Deduplication, rate limiting and alert fatigue safeguards.
- Scheduled summaries within the app; do not require the operating system's real cron service for initial demo.
- Provide optional **disabled** email/Slack/webhook adapter interfaces, with no outbound network calls by default.
- Audit notification delivery attempts and failures only when actual delivery is configured.

---

# 17. FEATURE MODULE L — OPTIONAL CLOUD, AEGISAI AND NETSHIELD INTEGRATIONS

Build **configuration + schema + fixture tests**, not unauthorized live integrations.

### AWS security

- Offline import of representative sample AWS security events/config snapshots, labeled as fixture or manually uploaded.
- Read-only planned connectors for CloudTrail, GuardDuty, Security Hub and IAM posture.
- No live AWS discovery, permission changes, IAM creation, automated remediation, AWS API calls, or charges without approval.

### AegisAI

- Versioned contract for authorized test-run metadata: scenario ID, isolated lab ID, start/end, expected signals, observed signals, false negatives, evidence references, validation outcome.
- Separate `source_type=aegisai` and `synthetic=true` or authorized-test flags as appropriate.
- Use AegisAI results to compare **expected vs observed** AegisSOC detections, not to declare real attack presence.
- Do not alter AegisAI's repository or require a running AegisAI service.

### NetShield

- Optional authenticated import contract for consented, normalized network alerts and device findings.
- Respect NetShield's household privacy boundaries and data minimization.
- Do not collect household browsing content or identify people without a clear user authorization model.
- Do not require NetShield for core SOC functionality.

---

# 18. FRONTEND EXPERIENCE — REQUIRED COMPLETE USER JOURNEYS

Implement at least the following interactive flows and verify them end-to-end:

## Journey 1: First run, no integrations

1. User launches Docker Compose / local development app.
2. AegisSOC checks local services and shows **Demo Mode**.
3. Guided onboarding explains the product and the demo limitations.
4. User runs a labeled sample ingestion.
5. Dashboard displays actual ingested fixture event counts, recent ingest time, and resulting detection output.
6. User inspects an alert and sees the exact underlying events.

## Journey 2: Triage → case → closure

1. User filters the alert queue.
2. Opens a suspicious-authentication alert.
3. Views timeline and evidence, reviews rule logic and confidence.
4. Assigns or acknowledges the alert.
5. Creates incident, adds notes and review tasks.
6. Chooses an appropriate resolution for the **synthetic test case**.
7. Closes and then reopens the case, with audit history.
8. Exports a report tied to the actual stored records.

## Journey 3: Detection improvement

1. Select a built-in test rule.
2. Run its labeled positive/negative fixtures.
3. Show matches, false positives and missed cases.
4. Edit an allowed parameter in a new draft rule version.
5. Rerun the same fixture suite.
6. Compare measured results, approve and save the local rule version.
7. Do not imply the revised rule has been deployed to Wazuh/Suricata.

## Journey 4: Source failure and recovery

1. Simulate an ingestion/parser failure.
2. Dashboard clearly shows the affected source as stale or failed.
3. User opens the troubleshooting view and sees a clear, useful error.
4. User fixes a fixture input or retries safely.
5. Status returns to healthy **only after a successful test ingestion**.

## Journey 5: AI optionality

1. With no AI provider configured, user receives a deterministic evidence-backed explanation.
2. An opt-in AI configuration screen explains privacy, resources and permissions.
3. AI adapter tests use a mock provider without sending real data.
4. On timeout, malformed output, hallucinated IDs or prompt injection test input, the application falls back safely.
5. AI content is visibly marked interpretation and references available evidence.

## Journey 6: Response approval

1. From an incident, user drafts a response plan.
2. Backend creates a scoped proposal in **simulation mode**.
3. Authorized approver reviews impact, duration and rollback guidance.
4. Approval/rejection is persisted and audited.
5. The UI **never** claims a real endpoint was quarantined when it only approved a simulated proposal.

## Journey 7: Threat hunt and reporting

1. User starts from an event/host/account.
2. Pivots into nearby timeline records.
3. Saves a constrained search and a short hunt notebook.
4. Links evidence to a case.
5. Exports a scope-bounded report with links/references and appropriate redaction.

Ensure each journey has good empty/loading/error states, keyboard access and automated end-to-end coverage.

---

# 19. DATA MODEL AND API CONTRACTS

Implement a thoughtful relational model with migrations and indexes. Candidate entities:

- `users`, `roles`, `user_roles`, `sessions` (or equivalent secure auth storage)
- `data_sources`, `source_health_checks`, `ingestion_runs`, `ingestion_checkpoints`
- `raw_events`, `normalized_events`, `event_entities`, `assets`, `asset_source_coverage`
- `detection_rules`, `rule_versions`, `rule_test_runs`, `rule_test_results`
- `alerts`, `alert_evidence_links`, `alert_status_history`
- `incidents`, `incident_alert_links`, `incident_evidence`, `incident_notes`, `incident_tasks`, `incident_activity`
- `hunt_queries`, `hunt_notebooks`, `threat_indicators`
- `response_proposals`, `response_approvals`, `response_simulations`, `verification_results`
- `ai_analysis_runs`, `ai_evaluations`, `report_exports`, `notifications`
- `audit_events`, `system_settings` and retention policies

Use the **smallest reliable set** of tables for the phase. Do not invent complicated schema merely for completeness. Include stable IDs, tenant/owner scope if needed, created/updated timestamps, foreign keys, unique constraints and cascade behavior designed to preserve audit/evidence.

### API quality requirements

- OpenAPI docs for implemented routes.
- DTO and domain model separation; validation at API boundaries.
- Pagination and bounded search; avoid unbounded table scans.
- Correct status codes, structured error responses and correlation IDs.
- Authorization on *every* data access and mutation, not only routes.
- Avoid mass assignment, IDOR, injection, SSRF and sensitive-data leakage.
- Source/evidence authenticity and synthetic status carried through transformations.
- Idempotent ingestion and replay controls.
- Versioned contracts for external integrations.
- Content security policy and safe rendering of logs; NEVER render raw alert contents as HTML without proper escaping.

---

# 20. SECURITY, PRIVACY AND THREAT MODEL

Include a written threat model with assets, trust boundaries, threats and mitigations for:

- Untrusted log messages that include HTML, code, shell commands or malicious instructions.
- Authentication/session theft, insecure defaults and privilege escalation.
- Unauthorized case access or cross-user access.
- Sensitive hostnames, credentials, identifiers and local IP information in exports.
- Prompt injection delivered through event text to AI tools.
- Exfiltration through cloud model adapters, debug logs or unbounded outbound webhooks.
- Malicious file imports, decompression bombs and oversize datasets.
- DOS risks from event floods, regex, nested JSON and expensive searches.
- Loss/corruption of incident evidence and spoofed audit trails.
- Vulnerable packages, dependency risk and Docker volume/permission misconfiguration.
- Accidental exposure of admin ports or secrets to the home LAN/Internet.

### Concrete controls

- Default services bind to loopback in local development where supported; no unnecessary `0.0.0.0` published ports.
- No production credentials committed; provide `.env.example`, secure secret guidance and sample-only configs.
- Never log secrets. Redact sensitive values and provide privacy-aware exports.
- RBAC: Viewer, Analyst, Incident Lead, Detection Engineer, Administrator (or a well-justified minimal equivalent).
- Approval separation for sensitive actions; immutable-by-app audit and tamper-evident export design where feasible.
- Rate limits, request-size limits, file validation and payload quotas.
- Secure headers, origin controls, safe dependency choices and accessibility.
- Retention and deletion policies suitable for personal home-lab data, with meaningful caveats around auditing.
- Strict serialization and schema validation at AI/model and integration boundaries.
- Include tests for XSS in log details, permission bypass, illegal state transitions, duplicate events, prompt injection, excessive searches, and unsafe response actions.

Do not market AegisSOC as compliant with any standard unless actual compliance has been independently evaluated.

---

# 21. RUNTIME AND RESOURCE MANAGEMENT

This application may run alongside other projects on constrained existing hardware. Optimize for a modest dev machine; do not assume a full ELK/OpenSearch/ClickHouse/Kafka cluster is available.

Requirements:

1. Minimal local profile: API + PostgreSQL + frontend + fixture generator, no external Wazuh/Ollama required.
2. Optional `ai` profile and optional integration profiles that do not auto-start.
3. Resource limits and bounded worker concurrency suitable for a shared 32 GB host; document actual test usage instead of claiming exact limits that were never measured.
4. Configurable retention and sampling, with defensible warnings about the impact on investigations.
5. Startup health checks, graceful shutdown, crash-safe ingestion and no destructive first-run migrations.
6. Developer seed reset must affect only the explicitly scoped **development** database and ask/require a special flag for destructive operations.
7. No constant polling of a GPU desktop or offline home server.
8. Treat logs/AI data as potentially sensitive: avoid automatic uploads or telemetry to third parties.
9. Benchmark fixture ingestion, UI response time, and approximate memory/disk behavior on the actual available environment when possible; otherwise record “not measured.”

---

# 22. AUTONOMOUS DEVELOPMENT PROCESS

Use a staged process but **continue coding throughout**. Write a short plan, implement a thin vertical slice, test it, then expand. Never spend the entire session creating documents.

### Preliminary repository audit (do before implementation)

- `pwd`, list files, inspect relevant README/docs, verify Git status, inspect existing build tools and tests.
- Identify and preserve pre-existing Wazuh/Suricata/AI integrations without assuming correctness.
- Capture current status and do not overwrite unrelated work.
- If empty repo, create the minimal working monorepo from scratch.
- Prefer existing conventions if high quality; propose justified changes in `docs/ai/DECISIONS.md`.

### Durable project management files

Create or update:

```text
README.md
CLAUDE.md
.env.example
docs/ai/PROJECT_STATUS.md
docs/ai/TASK_BOARD.md
docs/ai/DECISIONS.md
docs/ai/HANDOFF.md
docs/ai/FEATURE_MATRIX.md
docs/architecture/SYSTEM_OVERVIEW.md
docs/architecture/DATA_MODEL.md
docs/security/THREAT_MODEL.md
docs/security/SAFETY_BOUNDARIES.md
docs/runbooks/LOCAL_SETUP.md
docs/runbooks/DEMO_SCENARIOS.md
docs/runbooks/INCIDENT_RESPONSE.md
docs/evidence/TEST_RESULTS.md
```

Use a concise consistent feature-status vocabulary:

- **Implemented and tested** — feature executes; include test/evidence reference.
- **Implemented, not verified** — code exists; no passing execution evidence.
- **Partial** — important functionality missing.
- **Scaffold only** — UI/API shell, no real outcome.
- **Planned** — not implemented.
- **Blocked** — dependency or approval needed; identify it.

Never equate passing TypeScript compilation or a visually convincing screen with feature completion.

### Work loop

1. Choose the highest-value unblocked feature.
2. State expected acceptance criteria briefly in the task board.
3. Implement frontend, backend, DB, error handling and tests for that feature.
4. Run the relevant tests and inspect actual output.
5. Fix failures; do not delete failing tests merely to obtain green CI.
6. Capture evidence, caveats, resource usage or remaining gap.
7. Update the status ledger and handoff.
8. Move to the next unblocked feature without asking the user for routine design choices.

Do not spend the user's tokens asking about typography, icon preferences or trivial implementation decisions. Make coherent choices and document them. Ask only when an approval, live credentials, external connection, destructive change, payment, major architectural conflict, or material ambiguity truly requires user input.

### Model and effort conservation

You are running under Claude Code. Choose an included/low-cost capable model for routine tasks when model switching is available. Use medium reasoning for ordinary app code, tests, UI and documentation. Escalate to a more capable/high-effort model only for complex threat model changes, auth, AI/tool boundaries, tricky correlation algorithms, irreversible migrations or critical security reviews. Reuse project documents to avoid repeated full-repository rereads and large redundant context.

---

# 23. PHASED IMPLEMENTATION ROADMAP — COMPLETE WHAT IS POSSIBLE

## Phase 0 — Evidence-based audit, safety, and architecture

Deliver:
- Repo audit, status snapshot, protected Git branch.
- Architecture and threat model.
- Documentation/acceptance framework.
- Scoped local development configuration.

Exit criteria: development boundaries are explicit; existing work preserved; next tasks clear.

## Phase 1 — Working core application

Build:
- React branded shell, navigation, design tokens, light/dark mode.
- Spring Boot API, PostgreSQL, Flyway, validation, error handling.
- Local auth and role checks.
- Docker Compose for local development.
- Health/ready endpoints, seed fixture engine, test CI.

Exit criteria: fresh clone runs locally, user can sign in through a safe development setup, API and frontend tests pass.

## Phase 2 — End-to-end telemetry and first usable SOC workflow

Build:
- Synthetic fixture generators with provenance and repeatable seeds.
- Ingestion runs, normalized events, source health and bounded event search.
- Initial deterministic rules, alert queue and evidence detail pages.
- Dashboard using actual DB-backed fixture results.
- Responsive onboarding and friendly terminology.

Exit criteria: fixture → ingest → normalize → detect → visible evidence-backed alert, tested end-to-end.

## Phase 3 — Incident response management and evidence

Build:
- Case/incident lifecycle, ownership, comments/tasks and event timeline.
- Audit trail, evidence links, exportable report.
- Alert-to-case workflow and reopen/close validation.

Exit criteria: an analyst can manage a synthetic incident from triage to resolution with full traceability.

## Phase 4 — Detection engineering, hunting, and coverage

Build:
- Saved searches, entity pivots, hunt notebooks.
- Rule lifecycle with replay and regression testing.
- Assets/telemetry coverage and staleness reporting.
- Noise reduction and safe suppression with expiry.

Exit criteria: rule effectiveness and data coverage are measurable on labeled fixtures.

## Phase 5 — AI-assisted SOC, safely optional

Build:
- Deterministic analyst explanations.
- Optional Ollama-compatible AI adapter and mock provider.
- Evidence-grounded summaries, AI guardrails, evaluation suite.
- Safe fallback when model unavailable or untrusted.

Exit criteria: core app fully works without AI; AI does not invent event evidence or execute unauthorized actions.

## Phase 6 — Response planning, reporting, and UX refinement

Build:
- Response proposals, scope and approval workflow, simulation and verification record.
- Executive/analyst reports, metrics and export controls.
- Production-quality responsive experience, accessibility remediation and honest status labeling.

Exit criteria: user can propose/review/approve a simulated response and verify/document outcomes without changing real systems.

## Phase 7 — Optional integrations and operational hardening

Build:
- Tested Wazuh adapter mocks/fixture contract, Suricata EVE import.
- Optional AegisAI and NetShield event-contract tests.
- AWS/cloud fixture import and documented read-only future adapters.
- Performance, data-retention, export/privacy and backup/restore **for development database**.

Exit criteria: documented connector readiness with no unauthorized real-system connection.

## Phase 8 — Full release candidate and portfolio-quality proof

Build:
- Complete marketing website and clear documentation.
- Polished main user journeys, demo walkthrough and screenshots.
- CI matrix, accessibility/functional tests, dependency checks and threat model review.
- Honest implementation/known-limitations matrix and final handoff.

Exit criteria: a reviewer can clone, start, complete core workflows, view actual evidence and understand precisely what's implemented.

**Do not interpret phases as permission to stop after Phase 0 or a single page.** Work continuously through every phase that can be completed within authorized local access, and document any unfinished work transparently.

---

# 24. QUALITY GATES AND ACCEPTANCE TESTS

Before declaring completion, run and document:

### Backend
- All unit and integration tests pass.
- Migration from a fresh DB and upgrade from earlier app schema are tested.
- Rules, dedupe, bounded ingestion, case state transitions, access controls and report generation have tests.
- No critical unauthenticated endpoints or IDOR problems.

### Frontend
- Type checking, lint and frontend unit/component tests pass.
- Primary journeys tested in Playwright or equivalent browser automation.
- Responsive review at representative phone, tablet and desktop widths.
- Keyboard navigation, focus management, modal semantics and accessible labels audited.
- Correct empty/error/offline/permission states; charts have textual alternatives.

### End-to-end
- Fresh local install from the documented steps.
- Deterministic fixture ingest produces predictable event and alert counts.
- Incident created, assigned, documented and closed with supporting evidence.
- Detection test run shows reproducible positive/negative outcomes.
- A missing source and an unavailable LLM fail gracefully.
- Reports are generated from stored records and indicate synthetic provenance.
- High-risk response actions remain disabled without authorization.

### Performance
- Record startup time, representative event throughput/latency and memory/disk usage when measurable.
- Surface unknown measurements rather than fabricating numbers.
- Demonstrate bounded pagination, import size controls and retention behavior.

### Security tests
- Untrusted log text is HTML-escaped and cannot trigger tool execution.
- Role bypass, forged approval and illegal incident transitions are rejected.
- AI prompt-injection test cases do not invoke any unauthorized action.
- External providers and live connectors are disabled by default.
- No secrets are committed; local developer service exposure is restricted.

### Evidence files

Add concise test output summaries, commands, exact dates, pass/fail counts, unexpected limitations and remaining risk to `docs/evidence/TEST_RESULTS.md`. Do not say “all tests pass” if some were skipped, unable to run or not implemented.

---

# 25. DELIVERABLES

Produce, as applicable:

1. Working AegisSOC React web frontend and public product pages.
2. Spring Boot REST backend with auth/authorization and validated API.
3. PostgreSQL migrations and realistic labeled seed data.
4. Fixture telemetry generator, safe ingestion adapters, normalized events and search.
5. Deterministic detection engine, correlation and alert workflow.
6. Case management, investigation timelines, evidence links and reports.
7. Threat hunting, asset coverage and detection engineering studio.
8. Response proposal/approval workflow in safe simulation mode.
9. Optional AI analyst adapter, fallback and evaluation harness.
10. Optional read-only Wazuh, Suricata, AegisAI, NetShield and cloud adapter interfaces plus tests.
11. Production-quality UI/UX, light/dark mode, responsive layouts, accessibility tests.
12. Docker Compose local developer environment, startup scripts, CI and test suites.
13. Architecture, security, runbook, user documentation, release notes and honest feature matrix.
14. Repeatable portfolio demos with recorded evidence and known limitations.

Aim for **quality and completeness of the critical vertical slices**, not a high count of empty menu items.

---

# 26. USER INVOLVEMENT: WHAT REQUIRES A QUESTION VS WHAT DOESN'T

**Do without asking:** routine component choices, color and layout design, schema implementation, local development config, creating fixture generators, writing tests/docs, building UI, API contracts and migration plans, safe refactoring within the project, local test runs, addressing type/lint failures, and creating non-destructive fixture-based demos.

**Ask first:** real SOC server access, connecting agents, live Wazuh/Suricata integrations, consuming real household logs, connecting AWS, exposing a service beyond loopback, production deployment, subscriptions, external LLM data sharing, real incident-response actions, destructive local data operations, push to GitHub, or changes to the home network/infrastructure.

When outside approval is missing, continue building mocked/fixture-based integrations. Do **not** fabricate a successful live connection or silently attempt one.

---

# 27. FIRST TASKS — BEGIN CODING IMMEDIATELY

When you finish reading this prompt:

1. Print a concise repo audit and identify existing files, build setup, branch and uncommitted work.
2. Create/update the minimal durable progress files and document the precise first vertical slice.
3. Implement and launch the **AegisSOC local stack** with Spring Boot, PostgreSQL, and React, using the existing repo layout where appropriate.
4. Add a **working synthetic event replay** that persists to the DB.
5. Implement one **real rule** that generates a traceable alert from that replay.
6. Create an excellent dashboard and alert-detail flow backed by the real local API.
7. Demonstrate **alert → incident → evidence → report** with tests.
8. Keep progressing through every next safe, unblocked phase.

Do not stop at “Here is the plan.” **Build the code.**

### Required handoff after each development session

Summarize:
- **Implemented and verified** (with commands and tests).
- **Implemented but unverified**.
- **Planned or blocked** (with reasons and explicit approvals needed).
- **Any changes to dependencies and runtime footprint**.
- **Current git branch and local commits** (never claim remote push unless done with authorization).
- **Exactly what to do next** so another Claude Code session can resume without repeating analysis.

**Success means AegisSOC is a working, transparent defensive operations product—not just a portfolio screenshot.**
