# Prompt: a3-lift-el-expression

Step contract: `steps/a3-lift-el-expression.yaml`. Output schema:
`schemas/a3-lift-el-expression.schema.json`.

## System / instruction text

```
You are lifting ONE raw JSF EL expression (or one BPMN gateway condition
expression) into a plain-language business rule description. This
expression is invisible to code-coverage tools, so this description is the
only record that this logic exists as an explicit rule. Do not invent
conditions that are not literally present in the expression — only describe
what the expression actually says, in plain language, using the property/
method names it references.

Return ONLY a single JSON object matching this shape (no prose, no markdown
fences):
{
  "source_node_id": "<copy the input node id exactly>",
  "rule_node": {
    "proposed_id": "RULE-XXXX",
    "kind": "rule",
    "label": "<short, plain-language name for this rule, <=8 words>",
    "plain_language_description": "<one or two sentences describing exactly
      what the expression evaluates and what effect it has (renders/hides/
      disables/requires/routes), using only names present in the expression>",
    "referenced_properties": ["<property or method names literally present
      in the raw expression>"]
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
attribute: {{attribute}}          # e.g. rendered, disabled, required, value, condition_expr
raw_expression: {{raw_expression}}
attached_component_id: {{attached_component_id}}
attached_screen: {{attached_screen}}
```

## Few-shot example 1 — confident lift

Input:
```
source_node_id: EL-0089
attribute: rendered
raw_expression: #{leaveRequestBean.status == 'PENDING_MANAGER_APPROVAL' and leaveRequestBean.currentUser.role == 'MANAGER'}
attached_component_id: approveButtonPanel
attached_screen: SCR-0142
```

Expected output:
```json
{
  "source_node_id": "EL-0089",
  "rule_node": {
    "proposed_id": "RULE-XXXX",
    "kind": "rule",
    "label": "Manager approval panel visibility",
    "plain_language_description": "The approval panel is shown only when the leave request's status is PENDING_MANAGER_APPROVAL and the current user's role is MANAGER.",
    "referenced_properties": ["leaveRequestBean.status", "leaveRequestBean.currentUser.role"]
  },
  "derived_from_edge": { "from": "RULE-XXXX", "to": "EL-0089", "type": "DERIVED_FROM" },
  "confidence": 0.95,
  "needs_escalation": false
}
```

## Few-shot example 2 — low confidence, escalation-worthy

Input:
```
source_node_id: EL-0114
attribute: rendered
raw_expression: #{bean.flags[3] and !util.isLegacyMode(bean)}
attached_component_id: legacyWarningBanner
attached_screen: SCR-0201
```

Expected output:
```json
{
  "source_node_id": "EL-0114",
  "rule_node": {
    "proposed_id": "RULE-XXXX",
    "kind": "rule",
    "label": "Banner shown by flag index 3 and legacy mode check",
    "plain_language_description": "The banner is shown when flags[3] is true and util.isLegacyMode(bean) is false. The meaning of flags[3] and isLegacyMode is not recoverable from this expression alone — I can describe the mechanics but not the business intent.",
    "referenced_properties": ["bean.flags[3]", "util.isLegacyMode(bean)"]
  },
  "derived_from_edge": { "from": "RULE-XXXX", "to": "EL-0114", "type": "DERIVED_FROM" },
  "confidence": 0.4,
  "needs_escalation": true
}
```

## Notes for the orchestrator

- `flags[3]` in example 2 is exactly the kind of case worth retrying with
  the bean's full field list (what `flags` actually enumerates) rather than
  accepting a mechanically-accurate-but-meaningless description.
