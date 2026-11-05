# Working an incident in AegisSOC
1. Triage the alert (Simple view first; Analyst details for rule inputs). Acknowledge or start investigating.
2. Create a case; write **observations** separately from **hypotheses**; add tasks.
3. Hunt/pivot (read-only); link evidence events to the case.
4. If containment seems needed: draft a **simulated** proposal → an incident lead approves/rejects → perform the action yourself in the real tool → record it as user-attested → run the measured check. Only then can the case be CONTAINED.
5. Resolve with a resolution + note; a lead closes. Reopen needs a reason. Complete the post-incident review (root cause stays a hypothesis unless evidence verifies it).
6. Export the redacted report; improve the rule via Detections (draft → test → second-person approval).
AegisSOC never executes steps 4's real action.
