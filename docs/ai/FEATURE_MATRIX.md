# Feature matrix (honest status)

Vocabulary: **Implemented and tested** · **Implemented, not verified** · **Partial** · **Scaffold only** · **Planned** · **Blocked**.
Evidence is in `docs/evidence/TEST_RESULTS.md` (dated 2026-11-05).

| Area | Status | Notes / evidence |
|---|---|---|
| Auth (sessions, CSRF, lockout, 5 roles, hierarchy) | Implemented and tested | SecurityAndSafetyIT |
| Audit log with hash chain + verify | Implemented and tested | tamper test in SecurityAndSafetyIT |
| Synthetic fixture generator (7 scenarios, seeded, deterministic) | Implemented and tested | RuleSuiteTest, PipelineIT |
| Normalizer: linux_auth, windows_event, Suricata EVE, generic JSON | Implemented and tested | EVE import test; Windows/Linux via fixtures |
| Ingestion: dedupe, row errors, size/depth limits, source health | Implemented and tested | PipelineIT, SecurityAndSafetyIT, Journey 4 |
| Paced (async) replay + cancel | Implemented, not verified | no automated test of paced mode |
| Rule engine (match/threshold/sequence/absence/indicator), closed DSL, no regex | Implemented and tested | 9 built-in rules, labelled suite 0 FP / 0 FN |
| Alerts: lifecycle, suppression with expiry, bulk safeguards, evidence | Implemented and tested | WorkflowIT, DetectionEngineeringIT |
| Cases: stages, tasks, notes, merge, post-incident review, redacted MD/JSON report | Implemented and tested | WorkflowIT; merge has no UI and no unmerge |
| Hunt: bounded search, facets, pivot, saved searches, notebooks, CSV export | Implemented and tested | DetectionEngineeringIT |
| Assets & coverage matrix | Implemented and tested | trend over time **Planned** |
| Detection studio: drafts, labelled tests, compare, 2-person approval | Implemented and tested | Journey 3; local only, not deployed anywhere |
| Threat-intel registry (validated, inert, allowlist) | Implemented and tested | matching via AEG-TI-001 |
| Response center (simulation, scope allowlist, approval, attest, measured check) | Implemented and tested | WorkflowIT; execution connectors **do not exist** |
| AI: deterministic explainers (8 tasks) | Implemented and tested | AiIT |
| AI: guard rails, mock provider, evaluation harness (11 cases) | Implemented and tested | AiIT |
| AI: Ollama adapter (loopback only) | Implemented, not verified | never run against a real model |
| AI: cloud provider | Planned | intentionally absent |
| Metrics/reports (MD/CSV/JSON, executive wording) | Implemented and tested | ReportsIT; PDF **Planned** |
| In-app notifications | Partial | alerts only; stale-source/approval-expiry/assignment notifications **Planned** |
| Frontend: 14 pages, light/dark, responsive, a11y | Implemented and tested | 16 Playwright tests, axe WCAG 2.2 AA on 7 pages (serious/critical = 0) |
| Wazuh adapter | **Planned** | only a disabled registry card; not coded |
| AegisAI / NetShield / AWS contracts | **Planned** | disabled cards only; no schemas yet |
| Syslog ingestion | **Planned** | |
| Docker images + compose `app` profile | Implemented, not verified | `docker compose up -d db` verified; image builds not run |
| GitHub Actions CI | Implemented, not verified | never executed (nothing pushed) |
| ESLint | Not configured | tsc strict used instead |
| Performance benchmarks | Not measured | see TEST_RESULTS |
| Keyboard-only/screen-reader manual audit | Not done | automated axe only |
