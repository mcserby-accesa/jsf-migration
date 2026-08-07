# Prompt: b4-write-behavior-spec

Tier: M. Step contract: `steps/b4-write-behavior-spec.yaml`. Output schema:
`schemas/b4-write-behavior-spec.schema.json` (which itself extends
`schemas/bhv.schema.json`). Structure reference: `templates/BHV-template.md`.

## System / instruction text

```
You are drafting the body of ONE behavior document from a confirmed node
boundary. You are given the confirmed node ids, their taxonomy, and legacy
source excerpts for each node. Write:
- a title, in observable-behavior terms (never a legacy class name)
- a one-paragraph description of what is observed, not what implements it
- a short scope note (why this boundary, what's deliberately excluded)
- 3-8 scenario STUBS in Given/When/Then form, each citing at least one
  legacy_refs entry drawn ONLY from the excerpts given to you

These are stubs for a later, more thorough acceptance-criteria derivation
step — capture the main observable cases, not every edge case.

Return ONLY a single JSON object matching this shape (no prose, no markdown
fences):
{
  "id": "BHV-XXXX",
  "title": "...",
  "taxonomy": "screen"|"process"|"rule"|"integration"|"job"|"cross-cutting",
  "status": "draft",
  "legacy_refs": ["...aggregated from the input excerpts..."],
  "covers": ["...the confirmed node ids, verbatim..."],
  "related_behaviors": [],
  "scenarios": [
    { "scenario_id": "BHV-XXXX-S01", "given": "...", "when": "...", "then": "...",
      "legacy_refs": ["..."], "origin": "legacy" }
  ]
}
Use the literal placeholder "BHV-XXXX" for id and scenario_id prefixes — the
orchestrator assigns the real number.
```

## Input template

```
confirmed_node_ids: {{confirmed_node_ids_json}}
taxonomy: {{taxonomy}}
legacy_excerpts: {{legacy_excerpts_json}}   # map of node_id -> {legacy_refs, excerpt}
```

## Few-shot example 1 — confident draft

Input:
```
confirmed_node_ids: ["SCR-0142", "SVC-0089", "NAV-0022"]
taxonomy: screen
legacy_excerpts: {
  "SCR-0142": { "legacy_refs": ["leave/detail.xhtml:1-220"], "excerpt": "form with fields: startDate, endDate, reason, approveButton (rendered if #{leaveRequestBean.status=='PENDING_MANAGER_APPROVAL' and ...})" },
  "SVC-0089": { "legacy_refs": ["LeaveRequestBean.java:1-340"], "excerpt": "submit() validates startDate<endDate, saves request with status PENDING_MANAGER_APPROVAL, navigates to 'confirmation'" }
}
```

Expected output:
```json
{
  "id": "BHV-XXXX",
  "title": "Leave request detail submission",
  "taxonomy": "screen",
  "status": "draft",
  "legacy_refs": ["leave/detail.xhtml:1-220", "LeaveRequestBean.java:1-340"],
  "covers": ["SCR-0142", "SVC-0089", "NAV-0022"],
  "related_behaviors": [],
  "scenarios": [
    { "scenario_id": "BHV-XXXX-S01", "given": "a user has entered a start date before the end date", "when": "the user submits the leave request form", "then": "the request is saved with status PENDING_MANAGER_APPROVAL and the user is navigated to the confirmation screen", "legacy_refs": ["LeaveRequestBean.java:1-340"], "origin": "legacy" },
    { "scenario_id": "BHV-XXXX-S02", "given": "a user has entered a start date on or after the end date", "when": "the user submits the leave request form", "then": "the request is not saved and a validation error is shown", "legacy_refs": ["LeaveRequestBean.java:1-340"], "origin": "legacy" }
  ]
}
```

## Few-shot example 2 — thin evidence, escalation-worthy

Input:
```
confirmed_node_ids: ["JOB-0012"]
taxonomy: job
legacy_excerpts: {
  "JOB-0012": { "legacy_refs": ["ExportJob.java:1-9"], "excerpt": "@Scheduled(cron=\"0 0 2 * * *\") void run() { exportService.runExport(); }" }
}
```

Expected output:
```json
{
  "id": "BHV-XXXX",
  "title": "Nightly export job",
  "taxonomy": "job",
  "status": "draft",
  "legacy_refs": ["ExportJob.java:1-9"],
  "covers": ["JOB-0012"],
  "related_behaviors": [],
  "scenarios": [
    { "scenario_id": "BHV-XXXX-S01", "given": "it is 02:00 in the job's configured timezone", "when": "the scheduler fires", "then": "exportService.runExport() is invoked", "legacy_refs": ["ExportJob.java:1-9"], "origin": "legacy" }
  ]
}
```
Note: this excerpt gives no visibility into what runExport() actually does
or what its failure modes are — only one thin scenario could be drafted with
confidence. A reviewer should treat this BHV as needing the exportService
node added to its boundary before Phase C acceptance work, rather than
accept one scenario as sufficient for a job with unknown side effects.

## Notes for the orchestrator

- A behavior drafted from a boundary this thin is a candidate for
  escalation (tier L, full non-excerpted source) specifically because the
  scenario count is suspiciously low relative to the node's apparent
  complexity — this is the kind of signal the escalation policy in
  `docs/model-tiers.md` exists to catch.
