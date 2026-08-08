# Prompt: a7-lift-computation

Step contract: `steps/a7-lift-computation.yaml`. Output schema:
`schemas/a7-lift-computation.schema.json`.

## System / instruction text

```
You are lifting ONE method that computes a value into an explicit formula.
The method's branches are visible to the project's coverage tool, but the
formula itself is not recoverable from test outcomes: a passing assertion
that a total equals 1234.56 constrains the arithmetic without stating it,
and says nothing about operand order, rounding mode, or which intermediate
value is deliberately left unrounded. This formula is the only record of
what the method actually computes.

State the formula using ONLY identifiers literally present in the method
body — parameters, fields, constants, and called methods. Do not simplify,
reorder, or normalize the arithmetic: multiplication order and where a
rounding call sits are load-bearing facts, not formatting.

rounding_mode and scale are stated together or are both null. Null means
"this computation does not round." If you cannot tell whether or how it
rounds, that is not a null — it is confidence below 0.5 and
needs_escalation true.

Set unrounded_intermediate true when the result is consumed elsewhere at
full precision, or when column_facts shows the result feeds a column whose
scale differs from this formula's own.

Set open_value_domain true when the formula reads from a set the body does
not enumerate — a rate table, a supported-currency list, a lookup by key
whose possible keys are not visible here.

Return ONLY a single JSON object matching this shape (no prose, no markdown
fences):
{
  "source_node_id": "<copy the input svc_id exactly>",
  "method_name": "<copy the input method_name exactly>",
  "rule_node": {
    "proposed_id": "RULE-XXXX",
    "kind": "rule",
    "label": "<short, plain-language name for this computation, <=8 words>",
    "plain_language_description": "<one or two sentences: what this value
      means in business terms and when it is computed>",
    "formula": "<the computation, in identifiers from the body>",
    "rounding_mode": "<HALF_UP | FLOOR | ... or null>",
    "scale": <integer or null>,
    "unrounded_intermediate": <true or false>,
    "referenced_properties": ["<parameter/field/constant names literally
      present in the body>"]
  },
  "derived_from_edge": { "from": "RULE-XXXX", "to": "<svc_id>", "type": "DERIVED_FROM" },
  "open_value_domain": <true or false>,
  "confidence": <number between 0 and 1>,
  "needs_escalation": <true or false>
}
Use the literal placeholder "RULE-XXXX" for proposed_id — the orchestrator
assigns the real ID number; do not guess a number.
```

## Input template

```
svc_id: {{svc_id}}
method_name: {{method_name}}
signature: {{signature}}
method_body: {{method_body}}
referenced_fields: {{referenced_fields}}
column_facts: {{column_facts}}     # precision/scale/value_domain of the DB
                                   # columns those fields map to
```

## Few-shot example 1 — confident lift, rounding stated

Input:
```
svc_id: SVC-0210
method_name: total
signature: BigDecimal total(Requisition req)
method_body: "BigDecimal sum = BigDecimal.ZERO; for (RequisitionLine l : req.getLines()) { sum = sum.add(l.getLineTotal()); } return sum.setScale(2, RoundingMode.FLOOR);"
referenced_fields: ["Requisition.lines", "RequisitionLine.lineTotal"]
column_facts: {"REQUISITION.TOTAL": {"precision": 19, "scale": 2}}
```

Expected output:
```json
{
  "source_node_id": "SVC-0210",
  "method_name": "total",
  "rule_node": {
    "proposed_id": "RULE-XXXX",
    "kind": "rule",
    "label": "Requisition gross total",
    "plain_language_description": "A requisition's authoritative total is the sum of every one of its lines' line totals, truncated downward to two decimal places.",
    "formula": "sum(line.getLineTotal() for line in req.getLines()), then setScale(2, FLOOR)",
    "rounding_mode": "FLOOR",
    "scale": 2,
    "unrounded_intermediate": false,
    "referenced_properties": ["Requisition.getLines", "RequisitionLine.getLineTotal", "RoundingMode.FLOOR"]
  },
  "derived_from_edge": { "from": "RULE-XXXX", "to": "SVC-0210", "type": "DERIVED_FROM" },
  "open_value_domain": false,
  "confidence": 0.95,
  "needs_escalation": false
}
```

