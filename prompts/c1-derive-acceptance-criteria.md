# Prompt: c1-derive-acceptance-criteria

Step contract: `steps/c1-derive-acceptance-criteria.yaml`. Output
schema: `schemas/c1-derive-acceptance-criteria.schema.json`.

## System / instruction text

```
You are deriving the full acceptance-criteria list for ONE behavior, from
its confirmed covered nodes and legacy source excerpts. Every AC must be
grounded in the excerpts given — cite at least one legacy_refs entry per AC.
Do NOT invent an AC that isn't supported by the excerpts; if you believe a
case is missing from the legacy system entirely, do not fabricate an AC for
it — leave it out (a human reviewer adds "new" scenarios separately, you
never do).

If a condition you find is compound (multiple booleans combined with AND/OR)
rather than a single branch, set "compound_condition": true on that AC — it
will be expanded into a full decision table by a separate step, so you do
not need to enumerate every combination yourself here, just flag it.

Return ONLY a single JSON object matching this shape (no prose, no markdown
fences):
{
  "bhv_id": "<copy exactly>",
  "acs": [
    { "ac_id": "AC-01", "given": "...", "when": "...", "then": "...",
      "legacy_refs": ["..."], "origin": "legacy", "compound_condition": false }
  ]
}
```

## Input template

```
bhv_id: {{bhv_id}}
covered_nodes: {{covered_nodes_json}}
legacy_excerpts: {{legacy_excerpts_json}}
```

## Few-shot example 1 — confident, straightforward ACs

Input:
```
bhv_id: BHV-0142
covered_nodes: ["SCR-0142", "SVC-0089"]
legacy_excerpts: { "SVC-0089": { "legacy_refs": ["LeaveRequestBean.java:40-52"], "excerpt": "public void submit() { if (startDate.isAfter(endDate) || startDate.isEqual(endDate)) { addError(\"Start date must be before end date\"); return; } request.setStatus(PENDING_MANAGER_APPROVAL); save(request); nav(\"confirmation\"); }" } }
```

Expected output:
```json
{
  "bhv_id": "BHV-0142",
  "acs": [
    { "ac_id": "AC-01", "given": "startDate is before endDate", "when": "submit() is called", "then": "the request is saved with status PENDING_MANAGER_APPROVAL and navigation proceeds to 'confirmation'", "legacy_refs": ["LeaveRequestBean.java:40-52"], "origin": "legacy", "compound_condition": false },
    { "ac_id": "AC-02", "given": "startDate is after or equal to endDate", "when": "submit() is called", "then": "a validation error 'Start date must be before end date' is shown and the request is not saved", "legacy_refs": ["LeaveRequestBean.java:40-52"], "origin": "legacy", "compound_condition": true }
  ]
}
```

## Few-shot example 2 — compound condition flagged, escalation-relevant

Input:
```
bhv_id: BHV-0031
covered_nodes: ["RULE-0031"]
legacy_excerpts: { "RULE-0031": { "legacy_refs": ["LeaveRequestBean.java:120"], "excerpt": "rendered=\"#{leaveRequestBean.status == 'PENDING_MANAGER_APPROVAL' and (leaveRequestBean.currentUser.role == 'MANAGER' or leaveRequestBean.currentUser.role == 'HR_ADMIN') and !leaveRequestBean.locked}\"" } }
```

Expected output:
```json
{
  "bhv_id": "BHV-0031",
  "acs": [
    { "ac_id": "AC-01", "given": "the request status is PENDING_MANAGER_APPROVAL, the current user's role is MANAGER or HR_ADMIN, and the request is not locked", "when": "the screen renders", "then": "the approval panel is shown", "legacy_refs": ["LeaveRequestBean.java:120"], "origin": "legacy", "compound_condition": true }
  ]
}
```
This single AC's three-part compound condition (status match AND role-is-
one-of-two AND not-locked) is exactly the shape `c2` needs to expand into a
full MC/DC decision table — flagging it here rather than trying to enumerate
all combinations by hand keeps this step within a single bounded judgment.

## Notes for the orchestrator

- Any AC with `compound_condition: true` is routed to `c2` automatically;
  it is not also left standing alone as a single scenario in the final BHV
  (the decision table replaces it — see `docs/phase-c-acceptance.md`, step 2).
