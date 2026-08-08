# Method

This is the migration method end to end, with the reasoning behind each
choice. Read this first; the per-phase docs go deeper on each phase.

## The problem this method is designed against

Legacy-to-modern migrations built around "re-read the old code and rewrite
it" fail in two specific, predictable ways:

- **Silent loss of business rules** that live outside the obvious
  controller/service classes — validation reused across three screens,
  a defensive branch nobody remembers the reason for, an EL expression that
  hides a field unless a config flag and a role and a status all line up.
  Nobody notices the loss until production.
- **Untestable rewrites** — the new system is declared "done" against specs
  that were themselves written by reading the old code just before writing
  the new code, so the spec and the implementation share the same blind
  spots and confirm each other.

This method attacks both by inserting two disciplines between "read the old
system" and "write the new one": a **script-generated, complete inventory**
(so nothing is missed because nobody happened to open that file), and a
**behavior spec validated against measured legacy coverage** (so "done"
means "provably exercises the same branches the legacy system exercises,"
not "looks similar to what I read").

## The four non-negotiables

1. **Behavior, not classes.** A `BHV-####` is defined by what a user or
   another system observes — a screen's outcomes, a process's completion
   states, a rule's verdict for given inputs. It is never "the migration of
   `OrderServiceBean`." The legacy code graph built in Phase A exists to let
   you *prove* every behavior's coverage against that graph — it is the
   traceability index, not the unit of work.
2. **Script first, LLM second.** Every legacy node and edge that Phase A
   introduces into the graph is produced by a deterministic extractor: AST
   walkers, DOM parsers, DB catalog introspection, config-file parsers. An
   LLM never proposes "here's a class I found" — it only ever confirms or
   interprets something the script already found and flagged as ambiguous.
   This is what makes the inventory complete and re-runnable: run the
   extractors again after a legacy hotfix and get a diffable delta, not a
   fresh, differently-biased read-through.
3. **One canonical spec, rendered outward.** A `BHV-####.md` document is the
   only place acceptance criteria are authored. Gherkin `.feature` files and
   JUnit skeletons are generated from it by a deterministic renderer (see
   `templates/renderers/`). If a team needs both formats, they get both from
   one spec — never a Gherkin file hand-ported to JUnit that silently drifts
   from it three sprints later.
4. **Bounded steps.** Every LLM call is scoped to one file or one node or
   one behavior as input, one judgment, a schema-validated JSON output,
   few-shot examples in the prompt, and a defined retry path if it keeps
   failing. This is not a cost optimization bolted on afterward — it is why
   the phases are decomposed the way they are. Any step that seems to need
   "read the whole codebase and figure out what's reusable" gets mechanically
   pre-reduced (clone detection, AST similarity) into bounded per-candidate
   confirmations first.

   The payoff is that a small, cheap model can run the entire pipeline
   correctly. The framework does **not** say which model to use — steps
   declare `kind: llm` or `kind: script`, and the rest is the implementing
   team's choice (see `DECISIONS.md`).

## The pipeline, phase by phase

```
Phase 0    Phase 0b       Phase A           Phase B          Phase C            Phase D
Env.   ->  Walking    ->  Inventory    ->   Behaviors   ->   Acceptance   ->    Spec
(entry     skeleton       (script-built     (BHV-####.md,    (AC, decision      validation
gate)      (one BHV       graph, LLM only   clustered &      tables, coverage   (browser-driven,
           end-to-end,    for ambiguous     sized)           triage, API        against legacy)
           hard gate)     cases)                             contract)
                                                                  |
                                                                  v
                                                            the spec pack
                                                         (docs/spec-pack.md)
```

The output is the **spec pack**: one directory describing the legacy
application completely enough to rebuild it without opening the legacy
source. Building the replacement is *not* part of this framework — see
`DECISIONS.md`, "explicitly out of scope." Phase D validates the pack against
the legacy app; it does not touch the new one. Its step contracts are
designed but not yet authored.

### Phase 0 — Environment (entry gate)

