# Safety boundaries (enforced in code)

1. **No live connectors.** Wazuh, AegisAI, NetShield and cloud sources are registry rows, `enabled=false`. `PATCH` cannot enable Wazuh (409); `POST /api/sources/{id}/test` never opens a network connection (`networkAttempted:false`). Tested.
2. **No real-world response.** `ResponsePolicy` is simulation-only; no execution code exists. Approval records a decision only; manual work is "user-attested"; only a measured telemetry check can unlock CONTAINED. Targets must already appear in the incident's evidence. Tested.
3. **Separation of duties** enforced server-side: approver ≠ requester, rule approver ≠ author, rule approval requires a test run on the exact fingerprint.
4. **AI is opt-in three ways** (operator env, admin switch, per-request), loopback-only, tool-less, validated (cited event ids must exist, no certainty/action/secret/unsafe-step text), with deterministic fallback.
5. **Untrusted data**: log text is stored verbatim, returned as JSON, rendered as React text; reports escape markup; CSV neutralises formulas; JSON input has depth/length limits; the rule DSL is a closed schema with no regex.
6. **Destructive operations** (`dev/reset`, retention) need ADMIN plus an explicit `X-Confirm` header; retention never deletes cited evidence.
7. Services bind to loopback; compose publishes `127.0.0.1` only; no default passwords (random `.env` secret).
8. Nothing is pushed or deployed. Work is on local branch `dev/initial-build`.
