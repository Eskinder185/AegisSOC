# UX directive backlog (premium SOC UI/UX master directive)

Audited 2026-11-05 against the existing app. Status is evidence-based: "Done" means covered by a passing test run listed in `docs/evidence/TEST_RESULTS.md`.

## Done in this tranche
- Command palette (Ctrl/Cmd+K): page jump, local actions, live alert and case search, hunt hand-off. e2e + axe checked.
- Keyboard shortcuts: `g`+letter navigation, `?` help dialog, alerts list `j`/`k`/`Enter`/`x`.
- Collapsible sidebar (remembered per browser, labels kept for screen readers). Breadcrumbs on detail pages.
- Alert saved views (per browser, localStorage; not shared between users).

## Already present before this tranche
Overview with data-state banner (no data vs. no threats), alert triage with bulk actions and confirmation, case lifecycle with measured verification, hunt with saved searches/notebooks, rule drafts/tests/second-person approval, intel, assets and coverage, simulation-only response, reports (Markdown/JSON), AI analyst with deterministic fallback, dark/light themes, phone drawer.

## Prioritised remaining work
1. Visual investigation timeline on alert/case pages (real event timestamps, table alternative). Highest analyst value.
2. Basic / Advanced view toggle shared across pages (progressive disclosure preference).
3. Dedicated Coverage & health page (rules enabled/tested, data gaps, missing integrations) separate from Data sources.
4. Alert filters still missing: source, asset, ATT&CK technique, time range; MITRE mapping data on rules.
5. Resizable multi-panel investigation workspace; case and investigation templates.
6. Rule rollback and change-history UI; false-positive analysis view.
7. Intel lifecycle status and source-freshness separation.
8. Workload widget (assigned cases, pending approvals, overdue tasks) on Overview.
9. PDF export; weekly/daily/coverage/workload report types (only Markdown/JSON incident reports exist).
10. Public site pages beyond the single landing page.
11. Table column preferences, notification preferences, guided onboarding, in-app docs.
12. Tablet-size screenshots and a manual screen-reader pass.

Limits: the lifecycle New→Triage→…→Review→Closed differs from the implemented state machine (see DECISIONS.md); changing it is a deliberate decision, not yet made.
