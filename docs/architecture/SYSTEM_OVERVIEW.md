# System overview
React SPA ⇄ (same-origin proxy) Spring Boot API ⇄ PostgreSQL. Optional: loopback Ollama.

Packages (`io.aegissoc`): `auth` `audit` `config` `common` · `ingest` (fixtures, normalizer, ingestion, sources) · `detect` (DSL, engine, store, service, tests, explanations) · `alerts` · `incidents` (+reports, redaction) · `hunt` · `assets` · `intel` · `response` (policy) · `ai` (provider, guard, service) · `reports` (overview, metrics) · `admin` (seed, audit, retention, reset).

Data path: fixture/EVE/JSON → normalize+validate → raw (immutable) + normalized (deduped) → rules over run + 1 h look-back → alerts with evidence links and stored explanation → cases → reports. AI sits beside this path, never in it; failures fall back deterministically.
Single-node, no queue/search cluster: bounded chunked ingestion, indexed Postgres search, 15 s statement timeout.
