# Phase B — Behaviors

Goal: turn the Phase A inventory graph into a set of `BHV-####` specifications
— the units of migration work — each anchored on observable behavior, sized
sanely, and provably covering every inventory node.

Phase B requires a Phase A graph that has passed `a5-validate-inventory`.

## What a behavior is

A behavior is something a user or another system can observe: a screen's
outcomes for given inputs, a process's completion states, a rule's verdict,
a job's side effects, an integration's contract. A behavior is **not**
"the migration of class `X`" — a single behavior typically spans several
inventory nodes (a `SCR`, the `SVC` it renders, the `RULE`s that gate its
fields, the `NAV` edges leading in and out of it), and a single inventory
node can be referenced by more than one behavior only through an explicit
shared-`RULE` link (see "Overlap" below).

### Taxonomy

| Tag | Seeded from | Typical shape |
|---|---|---|
| `screen` | One `SCR` node | A JSF page's visible behavior: what renders, what's enabled/required, what submitting does, where navigation goes |
| `process` | One `PROC` node | A BPMN process's lifecycle: entry conditions, task sequencing, gateway decisions, completion/termination states |
| `rule` | A confirmed clone/similarity cluster, or a promoted `RULE` node used by ≥2 behaviors | Logic reused across screens/services — validation, eligibility, calculation. **These are the behaviors teams most often miss**, because nothing about reading one screen's code reveals that its validation is shared with four others. |
| `integration` | One or more `SVC` nodes at a system boundary (external API client/server, file/batch interface) | A contract with something outside this application |
| `job` | One `JOB` node | A scheduled task's trigger condition and side effects |
| `cross-cutting` | Config/infrastructure nodes with observable effect (e.g. a global exception-handling `CFG`, an auth filter) | Behavior that isn't tied to one screen/process but is still observable |

A behavior is assigned exactly one taxonomy tag. If a candidate behavior
seems to need two, it is a signal to split it (see Sizing) or that one of the
two aspects belongs in a separate `rule` behavior it should link to instead
of absorb.

## Drafting behaviors: two distinct paths

### Path 1 — screen / process / job / integration / cross-cutting

Seeded directly from one inventory node (`SCR`/`PROC`/`JOB`/etc.) plus its
**bounded local subgraph**: outgoing/incoming edges up to 2 hops, hard cap.
If the 2-hop neighborhood exceeds what fits in one bounded LLM call (see
`DECISIONS.md` principle 4 on input bounding), the neighborhood is pre-split
mechanically — e.g. by edge type, drafting the "screen + its rule gates" and
the "screen + its downstream service calls" as separate candidate boundaries
for the same seed node — before the LLM ever sees it, rather than raising the
a bigger model.

`steps/b3-draft-behavior-boundary.yaml` proposes: which nodes in the
bounded neighborhood belong inside this behavior's scope, the taxonomy tag,
and a rough AC-count estimate used by the sizing check. `steps/b4-write-
behavior-spec.yaml` then drafts the actual `BHV-####.md` body
(description, scenario stubs with `legacy_refs`) from the confirmed boundary
— see `templates/BHV-template.md` for the exact structure it must fill in.

### Neighborhood diagram

Alongside `b3`, a deterministic script renders the same bounded neighborhood
(the `neighborhood_nodes`/`neighborhood_edges` `b3` was given as input) as a
Mermaid graph and attaches it to the drafted `BHV-####.md` as
`neighborhood_diagram`. The mapping is specified in
`templates/renderers/mermaid.md` (family 1), alongside the pack's three other
diagram families — they share their id sanitisation, escaping, ordering and
capping rules. This is mechanical, not an LLM judgment — the
neighborhood is already capped at 2 hops for `b3`'s sake, which happens to
also be exactly the size a diagram stays legible at. There is no
whole-inventory diagram anywhere in this framework: at real application
scale (thousands of nodes) it would be both illegible and likely past
Mermaid's practical rendering limits. A whole-graph question is a query
against `graph_store`, not a picture. See `DECISIONS.md`.

### Risk tier