Before any extractor runs, the legacy application must boot with
representative data. This is a gate, checked once per application, not a
step that repeats per behavior. See `docs/phase-0-environment.md`. Skipping
it doesn't save time — it just moves the failure into Phase A, where a
"missing" node is indistinguishable from a node the extractor genuinely
couldn't reach.

### Phase 0b — Walking skeleton (entry gate)

Also before Phase A runs at volume: one behavior, hand-carried through
`c1 → c3 → c4`, must actually produce attributable legacy coverage. This is
the framework's own riskiest assumption (that the completeness oracle can
run at all against this application) validated first, not after months of
spec production. See `docs/phase-0b-walking-skeleton.md`.

### Phase A — Inventory

Deterministic extractors walk the legacy source, the JSF views, the
`faces-config.xml` navigation rules, the database catalog (tables, triggers,
stored procedures), the BPMN process definitions, and the scheduler
configuration, producing `nodes.jsonl` and `edges.jsonl`. Anything the
extractor can classify with certainty (a `faces-config` navigation rule is
unambiguously a `NAV` node) is written straight through. Anything ambiguous
(is this managed bean a screen controller or a shared cross-cutting helper?)
is flagged and routed to a single LLM call that sees exactly that one node
and its immediate static facts — never the surrounding codebase.

EL expressions get special handling: JaCoCo cannot see them, so every
`rendered`/`disabled`/`required`/`value` EL expression attached to a JSF
component is extracted as a raw `EL` node and then *lifted* by one LLM call
into a plain-language rule description, becoming a candidate `RULE`
node. This is the mechanism that keeps view-layer logic from disappearing
from the spec. Database trigger and procedure bodies get the same treatment
(`a6`), for the same reason.

Computation methods get it too (`a7`), for a different reason worth stating
separately: a formula *is* visible to JaCoCo, and coverage still doesn't
recover it. Knowing every branch of `total()` ran says nothing about the
operand order, the rounding mode, or which intermediate is deliberately left
unrounded — the scenarios sample the function at a few points, and the
implementer has to rebuild the function. Alongside the formulas, Phase A
extracts the other facts no amount of observed behavior recovers: numeric
precision and scale, enumerated value domains, hardcoded constants,
converter locales and patterns, and literal on-screen wording. See
`docs/phase-a-inventory.md`, "Value facts."

And Phase A extracts the **layout**: the container tree of every screen — its
grids, tabs, accordions, and toolbars, in document order, with the rule that
conditions each one's rendering — plus the template each view composes into
and the navigation menu that template owns. This is not visual fidelity, and
the distinction is the whole of it: whether eighteen fields sit in two
columns or stack, and whether a screen is a three-tab wizard or one long
scroll, are structural facts about the legacy application, while spacing and
colour are target-design decisions that mostly aren't in the application's
source anyway. Filing the first under the second is how the framework's own
first pilot produced a rebuild with no layout at all. Each tree is rendered
into a text wireframe, and a final step (`a8`) drives the booted application
and photographs each screen as a reference nothing in the pack depends on.
See `docs/phase-a-inventory.md`, "Layout," and `DECISIONS.md`.

Phase A ends with a deterministic validator (`a5`): every edge's endpoints
must resolve to real node IDs, every `legacy_refs` entry must resolve to a
real `file:line`, every structural skeleton, layout tree and value fact is
present, every screen is either photographed or accounted for, and the
application has exactly one stated identity model. A graph that fails
this validator does not proceed to Phase B. See
`docs/phase-a-inventory.md`.

### Phase B — Behaviors

Behaviors are drafted from the inventory graph, never from scratch. Two
distinct paths:

- **Screen / process / job / integration behaviors** are seeded from one
  `SCR`/`PROC`/`JOB` node and its bounded local subgraph (2-hop cap — see
  `steps/b3-draft-behavior-boundary.yaml`). A model drafts the
  boundary (which nodes belong to this behavior) and the spec body.
- **Rule behaviors** — the ones teams miss, because they are reused logic,
  not a screen — are found mechanically first. A clone/AST-similarity
  detector proposes candidate clusters of near-identical logic across
  screens/services (`b1`, a script step). A model then confirms or
  rejects *each candidate in isolation* (`b2`) — it never searches for
  duplication itself, it only judges a candidate it's handed.

