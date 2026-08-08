# Prompt: a3-lift-rule

Step contract: `steps/a3-lift-rule.yaml`. Output schema:
`schemas/a3-lift-rule.schema.json`.

## How the orchestrator assembles this prompt

Three source kinds share one instruction preamble and then diverge. **Include
the shared preamble plus exactly ONE kind block — the one matching the item's
`source_kind` — and nothing else.**

That is not an optimization, it is the step's bounded-input property
(`DECISIONS.md`, principle 4). Merging three steps into one contract must not
make any single *call* larger than it was before: a call lifting an EL
expression carries the EL block and never sees the computation examples. A
runner that concatenates all three blocks has undone the thing that lets a
cheap model run this step.

---

## Shared preamble (always included)

```
You are lifting ONE piece of legacy logic into an explicit, plain-language
business rule. Describe only what the source literally says, using only the
identifiers it actually references. Do not invent conditions, do not
generalize, and do not simplify.

Return ONLY a single JSON object matching this shape (no prose, no markdown
fences):
{
  "source_kind": "<copy the input source_kind exactly>",
  "source_node_id": "<copy the input node id exactly>",
  "rule_node": {
    "proposed_id": "RULE-XXXX",
    "kind": "rule",
    "label": "<short, plain-language name for this rule, <=8 words>",
    "plain_language_description": "<one or two sentences, using only names
      present in the source>",
    "referenced_properties": ["<identifiers literally present in the source>"]
  },
  "derived_from_edge": { "from": "RULE-XXXX", "to": "<source node id>", "type": "DERIVED_FROM" },
  "open_value_domain": <true or false>,
  "confidence": <number between 0 and 1>,
  "needs_escalation": <true or false>
}
Use the literal placeholder "RULE-XXXX" for proposed_id — the orchestrator
assigns the real ID number; do not guess a number.

Set open_value_domain true when the rule tests membership of a set the source
does not enumerate — a role list, a status vocabulary, a lookup table's rows,
a rate table. That is not a failure: the lift is correct and the set is
genuinely absent. Recording it is what turns an invented set into an asked
question.

If you can describe the mechanics but not the business intent, say so in the
description, set confidence below 0.5, and set needs_escalation true. A
mechanically-accurate-but-meaningless description accepted at high confidence
is worse than an escalation, because nothing downstream will question it.
```

---

## Kind block: `el`

```
This source is a JSF EL expression (a rendered/disabled/required/value
attribute) or a BPMN gateway condition. It is invisible to code-coverage
tools — it executes in the JSF lifecycle or the process engine, not as
measured JVM bytecode — so this description is the ONLY record that this
logic exists as an explicit rule.

referenced_properties holds property and method names literally present in
the expression. The description says what the expression evaluates AND what
effect it has: renders, hides, disables, requires, or routes.
```

### Input template

```
source_kind: el
source_node_id: {{node_id}}
attribute: {{attribute}}          # rendered, disabled, required, value, condition_expr
raw_expression: {{raw_expression}}
attached_component_id: {{attached_component_id}}
attached_screen: {{attached_screen}}
```

### Example — confident

```
source_kind: el
source_node_id: EL-0089
attribute: rendered
raw_expression: #{leaveRequestBean.status == 'PENDING_MANAGER_APPROVAL' and leaveRequestBean.currentUser.role == 'MANAGER'}
attached_component_id: approveButtonPanel
attached_screen: SCR-0142
```

```json
{
  "source_kind": "el",
  "source_node_id": "EL-0089",
  "rule_node": {
    "proposed_id": "RULE-XXXX",
    "kind": "rule",
    "label": "Manager approval panel visibility",
    "plain_language_description": "The approval panel is shown only when the leave request's status is PENDING_MANAGER_APPROVAL and the current user's role is MANAGER.",
    "referenced_properties": ["leaveRequestBean.status", "leaveRequestBean.currentUser.role"]
  },
  "derived_from_edge": { "from": "RULE-XXXX", "to": "EL-0089", "type": "DERIVED_FROM" },
  "open_value_domain": false,
  "confidence": 0.95,
  "needs_escalation": false
}
```

### Example — escalation-worthy

```
source_kind: el
source_node_id: EL-0114
attribute: rendered
raw_expression: #{bean.flags[3] and !util.isLegacyMode(bean)}
attached_component_id: legacyWarningBanner
attached_screen: SCR-0201
```