Every behavior is assigned a `risk_tier` — `full` or `sampled` — that Phase
C's `c5` triage gate keys off of (`docs/metrics.md` #3). Assignment is
mechanical, done by `b5` alongside sizing/density: `taxonomy in {rule,
process}` → `full`; every other taxonomy → `sampled`, unless a human sets
`high_risk_override: true` on the `BHV` (money, authorization, or
state-transition logic the taxonomy lookup wouldn't otherwise catch — e.g. a
`screen` behavior that commits a payment). The override is the only
non-mechanical input into this decision, and it is a human call made by
reading the drafted behavior, not a step this framework runs.

### Path 2 — rule behaviors (reused logic)

Rule behaviors are not seeded from a single node, because nothing in the
inventory graph *says* "this logic is duplicated" — that is exactly the kind
of global-reasoning question this framework refuses to hand a small model
directly. Instead:

1. `steps/b1-detect-rule-similarity-candidates.yaml` (script, not LLM): a
   clone-detection/AST-similarity tool scans `SVC` method bodies and `EL`-
   lifted `RULE` stubs for near-duplicate logic, producing candidate clusters
   of 2–5 nodes each with a similarity score.
2. `steps/b2-confirm-rule-behavior.yaml`: given **one candidate
   cluster** (the 2–5 snippets and their node IDs — bounded, not "the
   codebase"), confirm it as a genuine shared rule behavior, reject it as a
   coincidental similarity, or flag it for a split (some members belong, some
   don't).

This is the general pattern for any step that looks like it needs global
reasoning: reduce mechanically first, confirm per-candidate second. See
each step's `escalate:` block.

Confirmed rule clusters proceed through `b4` the same as any other behavior
draft, tagged `rule`, with `DERIVED_FROM`/`GUARDS` edges already present from
Phase A's `a3` lift step providing the traceability back to every screen the
rule gates.

## Sizing

Split a behavior when either threshold is crossed:

- More than ~15 acceptance criteria (checked once Phase C's `c1` has drafted
  ACs — `b5` re-checks after `c1` returns, not just at drafting time, since
  the AC-count estimate in `b3` is an estimate).
- More than a few hundred legacy LOC across its covered nodes' `legacy_refs`
  spans.

A split behavior keeps both halves' node coverage disjoint except for shared
`RULE` links (see Overlap). Splitting is a re-run of `b3`/`b4` on a narrower
node subset, not a manual rewrite — this keeps the split behaviors' coverage
provably still complete against the original node set.

## Scenario-density check

`scenarios(BHV) / ΣCC(BHV)`. See `docs/metrics.md` for the exact band,
threshold actions, the ΣCC-below-5 exemption, and the expiry rule (this
metric is a proxy used before measured legacy branch coverage exists for a
behavior; once Phase C's `c4` produces real coverage for it, the ratio is
no longer computed or acted on for that behavior).

## Overlap and the completeness check

Two behaviors may both `COVERS` the same `RULE` node — that is the expected
shape for shared logic (a `rule` behavior plus every `screen` behavior that
uses it, linked, not duplicated). Two behaviors overlapping on a `SCR`/`SVC`/
`PROC` node, however, signals a bad boundary split and must be resolved
before Phase B closes.

**Completeness gate (`b5`, deterministic):** every node in `nodes.jsonl` with
`status: "active"` must have at least one `COVERS` edge from some `BHV`. A
node with zero `COVERS` edges is either:

- linked to an existing or new behavior, or
- explicitly marked out-of-scope with a written reason (e.g. genuinely dead
  code confirmed in Phase A, or infrastructure with no observable behavior)
  in the same triage-log mechanism Phase C uses for uncovered branches (see
  `docs/phase-c-acceptance.md`) — an inventory node cannot silently vanish
  from the migration scope any more than a coverage branch can.

Phase B does not close out for an application until this gate passes at
100% (see `docs/metrics.md`, "Inventory coverage"). Note this is a distinct
100% gate from Phase C's branch-coverage triage — this one counts inventory
*nodes* linked to a behavior, not legacy *branches* triaged, and it is not
risk-tiered: every node still needs a `COVERS` edge or an explicit
out-of-scope reason, regardless of the behavior's `risk_tier`.
