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
4. **Small-model-shaped steps, Phases A–C.** Every LLM call in the
   specification pipeline is scoped so that a Gemini-Flash-class model can do
   it correctly: one file or one node or one behavior as input, one
   judgment, a schema-validated JSON output, few-shot examples in the
   prompt, and a defined escalation path if it keeps failing. This is not a
   cost optimization bolted on afterward — it is why Phases A–C are
   decomposed the way they are. Any step that seems to need "read the whole
   codebase and figure out what's reusable" gets mechanically pre-reduced
   (clone detection, AST similarity) into a set of bounded per-candidate
   confirmations first. See `docs/model-tiers.md`. **This principle is
   explicitly scoped to Phases A–C, not Phase D** — implementing a behavior
   in the target stack (`d2`) is a synthesis task no small-model bounding
   makes tier-S/M-shaped, and the framework does not pretend otherwise (see
   `docs/model-tiers.md` and `DECISIONS.md`).

## The pipeline, phase by phase

```
Phase 0    Phase 0b       Phase A            Phase B            Phase C             Phase D
Env.   ->  Walking    ->  Inventory     ->   Behaviors    ->    Acceptance    ->    Implementation
(entry     skeleton       (script-built      (BHV-####.md,      (AC, decision       from spec pack
gate)      (one BHV       graph, LLM only    clustered &        tables, coverage    (d0 target arch,
           end-to-end,    for ambiguous      sized)             triage)             d2 implement,
           hard gate)     cases)                                                    d4 verify)
```

Phase D is in scope (decided 2026-08-07 — see `DECISIONS.md`), reshaped: it
is not "build a test harness for the new stack," it is "the spec pack this
framework produces is the direct input to LLM-driven implementation of the
target application." Its step contracts are sketched, not yet authored — see
`DECISIONS.md` and REVIEW.md §5.

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
is flagged and routed to a tier-S LLM call that sees exactly that one node
and its immediate static facts — never the surrounding codebase.

EL expressions get special handling: JaCoCo cannot see them, so every
`rendered`/`disabled`/`required`/`value` EL expression attached to a JSF
component is extracted as a raw `EL` node and then *lifted* by a tier-S LLM
call into a plain-language rule description, becoming a candidate `RULE`
node. This is the mechanism that keeps view-layer logic from disappearing
from the spec.

Phase A ends with a deterministic validator (`a5`): every edge's endpoints
must resolve to real node IDs, every `legacy_refs` entry must resolve to a
real `file:line`. A graph that fails this validator does not proceed to
Phase B. See `docs/phase-a-inventory.md`.

### Phase B — Behaviors

Behaviors are drafted from the inventory graph, never from scratch. Two
distinct paths:

- **Screen / process / job / integration behaviors** are seeded from one
  `SCR`/`PROC`/`JOB` node and its bounded local subgraph (2-hop cap — see
  `steps/b3-draft-behavior-boundary.yaml`). A tier-M model drafts the
  boundary (which nodes belong to this behavior) and the spec body.
- **Rule behaviors** — the ones teams miss, because they are reused logic,
  not a screen — are found mechanically first. A clone/AST-similarity
  detector proposes candidate clusters of near-identical logic across
  screens/services (`b1`, a script step). A tier-M model then confirms or
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
`framework.yaml`'s `spec_format` — into Gherkin and/or JUnit (`c3`). Rendered
tests run against the *legacy* application under coverage instrumentation
(`c4`). Every branch the legacy app can reach that the rendered tests didn't
exercise gets triaged into exactly one bucket: missing scenario, dead code,
or unreachable-defensive (`c5`, tier-S — one branch, one judgment). The
resulting triage log is itself a deliverable: it is the evidence that the
spec is complete relative to the legacy system's actual behavior, not just
relative to what a human remembered to write down.

## What "done" means for a behavior

A `BHV-####` is done when:

1. Its frontmatter and scenarios validate against `schemas/bhv.schema.json`.
2. It sits within the sizing and density bands, or has a documented,
   justified exception.
3. Every inventory node it claims to cover is linked, and it does not
   overlap another behavior's coverage without an explicit shared-`RULE`
   link.
4. Its rendered tests, run against the legacy app, leave no untriaged
   branch.

Nothing about "done" for Phase C references the *new* Spring Boot/Angular
implementation — that boundary is intentional, since a spec's completeness
against the legacy system must be established before it is trusted as an
implementation brief. Phase D then consumes the finished spec pack directly;
see `DECISIONS.md` and REVIEW.md §5 for what that phase now means and why
the boundary matters more, not less, once Phase D is in scope.
