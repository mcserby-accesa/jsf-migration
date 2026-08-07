# Prompt: a6-lift-db-logic

Step contract: `steps/a6-lift-db-logic.yaml`. Output schema:
`schemas/a6-lift-db-logic.schema.json`.

## System / instruction text

```
You are lifting ONE database trigger or stored-procedure body into a
plain-language business rule description. This logic executes inside the
database engine, not the application's JVM, so it is invisible to
code-coverage tools the same way a JSF EL expression is — this description
is the only record that this logic exists as an explicit rule. Do not
invent conditions that are not literally present in the body — only
describe what the body actually does, in plain language, using the table/
column/parameter names it references.

Return ONLY a single JSON object matching this shape (no prose, no markdown
fences):
{
  "source_node_id": "<copy the input node id exactly>",
  "rule_node": {
    "proposed_id": "RULE-XXXX",
    "kind": "rule",
    "label": "<short, plain-language name for this rule, <=8 words>",
    "plain_language_description": "<one or two sentences describing exactly
      what the trigger/procedure does and when it fires, using only names
      present in the body>",
    "referenced_properties": ["<table/column/parameter names literally
      present in the body>"]
  },
  "derived_from_edge": { "from": "RULE-XXXX", "to": "<source node id>", "type": "DERIVED_FROM" },
  "confidence": <number between 0 and 1>,
  "needs_escalation": <true or false>
}
Use the literal placeholder "RULE-XXXX" for proposed_id — the orchestrator
assigns the real ID number; do not guess a number.
```

## Input template

```
source_node_id: {{node_id}}
name: {{name}}
kind: {{kind}}                    # trigger or stored_procedure
body_ref: {{body_ref}}
body_text: {{body_text}}
```

## Few-shot example 1 — confident lift, trigger

Input:
```
source_node_id: DB-0301
name: trg_leave_request_audit
kind: trigger
body_ref: db/ddl/leave_schema.sql:412-428
body_text: "CREATE TRIGGER trg_leave_request_audit AFTER UPDATE ON leave_request FOR EACH ROW WHEN (OLD.status <> NEW.status) BEGIN INSERT INTO leave_request_audit (request_id, old_status, new_status, changed_at) VALUES (:NEW.id, :OLD.status, :NEW.status, SYSTIMESTAMP); END;"
```

Expected output:
```json
{
  "source_node_id": "DB-0301",
  "rule_node": {
    "proposed_id": "RULE-XXXX",
    "kind": "rule",
    "label": "Leave request status-change audit",
    "plain_language_description": "Whenever a leave_request row's status column changes, an audit row is inserted into leave_request_audit recording the request id, the old status, the new status, and the change timestamp.",
    "referenced_properties": ["leave_request.status", "leave_request.id", "leave_request_audit"]
  },
  "derived_from_edge": { "from": "RULE-XXXX", "to": "DB-0301", "type": "DERIVED_FROM" },
  "confidence": 0.95,
  "needs_escalation": false
}
```

## Few-shot example 2 — low confidence, escalation-worthy

Input:
```
source_node_id: DB-0355
name: sp_apply_bonus_adjustment
kind: stored_procedure
body_ref: db/ddl/payroll_schema.sql:88-140
body_text: "CREATE PROCEDURE sp_apply_bonus_adjustment(p_emp_id NUMBER) AS BEGIN UPDATE payroll SET bonus = bonus * get_adjustment_factor(p_emp_id) WHERE emp_id = p_emp_id; END;"
```

Expected output:
```json
{
  "source_node_id": "DB-0355",
  "rule_node": {
    "proposed_id": "RULE-XXXX",
    "kind": "rule",
    "label": "Bonus adjustment via external factor function",
    "plain_language_description": "For the given employee id, the payroll table's bonus column is multiplied by whatever get_adjustment_factor(p_emp_id) returns. The actual adjustment logic lives in get_adjustment_factor, a separate function not included in this body — I can describe the mechanics but not the business intent of the adjustment itself.",
    "referenced_properties": ["payroll.bonus", "payroll.emp_id", "get_adjustment_factor"]
  },
  "derived_from_edge": { "from": "RULE-XXXX", "to": "DB-0355", "type": "DERIVED_FROM" },
  "confidence": 0.4,
  "needs_escalation": true
}
```

## Notes for the orchestrator

- `get_adjustment_factor` in example 2 is exactly the kind of case worth
  escalating with that function's own body included as extra
  context, rather than accepting a mechanically-accurate-but-incomplete
  description — same pattern as a3's `flags[3]` example.
- If `body_ref` cannot be resolved to a real DDL/SQL source location, this
  step does not run — that failure belongs to `a5`'s validator (an
  unresolvable `body_ref` fails Phase A's exit gate), not to this step.
