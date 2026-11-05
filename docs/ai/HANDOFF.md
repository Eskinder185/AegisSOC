# Handoff

## Implemented and verified
Full local stack (Spring Boot + PostgreSQL + React): 58 backend tests, 7 web unit tests, 16 Playwright tests (7 journeys, a11y, phone). Commands in README / TEST_RESULTS.

## Implemented but unverified
Ollama adapter; paced replay; Dockerfiles and compose `app` profile; GitHub Actions workflow; CSV/MD exports opened in other tools.

## Planned / blocked (needs the user)
- Wazuh/Suricata live feeds, AegisAI, NetShield, AWS contracts: not started; any live connection needs explicit approval, credentials and a target allowlist.
- Push/deploy: needs approval. Remote CI never ran.

## Environment changes
Portable JDKs 21 and 25 in `.tools/` (gitignored; `pom.xml` targets 25, changed externally from 21 during the session and kept). Playwright Chromium downloaded. Docker Desktop was started; compose project `aegissoc` (DB volume `aegissoc_aegis_pgdata`). Unrelated services on 5432 and 5173 were left untouched; AegisSOC uses 5433/8080/5180.

## Next steps
1. Add ESLint config; run `npm audit` / OWASP dependency check on the API.
2. Build + smoke-test the Docker images (`docker compose --profile app up --build`).
3. Wazuh read-only adapter against a recorded fixture contract, then (with approval) a real read-only test.
4. Notifications for stale sources / expiring approvals; coverage trend; unmerge UI.
5. Benchmark ingest throughput and memory; record in TEST_RESULTS.
6. Review the diff, then decide whether to push.
