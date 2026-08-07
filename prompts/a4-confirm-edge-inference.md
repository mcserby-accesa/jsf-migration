# Prompt: a4-confirm-edge-inference

Step contract: `steps/a4-confirm-edge-inference.yaml`. Output
schema: `schemas/a4-confirm-edge-inference.schema.json`.

## System / instruction text

```
You are resolving ONE candidate edge that static analysis could not pin to
exactly one target. You are given the source node, the edge type, the
evidence (e.g. a call site using an interface type), and a short list of
concrete candidate targets the extractor already narrowed it to. Choose
the single best-supported candidate, or one of two escape values:
"none_of_the_above" (none of the candidates plausibly match the evidence)
or "multiple" (more than one candidate is genuinely plausible and the code
likely dispatches to more than one at runtime, e.g. a Spring profile-based
bean choice).

Return ONLY a single JSON object matching this shape (no prose, no markdown
fences):
{
  "edge_ref": { "from": "<copy exactly>", "edge_type": "<copy exactly>" },
  "verdict": "<one candidate node id, or 'none_of_the_above', or 'multiple'>",
  "chosen_targets": ["<non-empty only when verdict == 'multiple' — list every
    plausible candidate>"],
  "evidence": "<one or two sentences citing the specific evidence given>",
  "confidence": <number between 0 and 1>
}
```

## Input template

```
edge_ref: { "from": "{{from_node_id}}", "edge_type": "{{edge_type}}" }
evidence: {{evidence_text}}
candidate_targets: {{candidate_targets_json}}
```

## Few-shot example 1 — confident single choice

Input:
```
edge_ref: { "from": "SVC-0044", "edge_type": "INVOKES" }
evidence: "SVC-0044's approve() method calls notificationService.sendApprovalEmail(request), where notificationService is typed as the NotificationService interface."
candidate_targets: [
  { "node_id": "SVC-0091", "evidence": "EmailNotificationService implements NotificationService, is the only @Primary bean registered for this interface" },
  { "node_id": "SVC-0092", "evidence": "SmsNotificationService implements NotificationService, registered with @Profile(\"sms-enabled\") which is not active in this deployment" }
]
```

Expected output:
```json
{
  "edge_ref": { "from": "SVC-0044", "edge_type": "INVOKES" },
  "verdict": "SVC-0091",
  "chosen_targets": [],
  "evidence": "SVC-0091 is marked @Primary for the NotificationService interface; SVC-0092 is gated behind a profile that is inactive in this deployment, so it is not the runtime target here.",
  "confidence": 0.85
}
```

## Few-shot example 2 — genuinely multiple targets

Input:
```
edge_ref: { "from": "JOB-0012", "edge_type": "SCHEDULES" }
evidence: "JOB-0012 invokes exportService.runExport(region), where exportService is resolved from a Map<String, ExportService> keyed by region at runtime, with no single dominant implementation."
candidate_targets: [
  { "node_id": "SVC-0201", "evidence": "EuExportService, registered under key 'EU'" },
  { "node_id": "SVC-0202", "evidence": "UsExportService, registered under key 'US'" },
  { "node_id": "SVC-0203", "evidence": "ApacExportService, registered under key 'APAC'" }
]
```

Expected output:
```json
{
  "edge_ref": { "from": "JOB-0012", "edge_type": "SCHEDULES" },
  "verdict": "multiple",
  "chosen_targets": ["SVC-0201", "SVC-0202", "SVC-0203"],
  "evidence": "The job dispatches by a runtime region key with no single dominant implementation registered — all three region-specific services are genuinely reachable at runtime, so this should be modeled as three edges.",
  "confidence": 0.8
}
```

## Notes for the orchestrator

- On `verdict: "multiple"`, fan the single candidate edge out into one
  concrete edge per `chosen_targets` entry mechanically — do not re-ask the
  model to pick one.
