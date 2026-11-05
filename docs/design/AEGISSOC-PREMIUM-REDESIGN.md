# AegisSOC premium redesign: audit, plan and status

Status is evidence-based. "Done" means built and covered by a passing run recorded in `docs/evidence/TEST_RESULTS.md`. Screenshots were captured with Playwright/Chromium against the real API.

## 1. Audit of the previous interface (2026-11-05)
Captured: landing, overview (empty, demo, dark, phone), alerts, alert detail, hunt, coverage, rule detail.

| Area | Finding |
|---|---|
| Typography | System font stack only; no hierarchy beyond size. Numbers not tabular. |
| Colour | Light-first, flat teal; every surface identical white/navy. Dark theme was an afterthought. |
| Components | One `.card` used for everything: metrics, lists, tables, empty states. No distinction between a panel, a well and a page region. |
| Landing page | Stock "features card grid + numbered cards"; no product visual, no hero, no integration honesty beyond prose. |
| Data visualisation | One bar chart on the overview; no topology, no flow, no timeline playback. |
| Navigation | Worked, but no search, shortcuts or collapse (addressed in the previous tranche). |
| Data density | Overview is a long scroll of equal-weight cards; priority is not visually distinct from information. |
| Nonfunctional controls | None found; every control calls the API or navigates. |
| Accessibility | Good baseline (axe clean on 7 pages). |

## 2. Information architecture (target)
Work (Overview, Alerts, Cases) · Investigate (Hunt, Assets & coverage, **Topology**, Threat intel, AI analyst) · Act (Response) · Improve (Detections, Reports) · Platform (Data sources, Lab, Settings). Public site: single page with Platform, Pipeline, Integrations, Trust and Docs sections.

## 3. Design system (implemented in `src/styles/index.css`)
- Fonts: Inter Variable and JetBrains Mono Variable (SIL OFL, bundled via Fontsource, no CDN).
- Dark-first midnight/titanium palette with a cyan accent; light theme retained. Severity colours unchanged and never the only signal (icon + text on every badge).
- Surfaces: `.card` (gradient panel), `.well` (flat region), `.glass` (overlay panels), `.eyebrow`, `.stat-num`, `.display`, `.rise` entrance motion (disabled by the reduced-motion rule).
- Tokens remain CSS variables, so the whole app inherits the change.

## 4. Done in this tranche
1. **Design tokens, fonts, dark default** across the whole app.
2. **Public homepage rebuilt**: display hero, pillar rows, alert-explanation figure, pipeline diagram, integrations status table (implemented vs planned), trust section, closing CTA. No customers, certifications or performance claims.
3. **Interactive 3D hero** (React Three Fiber): clearly labelled demonstration topology, selectable nodes with honest status (solid = implemented, wireframe = planned), pointer parallax, drifting packets, pauses off-screen and in hidden tabs, `demand` rendering under reduced motion, DPR capped at 1.5, lazy-loaded chunk, WebGL detection, error boundary, flat SVG fallback, keyboard-operable node list.
4. **Topology Explorer** (`/app/topology`): hosts grouped by environment, data-source links drawn only where stored events connect source to host, criticality, open alerts and cases, search, filters, pan/zoom, selection panel, table alternative, empty state. No network paths are drawn because AegisSOC does not know them.
5. Fixed: pointer capture was swallowing clicks on map nodes (found by the new test).

## 5. Remaining, in priority order
1. Command Center redesign (priority queue emphasis, hero status strip, real charts with accessible tables, workload).
2. Animated incident reconstruction (playback and scrubbing over real event timestamps, with raw evidence alongside).
3. Telemetry flow visualisation driven by real source and ingestion-run states.
4. Alert triage three-panel layout with a detail drawer; investigation workspace with resizable panels.
5. AI analyst side panel redesign.
6. Detection studio with a code editor. A heavy editor dependency (Monaco) is not added yet; a lighter highlighted editor is the likely choice.
7. Rule-by-rule light-theme review, tablet (768) and 1920 px screenshots, mobile 3D performance measurement.

## 6. Known limits
- Light theme and tablet/ultra-wide sizes have not been visually reviewed after the token change (only dark desktop and phone landing were inspected).
- 3D frame rate and memory on real mobile hardware are unmeasured. The headless browser used here renders WebGL in software.
- The 3D scene is a demonstration; it is not generated from live data and does not claim to be.