```json
{
  "source_kind": "el",
  "source_node_id": "EL-0114",
  "rule_node": {
    "proposed_id": "RULE-XXXX",
    "kind": "rule",
    "label": "Banner shown by flag index 3 and legacy mode check",
    "plain_language_description": "The banner is shown when flags[3] is true and util.isLegacyMode(bean) is false. The meaning of flags[3] and isLegacyMode is not recoverable from this expression alone — I can describe the mechanics but not the business intent.",
    "referenced_properties": ["bean.flags[3]", "util.isLegacyMode(bean)"]
  },
  "derived_from_edge": { "from": "RULE-XXXX", "to": "EL-0114", "type": "DERIVED_FROM" },
  "open_value_domain": false,
  "confidence": 0.4,
  "needs_escalation": true
}
```

`flags[3]` is exactly the case worth retrying with the bean's full field list
— what `flags` actually enumerates — rather than accepting the mechanical
description.

---

## Kind block: `db-body`

```
This source is a database trigger or stored-procedure body. It executes
inside the database engine, not the application's JVM, so it is invisible to
code-coverage tools the same way a JSF EL expression is — this description is
the ONLY record that this logic exists as an explicit rule.

referenced_properties holds table, column, and parameter names literally
present in the body. The description says what the trigger or procedure does
AND when it fires.
```

### Input template

```
source_kind: db-body
source_node_id: {{node_id}}
name: {{name}}
kind: {{kind}}                    # trigger or stored_procedure
body_ref: {{body_ref}}
body_text: {{body_text}}
```

### Example — confident

```
source_kind: db-body
source_node_id: DB-0301
name: trg_leave_request_audit
kind: trigger
body_ref: db/ddl/leave_schema.sql:412-428
body_text: "CREATE TRIGGER trg_leave_request_audit AFTER UPDATE ON leave_request FOR EACH ROW WHEN (OLD.status <> NEW.status) BEGIN INSERT INTO leave_request_audit (request_id, old_status, new_status, changed_at) VALUES (:NEW.id, :OLD.status, :NEW.status, SYSTIMESTAMP); END;"
```

```json
{
  "source_kind": "db-body",
  "source_node_id": "DB-0301",
  "rule_node": {
    "proposed_id": "RULE-XXXX",
    "kind": "rule",
    "label": "Leave request status-change audit",
    "plain_language_description": "Whenever a leave_request row's status column changes, an audit row is inserted into leave_request_audit recording the request id, the old status, the new status, and the change timestamp.",
    "referenced_properties": ["leave_request.status", "leave_request.id", "leave_request_audit"]
  },
  "derived_from_edge": { "from": "RULE-XXXX", "to": "DB-0301", "type": "DERIVED_FROM" },
  "open_value_domain": false,
  "confidence": 0.95,
  "needs_escalation": false
}
```

### Example — escalation-worthy

```
source_kind: db-body
source_node_id: DB-0355
name: sp_apply_bonus_adjustment
kind: stored_procedure
body_ref: db/ddl/payroll_schema.sql:88-140
body_text: "CREATE PROCEDURE sp_apply_bonus_adjustment(p_emp_id NUMBER) AS BEGIN UPDATE payroll SET bonus = bonus * get_adjustment_factor(p_emp_id) WHERE emp_id = p_emp_id; END;"
```

```json
{
  "source_kind": "db-body",
  "source_node_id": "DB-0355",
  "rule_node": {
    "proposed_id": "RULE-XXXX",
    "kind": "rule",
    "label": "Bonus adjustment via external factor function",
    "plain_language_description": "For the given employee id, the payroll table's bonus column is multiplied by whatever get_adjustment_factor(p_emp_id) returns. The actual adjustment logic lives in get_adjustment_factor, a separate function not included in this body — I can describe the mechanics but not the business intent of the adjustment.",
    "referenced_properties": ["payroll.bonus", "payroll.emp_id", "get_adjustment_factor"]
  },
  "derived_from_edge": { "from": "RULE-XXXX", "to": "DB-0355", "type": "DERIVED_FROM" },
  "open_value_domain": false,
  "confidence": 0.4,
  "needs_escalation": true
}
```

`get_adjustment_factor` is the case worth escalating with that function's own
body as extra context — the same pattern as the `el` block's `flags[3]`.

If `body_ref` cannot be resolved to a real DDL/SQL location this step does not
run at all: an unresolvable `body_ref` fails `a5`'s exit gate, which is where
that failure belongs.

---

## Kind block: `computation`

