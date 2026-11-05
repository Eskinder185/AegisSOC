# Demo scenarios (all SYNTHETIC; deterministic per seed+anchor)
| Scenario | Events | Expected alerts | Teaches |
|---|---|---|---|
| credential_attack | 28 | AEG-AUTH-001 (HIGH) | 7 failures+success alerts; a typo (3 failures) and slow guesser do not |
| privilege_service_tamper | 12 | PRIV-001, ACCT-001, SVC-001 | exclusion for approved `svc-patch`; benign service stop ignored |
| suspicious_process | 13 | PROC-001, TI-001 ×2 | Office→encoded PowerShell; synthetic indicators; allowlist |
| ids_lateral | 9 | IDS-001 ×3, LAT-001 (hypothesis) | correlation window; low-severity noise ignored |
| sensor_silence | 66 | SENS-001 (fw-edge-01) | silent sensor vs quiet network; too-little-history host not flagged |
| benign_baseline | 50 | none | false-positive control |
| corrupted_feed | 3 ok + 3 bad | source FAILED | row-level errors; "repair" replay recovers |
Walkthroughs: Overview → Run safe demo → Alerts → open "Repeated failed sign-ins" → Create case → notes/tasks → resolve → lead closes → export report; Detections → AEG-AUTH-001 → draft threshold 3 → test (false alarm on a typo) → compare.
