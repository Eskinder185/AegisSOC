# Test results – 2026-11-05 (Windows 11, JDK 25.0.5, Node 22.18, Docker Desktop, Postgres 16 container)

| Suite | Command | Result |
|---|---|---|
| Backend unit + integration (Testcontainers Postgres) | `mvn -f apps/api/pom.xml test` | **58 passed, 0 failed, 0 skipped** in one clean run (RuleSuiteTest 8, PipelineIT 8, WorkflowIT 7, SecurityAndSafetyIT 14, DetectionEngineeringIT 9, AiIT 10, ReportsIT 2) |
| Frontend unit | `npm test` (apps/web) | 7 passed |
| Frontend typecheck | `npx tsc --noEmit` | clean (strict) |
| Production build | `vite build` | ok; main bundle 274 kB (85 kB gzip) |
| End-to-end (Playwright, Chromium, real API + DB) | `npx playwright test journeys.spec.ts` | **16 passed**: journeys 1–7, viewer permissions, phone drawer/no overflow, axe WCAG 2.2 A/AA on /login, /app, /alerts, /hunt, /detections, /response, /reports with zero serious/critical violations |
| Dependency audit (web) | `npm audit` | 10 moderate, all in dev-only ESLint/minimatch chain (not shipped). Backend dependency scan **not run**. |

## What these results do and do not show
- Detection results are on a small hand-labelled **synthetic** suite: 0 false positives and 0 misses for all 9 rules. This is a regression check, not real-world effectiveness.
- Deterministic fixture ingest produces predictable counts (e.g. 28 events/1 alert for `credential_attack`; 12 alerts for the six detection scenarios).
- Security tests cover: unauthenticated access, CSRF, lockout, role bypass, HTML/formula injection, oversize and deeply nested input, SQL-injection-shaped filters, audit tampering, disabled connectors, illegal state transitions, forged/self approval, prompt injection and hostile model output.
- Not done: load/benchmark measurements (**not measured**), memory/disk footprint, manual screen-reader and keyboard audit, Docker image builds, CI on GitHub, upgrade-migration test (only a fresh-DB migration is exercised).
- Observed during e2e: an unrelated app already owned port 5173, so the dev UI uses 5180.

## UX tranche 1 (2026-11-05): palette, shortcuts, saved views, collapsible sidebar
| Suite | Command | Result |
|---|---|---|
| End-to-end (all specs) | `npx playwright test` (apps/web, real API + DB) | **23 passed**: the 16 earlier journeys plus 6 in `productivity.spec.ts` (palette navigation and real alert search, palette axe scan, `g`-chord shortcuts and help dialog, j/k/x/Enter triage, saved views, sidebar collapse persistence) and the screenshot harness |
| Frontend unit / typecheck / build | `npm test`, `npx tsc --noEmit`, `npm run build` | 7 passed / clean / ok |
Backend was not changed in this tranche, so the 58-test backend run above was not repeated.

## Redesign tranche 1 (2026-11-05): design tokens, landing + 3D hero, Topology Explorer
| Suite | Command | Result |
|---|---|---|
| End-to-end (all specs) | `npx playwright test` (apps/web, real API + DB) | **27 passed**: prior 23 (axe scans re-run under the new dark default) + topology empty state / real hosts / table alternative / deep link, topology axe scan, landing phone no-overflow, landing screenshots |
| Unit / typecheck / build | `npm test`, `npx tsc --noEmit`, `npm run build` | 7 passed / clean / ok. App bundle 283 kB (88 kB gzip); the 3D chunk (922 kB, 244 kB gzip) loads only on the landing page |
Visual review so far: dark desktop landing + hero (1440), phone landing hero (375), topology (1360). Light theme, 768 px and 1920 px were **not** reviewed. 3D performance on real mobile hardware is **not measured**.

## Storytelling redesign (2026-11-05)
| Suite | Command | Result |
|---|---|---|
| End-to-end (all specs) | `npx playwright test` (apps/web, real API + DB) | **46 passed** on the final run: prior 27 + 20 in `story.spec.ts` (3D default, step controls, autoplay and pause, every object and connection explains itself, Analyst/Basic modes, 2D diagram by keyboard, four scenarios with arrow-key tabs, glossary, capability wording, axe in dark and light, no-WebGL fallback, reduced motion, no horizontal overflow at 375/768/1280/1920, phone default). (Count includes the screenshot harness.) |
| Unit / typecheck / build | `npm test`, `npx tsc --noEmit`, `npm run build` | 7 passed / clean / ok. App bundle 316 kB (98 kB gzip); StoryScene chunk 967 kB (256 kB gzip), homepage only |
**Flakiness, not explained:** two earlier full runs each had one failure (Journey 5, then the topology test) that did not reproduce in four re-runs; the final full run was 46/46. The failing runs' artifacts were overwritten. Likely load-related timing (software WebGL on the test machine) but this is a guess.
Visual review done at 1920/1440/1280/768/375 (dark), every story step, explore mode, selected-object panel, Analyst mode, scenarios, and light theme step 3. Real-device 3D performance is **not measured**.
