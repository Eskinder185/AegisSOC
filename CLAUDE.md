# AegisSOC – working notes for Claude Code

Spec: `AegisSOC_Claude_Code_Master_Build_Prompt.md`. Status ledger: `docs/ai/PROJECT_STATUS.md`, `docs/ai/HANDOFF.md`.

- Safety is non-negotiable: no live connectors, no real-system actions, nothing pushed/deployed without the user's approval. Never touch the user's real Postgres on 5432 or the unrelated server on 5173.
- Toolchain: portable JDK 25 in `.tools/jdk25` (gitignored); `export JAVA_HOME=$PWD/.tools/jdk25`. Dev DB: docker compose `db` on 127.0.0.1:5433. Web dev port 5180.
- Use `mvn clean` if class files look stale (the IDE's Java server also writes to `target/`).
- Git: this is a nested repo inside the home-dir repo; work on branch `dev/initial-build`.
- Bash heredocs with apostrophes fail in this harness; use the Write tool for files.
- Keep docs truthful: update FEATURE_MATRIX/TEST_RESULTS only with evidence from real runs.
