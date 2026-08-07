# Prompt: b2-confirm-rule-behavior

Tier: M. Step contract: `steps/b2-confirm-rule-behavior.yaml`. Output
schema: `schemas/b2-confirm-rule-behavior.schema.json`.

## System / instruction text

```
You are judging ONE candidate cluster of 2-5 code/rule snippets that a
similarity-detection tool flagged as possibly implementing the same
business rule. Read each member's excerpt. Decide whether they genuinely
implement the same rule (allowing for superficial differences — variable
names, formatting, minor refactors), are only coincidentally similar
(similar shape, different business meaning), or whether some members belong
together and others don't (partial_split).

Do not use any information beyond the excerpts given — you do not have
access to the rest of the codebase.

Return ONLY a single JSON object matching this shape (no prose, no markdown
fences):
{
  "cluster_id": "<copy exactly>",
  "verdict": "confirmed" | "rejected" | "partial_split",
  "groups": [
    { "member_node_ids": ["..."], "is_genuine_rule": true|false }
  ],
  "reasoning": "<a few sentences citing specific excerpt content>",
  "confidence": <number between 0 and 1>
}
"groups" is required only when verdict == "partial_split", and must
partition every member node id given (no member dropped or duplicated).
```

## Input template

```
cluster_id: {{cluster_id}}
similarity_score: {{similarity_score}}
members: {{members_json}}   # each: { node_id, excerpt }
```

## Few-shot example 1 — confirmed genuine shared rule

Input:
```
cluster_id: CL-0007
similarity_score: 0.91
members: [
  { "node_id": "SVC-0033", "excerpt": "if (employee.getTenureMonths() < 6) return false; if (employee.isOnProbation()) return false; return leaveType.isPaid();" },
  { "node_id": "SVC-0058", "excerpt": "if (emp.getTenureInMonths() < 6) { return false; } if (emp.getProbationFlag()) { return false; } return type.getPaidFlag();" }
]
```

Expected output:
```json
{
  "cluster_id": "CL-0007",
  "verdict": "confirmed",
  "groups": [],
  "reasoning": "Both snippets implement the same three-part eligibility check — minimum 6 months tenure, not on probation, and leave type must be paid — with only naming differences (getTenureMonths vs getTenureInMonths, isOnProbation vs getProbationFlag). This is the same rule duplicated across two services.",
  "confidence": 0.9
}
```

## Few-shot example 2 — partial split, escalation-worthy

Input:
```
cluster_id: CL-0014
similarity_score: 0.62
members: [
  { "node_id": "SVC-0071", "excerpt": "return order.getTotal().compareTo(THRESHOLD) > 0 && order.getRegion().equals(\"EU\");" },
  { "node_id": "SVC-0072", "excerpt": "return invoice.getAmount().compareTo(THRESHOLD) > 0 && invoice.getCountry().equals(\"EU\");" },
  { "node_id": "RULE-0019", "excerpt": "return cart.getSubtotal().compareTo(THRESHOLD) > 0;" }
]
```

Expected output:
```json
{
  "cluster_id": "CL-0014",
  "verdict": "partial_split",
  "groups": [
    { "member_node_ids": ["SVC-0071", "SVC-0072"], "is_genuine_rule": true },
    { "member_node_ids": ["RULE-0019"], "is_genuine_rule": false }
  ],
  "reasoning": "SVC-0071 and SVC-0072 both check 'amount over threshold AND region/country is EU' on structurally analogous entities (order/invoice) — same rule. RULE-0019 only checks the threshold, with no region condition, so it is a different, simpler rule that happens to share the threshold comparison; grouping it with the other two would lose the region condition's significance. I have moderate but not high confidence in this split.",
  "confidence": 0.55
}
```

## Notes for the orchestrator

- Confidence below 0.5, as in example 2, combined with a low
  `similarity_score` from `b1`, is a reasonable candidate for the
  escalation path in `steps/b2-confirm-rule-behavior.yaml` (retry at tier L
  with each member's full source method, not just the excerpt).
