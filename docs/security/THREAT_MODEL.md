# Threat model (summary)

Assets: stored telemetry, cases/evidence, audit log, credentials, rule set. Trust boundaries: browser↔API (session+CSRF), API↔DB, API↔optional local model, ingest inputs (untrusted), operator host.

| Threat | Mitigation | Test |
|---|---|---|
| HTML/script in log fields | stored as data; JSON responses + nosniff; React text rendering; report escaping; CSP | SecurityAndSafetyIT, WorkflowIT |
| Session theft / CSRF / brute force | HttpOnly SameSite=Strict cookie, CSRF cookie+header, 5-try lockout, bcrypt | SecurityAndSafetyIT |
| Privilege escalation / IDOR | `@PreAuthorize` + service checks, role hierarchy, owner-only deletes | role bypass test |
| Sensitive data in exports | redaction default on, audit entry, hashes | WorkflowIT, csv test |
| Prompt injection via events | untrusted-data framing, no tools, output validator, injection warnings | AiIT |
| Exfiltration via AI | loopback-only provider, no cloud adapter | code review |
| Malicious/oversized imports | 2 MB, 5,000 events, depth 12, extension allowlist | SecurityAndSafetyIT |
| DoS: floods, regex, expensive search | no regex in DSL, bounded pagination/ranges, 15 s statement timeout, 1 AI call at a time | partial (no load test) |
| Evidence/audit tampering | raw payload SHA-256, append-only convention, hash-chained audit with verify | tamper test |
| Vulnerable dependencies | lockfile, audit | web audited; backend not scanned |
| Exposed ports | loopback binds | config review |

Residual risks: DB-level superuser can still rewrite rows (hash chain detects, not prevents); in-memory login throttle resets on restart; no TLS (loopback dev only); springdoc docs endpoint is unauthenticated (non-sensitive, loopback).
