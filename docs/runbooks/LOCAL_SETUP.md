# Local setup
Prereqs: Docker, JDK 25 (or `.tools/jdk25`), Node 22, Maven 3.8+.
1. `sh tooling/scripts/init-env.sh` (Windows: `tooling/scripts/init-env.ps1`) → `.env` with random secrets (never commit).
2. `docker compose up -d db` → PostgreSQL on 127.0.0.1:5433.
3. API: `cd apps/api && mvn -DskipTests package`, then load `.env` and run `java -jar target/aegissoc-api-0.1.0.jar` with `SPRING_DATASOURCE_PASSWORD=$AEGIS_DB_PASSWORD`. Flyway migrates on start; users/rules/sources are seeded; users get `AEGIS_DEV_PASSWORD` (or a random one logged once).
4. Web: `cd apps/web && npm ci && npm run dev` → http://127.0.0.1:5180 (proxies /api to 8080).
5. Tests: `mvn -f apps/api/pom.xml test` (needs Docker); `npm test`; `npx playwright install chromium && npx playwright test` (API + DB running).
6. Reset demo data: Settings → Data & privacy → Development reset (admin) or `POST /api/admin/dev/reset` with `X-Confirm: DELETE-DEV-DATA`.
Optional AI: set `AEGIS_AI_PROVIDER=mock` (demo guard rails) or `ollama` + `AEGIS_AI_MODEL`, then enable under AI analyst. Off by default.
API docs: http://127.0.0.1:8080/swagger-ui.html (loopback only).
