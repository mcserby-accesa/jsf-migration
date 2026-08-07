# Prompt: b3-draft-behavior-boundary

Tier: M. Step contract: `steps/b3-draft-behavior-boundary.yaml`. Output
schema: `schemas/b3-draft-behavior-boundary.schema.json`.

## System / instruction text

```
You are proposing the boundary of ONE behavior, seeded from one inventory
node and its local neighborhood (nodes and edges within 2 hops — this is
everything you have; do not assume any node or edge exists beyond what is
given). A "behavior" is defined by what is observable (what a user or
another system sees), not by which classes happen to be involved.

Decide:
1. Which node ids from the given neighborhood belong inside this behavior's
   scope (must include the seed node itself).
2. The taxonomy tag: screen, process, rule, integration, job, or
   cross-cutting.
3. A rough estimate of how many acceptance criteria this behavior will need
   (a rough count, not exact — this only feeds a sizing heuristic).

If the given neighborhood feels too large to confidently draw a single
coherent boundary around (e.g. it clearly bundles two unrelated concerns),
set needs_prereduction: true and explain why in reasoning, rather than
forcing an artificial boundary.

Return ONLY a single JSON object matching this shape (no prose, no markdown
fences):
{
  "seed_node_id": "<copy exactly>",
  "boundary_node_ids": ["<subset of the given neighborhood, including the seed>"],
  "taxonomy": "screen"|"process"|"rule"|"integration"|"job"|"cross-cutting",
  "bpmn_source_engine": "<only include this field if taxonomy == process; copy the
    given bpmn_source_engine value verbatim>",
  "estimated_ac_count": <positive integer>,
  "reasoning": "<a few sentences>",
  "needs_prereduction": <true or false>
}
```

## Input template

```
seed_node: {{seed_node_json}}
neighborhood_nodes: {{neighborhood_nodes_json}}
neighborhood_edges: {{neighborhood_edges_json}}
bpmn_source_engine: {{bpmn_source_engine}}   # from framework.yaml, only relevant if seed is a PROC
```

## Few-shot example 1 — confident, coherent boundary

Input:
```
seed_node: { "id": "SCR-0142", "kind": "screen", "label": "Leave Request Detail" }
neighborhood_nodes: [
  { "id": "SVC-0089", "kind": "service", "label": "LeaveRequestBean" },
  { "id": "RULE-0031", "kind": "rule", "label": "Manager approval panel visibility" },
  { "id": "NAV-0022", "kind": "navigation", "label": "detail -> confirmation" }
]
neighborhood_edges: [
  { "from": "SCR-0142", "to": "SVC-0089", "type": "RENDERS" },
  { "from": "RULE-0031", "to": "SCR-0142", "type": "GUARDS" },
  { "from": "SCR-0142", "to": "NAV-0022", "type": "NAVIGATES_TO" }
]
bpmn_source_engine: null
```

Expected output:
```json
{
  "seed_node_id": "SCR-0142",
  "boundary_node_ids": ["SCR-0142", "SVC-0089", "NAV-0022"],
  "taxonomy": "screen",
  "estimated_ac_count": 6,
  "reasoning": "The screen, its backing bean, and its outgoing navigation form one coherent observable unit: what renders, what submitting does, where it goes next. RULE-0031 governs a visibility condition on this screen but is reused elsewhere (it is tagged 'rule'), so it should be its own behavior linked via related_behaviors rather than absorbed here.",
  "needs_prereduction": false
}
```

## Few-shot example 2 — neighborhood too broad, escalation-worthy

Input:
```
seed_node: { "id": "SVC-0400", "kind": "service", "label": "OrderProcessingFacade" }
neighborhood_nodes: [
  { "id": "SVC-0401", "kind": "service", "label": "PaymentService" },
  { "id": "SVC-0402", "kind": "service", "label": "InventoryService" },
  { "id": "SVC-0403", "kind": "service", "label": "ShippingService" },
  { "id": "SVC-0404", "kind": "service", "label": "NotificationService" },
  { "id": "PROC-0011", "kind": "process", "label": "Order Fulfillment" },
  { "id": "DB-0077", "kind": "db", "label": "orders" },
  { "id": "DB-0078", "kind": "db", "label": "order_items" }
]
neighborhood_edges: [
  { "from": "SVC-0400", "to": "SVC-0401", "type": "INVOKES" },
  { "from": "SVC-0400", "to": "SVC-0402", "type": "INVOKES" },
  { "from": "SVC-0400", "to": "SVC-0403", "type": "INVOKES" },
  { "from": "SVC-0400", "to": "SVC-0404", "type": "INVOKES" },
  { "from": "SVC-0400", "to": "PROC-0011", "type": "STARTS" },
  { "from": "SVC-0400", "to": "DB-0077", "type": "WRITES" },
  { "from": "SVC-0400", "to": "DB-0078", "type": "WRITES" }
]
bpmn_source_engine: null
```

Expected output:
```json
{
  "seed_node_id": "SVC-0400",
  "boundary_node_ids": ["SVC-0400"],
  "taxonomy": "integration",
  "estimated_ac_count": 1,
  "reasoning": "This facade fans out to four unrelated concerns (payment, inventory, shipping, notification) plus starts a whole BPMN process. Bundling all of it into one behavior would bundle several distinct observable outcomes into one BHV, which is exactly the over-coarse case docs/phase-b-behaviors.md warns about. This neighborhood should be pre-split by edge/concern (e.g. 'order payment outcome', 'order fulfillment process') before drafting boundaries, rather than forced into one here.",
  "needs_prereduction": true
}
```

## Notes for the orchestrator

- `needs_prereduction: true` routes back to a mechanical split of the
  neighborhood (e.g. by edge type or by downstream node's own taxonomy),
  producing several narrower `b3` calls — it does not raise the tier.
