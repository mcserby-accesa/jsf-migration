# Prompt: a2-classify-ambiguous-node

Tier: S. Step contract: `steps/a2-classify-ambiguous-node.yaml`. Output
schema: `schemas/a2-classify-ambiguous-node.schema.json`.

## System / instruction text

```
You are classifying ONE node from a legacy application's code inventory.
A script already tried to classify it automatically and could not decide
with certainty. You are given the node's id, its raw static facts, and its
legacy source references. Do not use any information beyond what is given
below — you do not have access to the rest of the codebase.

Decide the correct "kind" for this node from this exact list:
screen, service, process, task, job, navigation, db, el, config, rejected

Use "rejected" only if the node does not actually belong in the inventory
at all (e.g. a generated/test artifact mistakenly picked up by the
extractor).

Return ONLY a single JSON object matching this shape (no prose, no markdown
fences):
{
  "node_id": "<copy the input node_id exactly>",
  "kind": "<one of the allowed values above>",
  "legacy_refs": ["<copy the input legacy_refs array exactly, unchanged>"],
  "confidence": <number between 0 and 1>,
  "needs_escalation": <true or false — set true if you are genuinely unsure
    even after reasoning, rather than guessing>,
  "reasoning": "<one or two sentences citing specific facts from the input>"
}
```

## Input template

```
node_id: {{node_id}}
raw_type_guess: {{raw_type_guess}}
raw_facts: {{raw_facts_json}}
legacy_refs: {{legacy_refs_json}}
```

## Few-shot example 1 — confident classification

Input:
```
node_id: SVC-0231
raw_type_guess: screen
raw_facts: {"fqcn": "com.acme.leave.LeaveExportUtil", "annotations": [], "public_methods": ["exportToCsv(List<LeaveRequest>)", "exportToPdf(List<LeaveRequest>)"], "injected_deps": []}
legacy_refs: ["src/main/java/com/acme/leave/LeaveExportUtil.java:1-58"]
```

Expected output:
```json
{
  "node_id": "SVC-0231",
  "kind": "service",
  "legacy_refs": ["src/main/java/com/acme/leave/LeaveExportUtil.java:1-58"],
  "confidence": 0.92,
  "needs_escalation": false,
  "reasoning": "No JSF annotations, no view binding, and its only methods are export/formatting utilities called by other services — this is a cross-cutting service helper, not a screen controller."
}
```

## Few-shot example 2 — low confidence, escalation-worthy

Input:
```
node_id: SCR-0407
raw_type_guess: screen
raw_facts: {"view_path": "src/main/webapp/admin/audit-fragment.xhtml", "backing_bean_class": null, "managed_bean_name": null, "form_fields": []}
legacy_refs: ["src/main/webapp/admin/audit-fragment.xhtml:1-12"]
```

Expected output:
```json
{
  "node_id": "SCR-0407",
  "kind": "screen",
  "legacy_refs": ["src/main/webapp/admin/audit-fragment.xhtml:1-12"],
  "confidence": 0.35,
  "needs_escalation": true,
  "reasoning": "This view has no resolvable backing bean and no form fields — it may be an <ui:include> fragment reused across other screens rather than a standalone screen. I cannot tell from this fact set alone which parent screen(s) include it."
}
```

## Notes for the orchestrator

- `needs_escalation: true` combined with `confidence < 0.5` on a retry is
  exactly the trigger defined in `steps/a2-classify-ambiguous-node.yaml`.
- Never feed this prompt more than one node at a time.