Every drafted behavior runs through the sizing and density checks (`b5`):
AC count and legacy LOC against the split threshold, and — once ΣCC(BHV) is
at least 5 — the scenario-density ratio. See `docs/phase-b-behaviors.md` and
`docs/metrics.md` for the exact thresholds and what each violation triggers.

Phase B's completeness gate: every inventory node from Phase A must resolve
to at least one behavior (`covers` edge). An orphan node is either linked, or
explicitly triaged as dead/out-of-scope — it cannot silently disappear.

### Phase C — Acceptance

For each behavior, acceptance criteria are drafted grounded in its
`legacy_refs` (`c1`). Rule behaviors with compound boolean conditions get a
decision table instead of prose ACs, because CC alone cannot represent MC/DC
coverage (`c2`); where the table's dimensions are configuration values rather
than logic branches, pairwise reduction (PICT/ACTS) cuts the table down to a
tractable, still-covering set (`c2b`).

The AC/decision-table content is then rendered — mechanically, per
`framework.yaml`'s `spec_format` — into Gherkin and/or JUnit (`c3`), and the
rendered files are parsed with a real parser to prove they load (`c3b`;
deterministic rendering and loadable output are different claims, and only
the first follows from the mapping). Rendered tests run against the *legacy*
application under coverage instrumentation (`c4`). Every branch the legacy app can reach that the rendered tests didn't
exercise gets triaged into exactly one bucket: missing scenario, dead code,
or unreachable-defensive (`c5` — one branch, one judgment). The
resulting triage log is itself a deliverable: it is the evidence that the
spec is complete relative to the legacy system's actual behavior, not just
relative to what a human remembered to write down.

Phase C also derives the **REST API contract** for the replacement, from the
extracted page and service skeletons plus a human-authored conventions file
(`c7`/`c8`). This is the only place the framework describes the new system
rather than the old one, and it earns the exception because two
independently-built sides — the Angular client and the Spring backend — must
agree on it or fail at integration. Emitting it once as OpenAPI and
generating both sides from that document removes the disagreement entirely.
See `docs/spec-pack.md`.

The same argument extends one step further, to `c7b`. A legacy scenario is
written in a page-based system's terms — a served page, an href navigation,
a domain-object call — and much of that has no equivalent in a JSON API. The
translation is unavoidable; making it fifty separate times at implementation
time, unrecorded, is not. `c7b` binds every scenario to where the target can
observe it, once, against the derived contract.

### Phase D — Spec validation

Phase C's coverage oracle runs at the `service` seam, so it never renders a
page. That means every EL expression lifted in Phase A, and every navigation
rule, is specified and then executed by nothing. Phase D closes that: derived
tests driven through a browser against the legacy application, checking the
specs against what the app actually does. Designed, not yet authored — see
`DECISIONS.md`.

## What "done" means for a behavior

A `BHV-####` is done when:

1. Its frontmatter and scenarios validate against `schemas/bhv.schema.json`.
2. It sits within the sizing and density bands, or has a documented,
   justified exception.
3. Every inventory node it claims to cover is linked, and it does not
   overlap another behavior's coverage without an explicit shared-`RULE`
   link.
4. Its rendered tests load under a real parser, and — run against the legacy
   app — leave no untriaged branch.
5. Every one of its scenarios has a recorded observation surface, and every
   scenario documenting a known legacy defect has a recorded disposition.

Nothing about "done" requires the *new* Spring Boot/Angular implementation to
exist, let alone to pass. Item 5 is the one target-shaped condition, and it
is target-shaped in the same limited way the API contract is: it records a
decision about how a legacy assertion would be observed, which can be made
before anything is built and cannot be made by looking at the legacy system
alone. That boundary is the point: a spec's completeness against the legacy system
has to be established on its own evidence, before anyone builds on it. If
"done" meant "the new system passes," the spec and the implementation would
be confirming each other again — the exact failure this method was designed
against. See `DECISIONS.md`.
