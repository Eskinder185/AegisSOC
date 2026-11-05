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
3. **Interactive 3D hero** (superseded, see section 7).
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

## 7. Storytelling redesign (2026-11-05, second tranche)
Brief: a visitor with no security background must understand what AegisSOC is, where data comes from, what it looks for, why an alert appears, how an analyst investigates and how the platform helps improve.

### Audit of the first 3D hero (against the ten problems in the brief)
Abstract primitives (octahedron, torus, cube) with no meaning; unlabeled links; node names invisible in the scene; a 280 px jargon panel ("Suricata EVE import", "read-only adapter"); no instructions; no beginning/middle/end; 12 px explanatory text; a 1152 px content column leaving large screens mostly empty; engineering terms in the capability numbers.

### What replaced it
- **One semantic model** (`src/lib/story.ts`): 7 objects, 7 directed connections, 5 stages, 4 scenarios. The 3D scene, the 2D diagram, the explanation panel and the tests all read it, so they cannot disagree. Every object and connection carries plain-language *what / why / example*, technical details, and a reality status (works in this build / example from practice data / planned).
- **3D scene** (`StoryScene.tsx`, lazy-loaded): recognisable laptop, server, router, security-camera-style sensor, shield-shaped engine, warning sign and analyst workstation, built from original geometry. Arrows show direction; packets move only along the connections highlighted for the current step; the alert link is dashed because it is an example. Labels are plain DOM text projected from 3D anchors (the first attempt, drei `Html`, dropped a label under React StrictMode).
- **Guided tour** "How AegisSOC Works": five steps with progress, Back/Next/Play/Pause/Replay, direct step buttons, autoplay that never blocks the page. "Explore the 3D Network" switches to free orbit with every object and arrow selectable; "Back to the guided tour" returns.
- **Explanation panel**: larger type; What is this? / Why does it matter? / Real-world example / Learn more (technical).
- **Basic and Analyst modes** share one dataset: Analyst swaps in technical names and opens technical details. Persisted per browser.
- **Four scenarios** (suspicious login, unusual network activity, unauthorised access, possible malware) each with a 3-step practice-data sequence and the seven requested aspects; each states which built-in rule(s) support it today.
- **Plain-language rewrite** of capability numbers and sources (e.g. "Practice Security Events", "Import Network Security Alerts"), with the original names shown in Analyst mode. Capability numbers say "Live monitoring: Not connected" and "Actions on real systems: Disabled".
- **Glossary terms** (telemetry, alert, investigation, rule, ...) as keyboard-operable inline explanations.
- **Wider layout** (1360 px editorial grid, larger type).
- **Accessible alternative**: a flat 2D diagram with the same seven objects as buttons; default on phones and when WebGL is unavailable or fails.

### Limits
- Light theme was reviewed on one step only; 3D performance on real mobile hardware is unmeasured (headless Chromium renders WebGL in software).
- The objects are hand-built from primitives and extrusions, not authored models; they read as simplified icons rather than product renders.
- Step 4 (Investigate) shows the alert-to-analyst link and the explanation panel; it does not yet transition to a separate investigation illustration.
- The 3D chunk is 967 kB (256 kB gzip) and loads on the homepage only.
