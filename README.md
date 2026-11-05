# AegisSOC

A locally runnable, AI-assisted **security operations platform**: ingest permitted telemetry, detect with transparent rules, investigate and manage cases, plan *simulated* responses, and improve detections, with AI that assists but never decides.

> **Honest status:** everything runs on **synthetic, labelled demo data** or local files. No live Wazuh/Suricata/cloud connector exists or has ever been contacted, and AegisSOC can never change a real system. See [docs/ai/FEATURE_MATRIX.md](docs/ai/FEATURE_MATRIX.md) for exactly what is implemented and tested.

## Quick start (Windows/macOS/Linux; needs Docker, JDK 25, Node 22)
```bash
sh tooling/scripts/init-env.sh          # or tooling/scripts/init-env.ps1 – creates .env with random local secrets
docker compose up -d db                 # PostgreSQL on 127.0.0.1:5433
cd apps/api && mvn -DskipTests package && cd ../..
set -a; . ./.env; set +a; SPRING_DATASOURCE_PASSWORD=$AEGIS_DB_PASSWORD java -jar apps/api/target/aegissoc-api-0.1.0.jar &
cd apps/web && npm ci && npm run dev    # http://127.0.0.1:5180
```
Sign in as `admin`, `lead`, `analyst`, `engineer` or `viewer` with `AEGIS_DEV_PASSWORD` from `.env`, then press **Run safe demo**. Details: [docs/runbooks/LOCAL_SETUP.md](docs/runbooks/LOCAL_SETUP.md).

## Layout
`apps/api` Spring Boot 3.5 / Java 25 · `apps/web` React + TypeScript + Tailwind · `docs/` status, architecture, security, runbooks, evidence · `tooling/` scripts · `infra/` reserved.

## Tests
`mvn -f apps/api/pom.xml test` (unit + Testcontainers integration) · `npm test` and `npx playwright test` in `apps/web`. Results: [docs/evidence/TEST_RESULTS.md](docs/evidence/TEST_RESULTS.md).