```
This source is a method that computes a value. Unlike the other two kinds,
its branches ARE visible to the project's coverage tool — and the formula is
still not recoverable from test outcomes. A passing assertion that a total
equals 1234.56 constrains the arithmetic without stating it, and says nothing
about operand order, rounding mode, or which intermediate is deliberately
left unrounded. This formula is the only record of what the method computes.

State the formula using ONLY identifiers literally present in the method body
— parameters, fields, constants, and called methods. Do not simplify,
reorder, or normalize the arithmetic: multiplication order and where a
rounding call sits are load-bearing facts, not formatting.

rounding_mode and scale are stated together or are both null. Null means
"this computation does not round." If you cannot tell whether or how it
rounds, that is NOT a null — it is confidence below 0.5 and needs_escalation
true.

Set unrounded_intermediate true when the result is consumed elsewhere at full
precision, or when column_facts shows it feeds a column whose scale differs
from this formula's own.

Two extra fields are REQUIRED in rule_node for this kind, on top of the
shared shape: "formula", "rounding_mode", "scale". Include
"unrounded_intermediate" as well. And "method_name" is required at the top
level, beside source_node_id — a SVC node has many methods and the edge alone
does not say which one was lifted.
```

### Input template

```
source_kind: computation
source_node_id: {{svc_id}}
method_name: {{method_name}}
signature: {{signature}}
method_body: {{method_body}}
referenced_fields: {{referenced_fields}}
column_facts: {{column_facts}}     # precision/scale/value_domain of the DB
                                   # columns the referenced fields map to
```

### Example — confident, with a deliberate scale mismatch

```
source_kind: computation
source_node_id: SVC-0089
method_name: getWorkingDays
signature: public BigDecimal getWorkingDays()
method_body: "BigDecimal days = new BigDecimal(businessDaysBetween(startDate, endDate)); if (halfDay) { days = days.multiply(new BigDecimal(\"0.5\")); } return days.setScale(1, RoundingMode.HALF_UP);"
referenced_fields: [startDate, endDate, halfDay]
column_facts: { "LEAVE_REQUEST.WORKING_DAYS": { "precision": 5, "scale": 1 } }
```

```json
{
  "source_kind": "computation",
  "source_node_id": "SVC-0089",
  "method_name": "getWorkingDays",
  "rule_node": {
    "proposed_id": "RULE-XXXX",
    "kind": "rule",
    "label": "Working days in a leave request",
    "plain_language_description": "A request's working days are the business days between its start and end dates inclusive, halved when the half-day flag is set.",
    "formula": "businessDaysBetween(startDate, endDate) * (halfDay ? 0.5 : 1)",
    "rounding_mode": "HALF_UP",
    "scale": 1,
    "unrounded_intermediate": false,
    "referenced_properties": ["startDate", "endDate", "halfDay", "businessDaysBetween"]
  },
  "derived_from_edge": { "from": "RULE-XXXX", "to": "SVC-0089", "type": "DERIVED_FROM" },
  "open_value_domain": false,
  "confidence": 0.95,
  "needs_escalation": false
}
```

### Example — an unenumerated rate set

```
source_kind: computation
source_node_id: SVC-0142
method_name: grossFromNet
signature: public BigDecimal grossFromNet(BigDecimal net, String countryCode)
method_body: "BigDecimal rate = vatRates.get(countryCode); return net.multiply(BigDecimal.ONE.add(rate));"
referenced_fields: [vatRates]
column_facts: { "INVOICE_LINE.GROSS": { "precision": 12, "scale": 2 } }
```

```json
{
  "source_kind": "computation",
  "source_node_id": "SVC-0142",
  "method_name": "grossFromNet",
  "rule_node": {
    "proposed_id": "RULE-XXXX",
    "kind": "rule",
    "label": "Gross from net at a country VAT rate",
    "plain_language_description": "The gross amount is the net amount multiplied by one plus the VAT rate looked up for the given country code. The rate set itself is not in this method body.",
    "formula": "net * (1 + vatRates.get(countryCode))",
    "rounding_mode": null,
    "scale": null,
    "unrounded_intermediate": true,
    "referenced_properties": ["net", "countryCode", "vatRates"]
  },
  "derived_from_edge": { "from": "RULE-XXXX", "to": "SVC-0142", "type": "DERIVED_FROM" },
  "open_value_domain": true,
  "confidence": 0.9,
  "needs_escalation": false
}
```

High confidence and `open_value_domain: true` together are the correct answer
here, not a contradiction: the formula is stated exactly, and the rate roster
genuinely is not in the source. `unrounded_intermediate` is true because the
formula rounds to nothing while `INVOICE_LINE.GROSS` has scale 2 — the
mismatch is the finding, and an ORM's silent default is what it prevents.