## Few-shot example 2 — the scale mismatch that scenarios do not catch

Input:
```
svc_id: SVC-0210
method_name: getLineTotal
signature: BigDecimal getLineTotal()
method_body: "return quantity.multiply(unitPrice).multiply(BigDecimal.ONE.add(vatRate));"
referenced_fields: ["RequisitionLine.quantity", "RequisitionLine.unitPrice", "RequisitionLine.vatRate"]
column_facts: {"REQUISITION_LINE.UNIT_PRICE": {"precision": 19, "scale": 6}, "REQUISITION_LINE.VAT_RATE": {"precision": 19, "scale": 6}}
```

Expected output:
```json
{
  "source_node_id": "SVC-0210",
  "method_name": "getLineTotal",
  "rule_node": {
    "proposed_id": "RULE-XXXX",
    "kind": "rule",
    "label": "Line total including VAT",
    "plain_language_description": "A requisition line's total is its quantity times its unit price, grossed up by its VAT rate. It is not rounded here: the sum of these values is what the requisition total later truncates, so rounding each line first would change the result.",
    "formula": "quantity * unitPrice * (1 + vatRate)",
    "rounding_mode": null,
    "scale": null,
    "unrounded_intermediate": true,
    "referenced_properties": ["quantity", "unitPrice", "vatRate"]
  },
  "derived_from_edge": { "from": "RULE-XXXX", "to": "SVC-0210", "type": "DERIVED_FROM" },
  "open_value_domain": false,
  "confidence": 0.9,
  "needs_escalation": false
}
```

## Few-shot example 3 — low confidence, delegated computation

Input:
```
svc_id: SVC-0244
method_name: convertedAmount
signature: BigDecimal convertedAmount(Invoice inv)
method_body: "return inv.getAmount().multiply(rateProvider.rateFor(inv.getCurrency())).setScale(2, RoundingMode.HALF_UP);"
referenced_fields: ["Invoice.amount", "Invoice.currency"]
column_facts: {"INVOICE.AMOUNT": {"precision": 19, "scale": 2, "value_domain": null}}
```

Expected output:
```json
{
  "source_node_id": "SVC-0244",
  "method_name": "convertedAmount",
  "rule_node": {
    "proposed_id": "RULE-XXXX",
    "kind": "rule",
    "label": "Invoice amount converted to base currency",
    "plain_language_description": "An invoice's converted amount is its amount multiplied by the rate rateProvider returns for its currency, rounded half-up to two decimals. The rate source and the set of currencies it accepts are not in this body.",
    "formula": "inv.getAmount() * rateProvider.rateFor(inv.getCurrency()), then setScale(2, HALF_UP)",
    "rounding_mode": "HALF_UP",
    "scale": 2,
    "unrounded_intermediate": false,
    "referenced_properties": ["Invoice.getAmount", "Invoice.getCurrency", "rateProvider.rateFor"]
  },
  "derived_from_edge": { "from": "RULE-XXXX", "to": "SVC-0244", "type": "DERIVED_FROM" },
  "open_value_domain": true,
  "confidence": 0.45,
  "needs_escalation": true
}
```

## Notes for the orchestrator

- Example 3 escalates per `steps/a7-lift-computation.yaml`: retry with
  `rateProvider.rateFor`'s own body included. `open_value_domain` stays true
  even after a successful retry if the currency set still isn't enumerated
  anywhere — that seeds an open-questions entry, which is the correct
  outcome, not a failure to resolve.
- Example 2's `unrounded_intermediate: true` is the finding, not a defect:
  the pack should state that lines are summed at full precision and rounded
  once, because an implementer who rounds per line will pass every scenario
  whose figures don't happen to expose the difference.
- If the flagged method turns out to perform I/O after all (the AST flag was
  wrong), return `confidence: 0` with `needs_escalation: true` rather than
  describing a formula — the fix is in the extractor's flagging rule, not
  here.
