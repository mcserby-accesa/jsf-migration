# Prompt: c2-build-decision-table

Step contract: `steps/c2-build-decision-table.yaml`. Output
schema: `schemas/c2-build-decision-table.schema.json`.

## System / instruction text

```
You are building the full MC/DC-relevant decision table for ONE compound
boolean condition. You are given the condition expression, its identified
sub-conditions, and a legacy excerpt showing the expected outcome. Produce
one row per condition-value combination needed to demonstrate that each
sub-condition independently affects the outcome — this is more rows than
plain branch coverage (CC) would suggest, and that gap is exactly why this
step exists (CC cannot see MC/DC — see docs/method.md).

If a sub-condition is a configuration value (a feature flag, a role/status
enum with many possible values) rather than a true logic branch, mark that
row's varying dimension "is_configuration_dimension": true — a later step
will pairwise-reduce only those rows, never the others.

Return ONLY a single JSON object matching this shape (no prose, no markdown
fences):
{
  "bhv_id": "<copy exactly>",
  "condition_expr": "<copy exactly>",
  "sub_conditions": ["..."],
  "rows": [
    { "row_id": "R1", "values": { "<sub_condition>": true|false|"<enum value>" },
      "expected_outcome": "...", "legacy_refs": ["..."],
      "is_configuration_dimension": false }
  ]
}
```

## Input template

```
bhv_id: {{bhv_id}}
condition_expr: {{condition_expr}}
sub_conditions: {{sub_conditions_json}}
legacy_excerpt: {{legacy_excerpt}}
```

## Few-shot example 1 — pure boolean MC/DC table

Input:
```
bhv_id: BHV-0031
condition_expr: status == 'PENDING_MANAGER_APPROVAL' and (role == 'MANAGER' or role == 'HR_ADMIN') and !locked
sub_conditions: ["status_is_pending", "role_is_manager_or_hr_admin", "not_locked"]
legacy_excerpt: "rendered=\"#{...}\" -- panel shown only when all three hold"
```

Expected output:
```json
{
  "bhv_id": "BHV-0031",
  "condition_expr": "status == 'PENDING_MANAGER_APPROVAL' and (role == 'MANAGER' or role == 'HR_ADMIN') and !locked",
  "sub_conditions": ["status_is_pending", "role_is_manager_or_hr_admin", "not_locked"],
  "rows": [
    { "row_id": "R1", "values": { "status_is_pending": true, "role_is_manager_or_hr_admin": true, "not_locked": true }, "expected_outcome": "panel shown", "legacy_refs": ["LeaveRequestBean.java:120"], "is_configuration_dimension": false },
    { "row_id": "R2", "values": { "status_is_pending": false, "role_is_manager_or_hr_admin": true, "not_locked": true }, "expected_outcome": "panel hidden", "legacy_refs": ["LeaveRequestBean.java:120"], "is_configuration_dimension": false },
    { "row_id": "R3", "values": { "status_is_pending": true, "role_is_manager_or_hr_admin": false, "not_locked": true }, "expected_outcome": "panel hidden", "legacy_refs": ["LeaveRequestBean.java:120"], "is_configuration_dimension": false },
    { "row_id": "R4", "values": { "status_is_pending": true, "role_is_manager_or_hr_admin": true, "not_locked": false }, "expected_outcome": "panel hidden", "legacy_refs": ["LeaveRequestBean.java:120"], "is_configuration_dimension": false }
  ]
}
```

## Few-shot example 2 — mixed logic + configuration dimension

Input:
```
bhv_id: BHV-0058
condition_expr: featureFlags.get('NEW_EXPORT_UI') and user.region in ('EU','US','APAC','LATAM') and order.total > THRESHOLD
sub_conditions: ["new_export_ui_flag", "user_region", "total_over_threshold"]
legacy_excerpt: "ExportController.java:88 -- new export UI shown only when flag on, region is any supported region, and total exceeds threshold"
```

Expected output:
```json
{
  "bhv_id": "BHV-0058",
  "condition_expr": "featureFlags.get('NEW_EXPORT_UI') and user.region in ('EU','US','APAC','LATAM') and order.total > THRESHOLD",
  "sub_conditions": ["new_export_ui_flag", "user_region", "total_over_threshold"],
  "rows": [
    { "row_id": "R1", "values": { "new_export_ui_flag": true, "user_region": "EU", "total_over_threshold": true }, "expected_outcome": "new export UI shown", "legacy_refs": ["ExportController.java:88"], "is_configuration_dimension": false },
    { "row_id": "R2", "values": { "new_export_ui_flag": false, "user_region": "EU", "total_over_threshold": true }, "expected_outcome": "new export UI hidden", "legacy_refs": ["ExportController.java:88"], "is_configuration_dimension": false },
    { "row_id": "R3", "values": { "new_export_ui_flag": true, "user_region": "EU", "total_over_threshold": false }, "expected_outcome": "new export UI hidden", "legacy_refs": ["ExportController.java:88"], "is_configuration_dimension": false },
    { "row_id": "R4", "values": { "new_export_ui_flag": true, "user_region": "US", "total_over_threshold": true }, "expected_outcome": "new export UI shown", "legacy_refs": ["ExportController.java:88"], "is_configuration_dimension": true },
    { "row_id": "R5", "values": { "new_export_ui_flag": true, "user_region": "APAC", "total_over_threshold": true }, "expected_outcome": "new export UI shown", "legacy_refs": ["ExportController.java:88"], "is_configuration_dimension": true },
    { "row_id": "R6", "values": { "new_export_ui_flag": true, "user_region": "LATAM", "total_over_threshold": true }, "expected_outcome": "new export UI shown", "legacy_refs": ["ExportController.java:88"], "is_configuration_dimension": true }
  ]
}
```
R1-R3 establish MC/DC for the flag and threshold conditions (never
reduced); R1 and R4-R6 are the region enumeration, which is a configuration
dimension eligible for pairwise reduction by `c2b` if combined with other
configuration dimensions elsewhere in the table.

## Notes for the orchestrator

- If `rows.length < sub_conditions.length + 1`, the escalation trigger in
  `steps/c2-build-decision-table.yaml` fires (insufficient for MC/DC).
