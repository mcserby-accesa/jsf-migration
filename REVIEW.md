# Framework review

An external review of this skeleton, written before it is applied to any
real migration. It covers all 19 step contracts, 18 schemas, 9 prompts, the
phase docs, both renderers, and the worked example.

Reviewed: 2026-08-07. Reviewed against the repository as of that date; no
pilot data was available, so every claim here is either a document-internal
inconsistency (verified, cited) or a predicted failure mode (labelled as
such).

> **Historical document.** Parts of it have since been acted on and parts
> reversed. Two things it discusses at length no longer exist: **Phase D as
> implementation** (§5 — superseded, see the banner there) and the **model
> tier system** (`docs/model-tiers.md`, tier S/M/L per step — deleted;
> steps now declare only `kind: llm` or `kind: script`, and model choice
> belongs to the implementing team). References to either are stale by
> design. **`DECISIONS.md` is authoritative on what is settled.**

The purpose of this document is to drive iteration on the framework. It is
organised so it can be worked as a checklist: structural problems first,
then verified defects, then a prioritised change list.

---

## Verdict

The core thesis is right and worth preserving: separate **complete
mechanical inventory** from **bounded LLM interpretation**, and validate the
resulting spec against **measured legacy coverage** rather than against a
second careful reading of the code. That is a genuinely stronger idea than
what most migration methodologies offer, and the discipline is applied
consistently across the phase docs.

The framework has, however, never met a codebase, and it shows in a specific
pattern: **the parts it is most confident about are the parts the worked
example already contradicts.** Mechanical rendering, 100% branch triage, and
small-model sufficiency are all asserted as structural guarantees, and all
three fail in `examples/`.

Phase-by-phase:

| Phase | Assessment |
|---|---|
| 0 | Sound as far as it goes, but its exit criteria are too weak — see P0-1 |
| A | Realistic. The most valuable and most buildable part of the framework. Needs volume control (P1-1) and a node identity key (P1-3) |
| B | Plausible, but under-costed and hand-waves its hardest decision (neighbourhood pre-split, P1-4) |
| C | **Cannot run as specified.** It carries the framework's entire differentiating claim and depends on a workstream declared out of scope |

---

## 0. Execution order

This document is both a review and a work plan. Work it in the order below.
The ordering is not cosmetic: it front-loads the cheap tests of the
expensive assumptions, and every later stage is conditional on an earlier
one producing evidence.

**Step 1 — repair the documents (est. 1 day).** Before anything is executed
against a real application, the framework should not contradict itself.

- Fix the mechanical defects: **P1-6** (D1, D2, D4, D5, D6, D7, D8).
- Apply the `test_seam` split from **§5.3**, since the smoke test depends on
  the seam decision being coherent.
- Replace `bpmn_target` with the engine pair from **§5.4 item 3**, and add
  the engine-continuity check to the Phase 0 gate.
- Record the Phase D scope change in `DECISIONS.md`, and re-scope
  principle 4 to Phases A–C per **§5.6**.

**Step 2 — smoke test, Stage 0 (§4.2). Hard gate.** Prove that a hand-written
throwaway test can run against the legacy app under coverage and yield
attributable branch data. If this fails, **stop and report**. Everything
downstream is worthless without it, and learning that in a day rather than a
quarter is the single highest-value outcome available right now.

**Step 3 — smoke test, Stage 1 (§4.3), plus step 10 (§5.9).** Carry one
behaviour from inventory through to a verified target implementation.
Produce the findings report specified in **§4.4**.

**Step 4 — decide, using evidence rather than prediction.** With the two
viability numbers from §4.5 in hand, revisit **P0-3**, **P0-4**, and
**P1-1** through **P1-5**, and author the `steps/d*.yaml` contracts
sketched in §5.6.

**Step 5 — five-behaviour pilot (§4.6),** spanning the taxonomy.

**Step 6 — P2 items,** then multi-migration rollout.

**Do not, before Step 4 completes:** build the extractors, build the
orchestrator, author the full Phase D contract set, or begin a second
migration. These are the framework's large costs and none should be paid
before the method has been shown to work on one thread.

**Two rules that hold throughout.** Do not fix the framework while executing
the smoke test — record defects and continue with a documented workaround
(§4.1); the defect log is the product. And treat §6 as protected: those
properties are what make the method worth running, and iteration should not
erode them.

---

## 1. Structural problems

These are not defects to patch; they are consequences of how the framework
is decomposed. Each needs a design decision.

### 1.1 The completeness oracle depends on out-of-scope work

Everything this method claims over "re-read the old code carefully" rests on
`c4` — running derived tests against the instrumented legacy app. But the
work required to make `c4` run is explicitly excluded:

- Test harness, fixtures, seed-data wiring are Phase D, "out of scope"
  (`DECISIONS.md:57-60`).
- `templates/renderers/junit.md:56-61` — the renderer "does not wire up test
  fixtures, seed data, mocks"; it emits a skeleton.
- `docs/phase-0-environment.md:49-55` — Phase 0 only requires proving the
  seam is *reachable*, explicitly "not build the harness."

So a real run proceeds A → B → C1/C2/C3 and stops. Every downstream
construct is defined in terms of `c4` output: `c6`'s triage gate, the
definition of "done" (`docs/method.md:150-159`), the density-metric expiry
rule (`docs/metrics.md:32-37`), and the triage log deliverable. Without
`c4`, the framework degrades to *LLM-drafted specs with structural
validation* — a materially weaker product, and one in which nothing catches
a confidently wrong spec.

**Compounding: the default seam is wrong for the stack.** `test_seam: rest`
(`framework.yaml:32`) assumes a REST boundary that most legacy JSF apps do
not have — they are postback/ViewState-driven. `service` bypasses the
backing beans, which is exactly where JSF business logic lives and where
lifted EL rules resolve. `ui` means driving JSF ViewState and partial-ajax
updates through a browser, which is where the effort actually explodes. The
framework never confronts this trade-off, and it is the central feasibility
question of Phase C.

**Also unresolved: coverage attribution across behaviours.**
`steps/c4-run-coverage-oracle.yaml:16-18` requires that all reported branch
entries "fall within the behavior's claimed legacy_refs spans." Running one
behaviour's tests will inevitably execute shared code outside its spans
(a common validation utility, a base bean). Is that coverage credited to the
shared `RULE` behaviour, discarded, or a validator failure? Unspecified —
and it determines whether the 100% gate is reachable at all.

### 1.2 The volume economics are unmodeled

`docs/phase-a-inventory.md:133-139` specifies one `EL` node per
`rendered`/`disabled`/`required`/**`value`**/any-EL-bearing attribute
occurrence, explicitly **without deduplicating** identical expression
strings. On a mid-size JSF app (~250 xhtml files) that is plausibly
5,000–15,000 `EL` nodes, the overwhelming majority being `value="#{bean.name}"`
data bindings with zero rule content.

Each becomes an `a3` LLM call, then a candidate `RULE` node, then falls
under the 100% inventory-coverage gate (`docs/metrics.md:69-80`). There is
no content filter, no dedup, and **no rule for retiring an `EL` node once it
has been lifted**. The worked example already demonstrates the consequence:
`EL-0089` is `status: active` with no incoming `COVERS` edge, so the
six-node excerpt fails `b5`'s completeness gate as shipped.

`c5` has the same shape: one LLM call per uncovered branch, an absolute 100%
triage requirement, and an explicit rejection of partial completion
(`docs/metrics.md:60-62` — *"'we got to 92%' is not a valid end state"*). No
batching, no sampling, no file- or class-level triage. On a 150 KLOC app
with realistic acceptance-test coverage this is a five-figure call count —
and a human must read the resulting log, since reading it *as a whole* is
the stated mechanism for catching rationalised "defensive" classifications
(`docs/phase-c-acceptance.md:104-109`).

There is no cost model, no throughput estimate, and no human-effort model
anywhere in the framework.

### 1.3 Quality control is entirely structural

Every check in `validators/README.md` is shape-based: does the ref resolve,
is the enum valid, is the field non-empty, do two renders match, is the
justification not literally the string "defensive code."

Nothing verifies that a lifted rule means what the EL meant, that an MC/DC
table is MC/DC-correct, that a behaviour boundary is well-drawn, or that a
`dead_code` verdict is true. The only semantic oracle in the framework is
`c4` — see 1.1.

The escalation triggers compound this. They fire on schema-validation
failure and self-reported `confidence` (`docs/model-tiers.md:83-91`).
Neither correlates with the dominant failure mode of a small model on this
task: **the fluent, schema-valid, wrong answer.** A Flash-class model handed
a compound condition will emit a well-formed decision table with the wrong
rows at confidence 0.9, and it will pass every gate in the framework.

### 1.4 The bounding principle contradicts the judgment three steps require

The framework treats "input too large" as the only failure mode and
escalation as the universal remedy. But three steps are bounded away from
information they structurally need:

- **`c5`** asks "is this branch reachable under *any* realistic input" given
  one branch and its surrounding context. That is a whole-program
  reachability question. The bound guarantees the model cannot answer it
  correctly — only plausibly.
- **`a3`** — the prompt's own second few-shot example concedes this
  (`prompts/a3-lift-el-expression.md:96`: *"The meaning of flags[3] and
  isLegacyMode is not recoverable from this expression alone"*). On real
  JSF, EL referencing opaque bean properties and helper methods is the
  common case, not the exceptional one.
- **`a4`** resolves DI and dynamic-dispatch targets without the call site's
  surrounding context.

Escalating to a larger model with the *same missing information* does not
help. Predicted consequence: `a3` and `c5` escalation rates far above the
20% threshold in `docs/metrics.md:96-109`, where the prescribed response
("review the tier assignment") is the wrong remedy — the fix is more
context, not a bigger model.

Secondary effect: if escalation is common, tier L becomes the de facto
steady state for `b2`/`b3`/`b4`/`c1`/`c2`, and the Flash-class cost model
underlying the whole "small-model-shaped steps" principle collapses.

---

## 2. Verified defects

All confirmed against the repository. These are fixable without redesign.

| # | Defect | Location |
|---|---|---|
| D1 | **The worked example fails the canonical schema.** `bhv.schema.json` requires `scenarios`; `BHV-template.md:7-8` states the frontmatter must validate against that schema; frontmatter never contains scenarios. Validated: `'scenarios' is a required property` | `schemas/bhv.schema.json:7`, `templates/BHV-template.md:7-8` |
| D2 | **Decision tables are unmodeled in the canonical schema**, despite being canonical content that `c3` renders and `c6` validates. `additionalProperties: false` leaves nowhere to put them | `schemas/bhv.schema.json:8` |
| D3 | **The example disproves the deterministic-renderer claim.** The JUnit output invents concrete dates (`startDate("2026-06-10")`), harness APIs (`getLastNavigationOutcome`, `newBeanWithOrdering`), and an error string literal — `"Single-day requests require the half-day flag"` — that appears nowhere in `BHV-0142.md`, only in the `c5` prompt's code context. None of it is mechanically derivable from the source table. It also has no imports and will not compile, despite the claim of a "syntactically complete skeleton" | `examples/BHV0142LeaveRequestDetailSubmissionTest.java:9,24,30,41` |
| D4 | **Scenario S02 is dropped from both renderings**, violating `c3`'s own "no silent drops" validator. The renderer rules genuinely conflict for a row carrying both prose and a `decision_table_ref`; the example resolved it by hand — precisely what principle 3 says cannot happen | `examples/BHV-0142.md:44`, `steps/c3-render-tests.yaml:20-21` |
| D5 | **The example violates the density-expiry rule it documents**: `status: coverage-triaged` (so `c4` has run) but `density_band_status: in-band` is still live | `examples/BHV-0142.md:5,18` vs `docs/metrics.md:32-37` |
| D6 | **The "one parameter, one consumer" invariant is violated in the framework's own docs.** `framework.yaml:5-8` states a second reader "is a bug." `test_seam` is read in four places (phase-0 §4, phase-c step 4, `c4`'s contract, `junit.md`); `coverage_tool` in two (phase-0 §3, `c4`) | `framework.yaml:32,47` |
| D7 | **Config contradicts DECISIONS**: `spec_format: both` vs DECISIONS #5 "gherkin"; `test_seam: rest` vs the example's `test_seam: service (framework.yaml)` | `framework.yaml:16,32`, `DECISIONS.md:79` |
| D8 | **`c5`'s escalation trigger requires running every triage twice** ("different classification on 2 consecutive independent calls"), doubling the highest-volume LLM step, and contradicts `idempotent: true` declared in the same file | `steps/c5-triage-uncovered-branch.yaml:23-26` |
| D9 | **No node identity key is defined**, so "IDs stable across re-runs" and "diffable delta" have no mechanism. Combined with line-range `legacy_refs` and a hard 100% resolution gate, any legacy hotfix during a multi-month migration mass-invalidates the graph and blocks `a5`/`c6` | `docs/phase-a-inventory.md:26-28`, `docs/metrics.md:82-94` |
| D10 | **DB triggers and stored procedures are a second, unacknowledged coverage blind spot.** The framework handles EL's JaCoCo invisibility carefully, then inventories trigger/proc bodies via `body_ref` with no lifting step and no coverage story — and legacy J2EE apps carry substantial business logic there | `docs/phase-a-inventory.md:150-154` |
| D11 | **2-hop neighbourhoods have no fan-out cap.** One `CommonUtils` bean or a shared base backing bean makes every screen's 2-hop neighbourhood enormous. "Pre-split mechanically (e.g. by edge type)" is unspecified — and that split is the hardest design judgment in Phase B, delegated in a parenthetical | `steps/b3-draft-behavior-boundary.yaml:11-18` |
| D12 | **ΣCC is undefined** for `NAV`/`DB`/`CFG`/`EL` nodes, and double-counts when a screen's backing bean is both the `SCR`'s bean and its own `SVC` node (as in the example). The density metric is not computable as written | `docs/metrics.md:8-18` |
| D13 | **`a1`'s reproducibility validator is self-negating** — "byte-identical … modulo append-only ordering" is untestable as stated, and DB catalog introspection is not reproducible from a source snapshot at all | `steps/a1-extract-inventory.yaml:23-25` |
| D14 | **No node kind for JSF converters, validators, phase listeners, or `immediate="true"` lifecycle behaviour**, and no auth/roles node kind (`web.xml` security-constraints, `@RolesAllowed`). Authorisation loss is a classic migration failure mode | `docs/phase-a-inventory.md:32-43` |

---

## 3. Recommended changes

### P0 — without these, Phase C does not exist

**P0-1. Add a walking-skeleton gate between Phase 0 and Phase A.**

Not harness construction — a single vertical slice. Pick one behaviour,
hand-author it, and carry it through `c1 → c3 → c4` until a rendered test
actually executes against the booted legacy app and produces JaCoCo output
attributable to that behaviour's `legacy_refs` spans.

The current pipeline is a waterfall in which the single riskiest component
is validated last, after months of spec production. This inverts that. If
the slice cannot be completed for a given application, you know before
Phase A that the coverage oracle will not run there — and that engagement
should be scoped and sold differently.

This is a new gate, not an expansion of Phase 0's checklist; Phase 0 remains
a boot/access gate.

**P0-2. Choose the seam per application, in Phase 0, with JSF reality
stated.**

Document what each choice forfeits. For most JSF apps this will be `service`
plus a bean-level harness, accepting the loss of the view layer and
compensating through the EL-lifting path. Record the choice and its blind
spots where the triage log can reference it, the same way seed-data strategy
is already handled.

**P0-3. Replace the absolute 100% branch-triage gate with a risk-tiered
one.**

100% triage for `rule` and `process` behaviours and anything touching money,
authorisation, or state transitions; sampled triage elsewhere, with the
sampling rate recorded as part of the deliverable. An unachievable gate gets
quietly ignored in practice, which is strictly worse than a calibrated one
that is actually enforced.

**P0-4. Add a semantic verification layer.**

Structural validators cannot catch a wrong lift or a bad MC/DC table.
Minimum viable version: independent re-derivation on a sample (two calls,
different prompt framings, compare and flag divergence), plus mandatory
human review of every `dead_code` verdict and every `rule` behaviour in a
high-risk domain. Track spec-defect rate found in review as a metric — it is
currently the one number that would tell you whether the pipeline works.

### P1 — needed before the framework scales

**P1-1. Filter and dedup EL aggressively.** Skip `value` bindings with no
operator, comparison, or method call. Dedup identical expression strings to
one `RULE` with N `GUARDS` edges. Add an explicit retirement state (e.g.
`covered_by_lift`) so lifted `EL` nodes stop jamming the coverage gate. This
alone likely removes 80%+ of Phase A LLM volume.

**P1-2. Give `c5` and `a3` more context by default, not on escalation.**
Enclosing method plus callers for `c5`; the backing bean's field and method
list for `a3`. These are information problems, not capability problems —
see 1.4.

**P1-3. Define a node identity key** (stable hash of FQCN + member
signature; view path + component id + attribute for EL) and make
`legacy_refs` anchor-based rather than raw line numbers, so a legacy hotfix
yields a diff rather than a hard stop across the whole graph.

**P1-4. Specify the neighbourhood pre-split.** Add a fan-out cap and a
hub-node exclusion rule to `b3`, and state the split criteria concretely.
This is currently the least-specified, highest-impact judgment in Phase B.

**P1-5. Resolve `c3`'s honesty problem.** Either make the renderer emit
genuinely abstract skeletons with no invented literals, or accept that
rendering needs judgment and add a round-trip validator (re-derive the spec
from the rendered test, diff against the source `BHV`). Do not claim
determinism the example does not demonstrate.

**P1-6. Fix D1, D2, D4, D5, D6, D7, D8.** Mechanical — roughly an
afternoon — but these are the defects a technically sharp client will find
first and use to question everything else.

### P2 — before bidding multiple migrations

**P2-1. Build a cost and effort model**: LLM calls per KLOC, human-review
hours per behaviour, wall-clock per full `c4` pass, and the convergence
behaviour of the `c5 → c1 → c3 → c4` loop (currently unbounded and
uncosted).

**P2-2. Estimate the framework build itself.** Nothing here is implemented.
Required: seven extractors per stack variant (JSF 1.2 vs 2.x, Mojarra vs
MyFaces, PrimeFaces/RichFaces/IceFaces each carry different EL-bearing
attributes), an orchestrator with escalation and logging, a graph loader,
nine prompt harnesses, eighteen validators, clone-detection and PICT
integrations, a coverage-attribution engine, and two renderers. Rough order:
**3–5 person-months before the first behaviour is produced.** Cross-migration
reuse is real only where applications share a stack; budget per-app
extractor work otherwise.

**P2-3. Add an extractor calibration step to Phase A.** Completeness is
Phase A's load-bearing claim, and it is currently asserted rather than
measured. Run the extractors against a hand-inventoried sample (one module,
or twenty files) and record recall before treating the graph as complete.
Address D10 and D14 as part of this.

---

## 4. Smoke test

Before any further work on the framework, run a smoke test: apply the
framework, by hand, to one real application, on the narrowest possible
thread of work.

### 4.1 What this is and is not

**The subject under test is the framework, not the application.** The
product of this exercise is *evidence about whether the method works* — a
findings report. Migration artifacts produced along the way (one inventory
slice, one `BHV`, one rendered test) are instruments, not deliverables. If
the thread produces a useless `BHV` but a clear account of why, the smoke
test has succeeded.

Explicit non-goals. Do **not**, during the smoke test:

- Implement the extractors described in `docs/phase-a-inventory.md`. Produce
  the inventory slice by hand, or with throwaway scripts good enough for one
  screen. Extractor construction is the largest cost in the framework
  (P2-2) and must not be paid before the method is validated.
- Build the orchestrator, the escalation machinery, the graph store loader,
  or the schema-validation harness. Run LLM steps by hand, one prompt at a
  time, using the templates in `prompts/`.
- Build a general test harness. Stage 0 below needs exactly one test to run,
  by whatever means works, including hardcoded setup.
- Fix the framework while running it. When a contract is wrong, ambiguous,
  or unimplementable, **record it and continue with a documented
  workaround.** Fixing as you go destroys the evidence, which is the only
  thing this exercise produces. Iteration on the framework happens after.

### 4.2 Stage 0 — prove the coverage plumbing (hard gate)

Run this before anything else. It is the cheapest test of the framework's
single largest risk (§1.1), and if it fails, no upstream work is worth
doing.

1. Boot the legacy application against representative data, per
   `docs/phase-0-environment.md`.
2. Choose the seam (`rest` / `service` / `ui`) that actually exists for this
   application. Record which, and why the other two were rejected. Do not
   default to `framework.yaml: rest` without confirming a REST boundary
   exists — see §1.1.
3. Hand-write **one throwaway test** — not rendered from any `BHV`, not
   traceable to anything, just a test that exercises one known code path
   through the chosen seam.
4. Run it under `coverage_tool` (default JaCoCo).
5. Obtain a branch-level coverage report and confirm you can attribute its
   entries to specific legacy `file:line` ranges.

**Stage 0 passes only if step 5 produces attributable branch data.**

If it fails, stop. Report what blocked it. Do not proceed to Stage 1 — the
framework's completeness oracle does not run on this application, and that
finding is more valuable than anything Stage 1 would produce.

Record from Stage 0:

- Elapsed time from "app boots" to "attributable branch report in hand."
  This is one of the two numbers that decide viability (§4.5).
- Which seam was used, and what it cannot see (e.g. a `service` seam sees no
  view-layer logic).
- Whether coverage of *shared* code — a utility invoked by the test but
  outside the target span — appears in the report, and how it is attributed.
  This is the unresolved question at the end of §1.1.

### 4.3 Stage 1 — carry one behaviour end to end

Only after Stage 0 passes.

**Selecting the thread.** Pick one screen that is representative but not
worst-case. It should have:

- at least one compound boolean condition (exercises `c2`),
- at least one EL-gated element such as `rendered` or `disabled`
  (exercises `a3`),
- a real database read or write,
- and — importantly — **someone available who knows what the screen is
  supposed to do**, for step 2 below.

Avoid the most complex screen in the application. The smoke test measures
whether the method works at all, not whether it survives the hardest case.

**Steps.**

1. **Establish ground truth first.** Before running any framework step, have
   the person who knows the screen write down, in plain language, what it
   does: its rules, its outcomes, its edge cases. Set this aside without
   showing it to any LLM step. This is the control.

2. **Phase A slice.** Hand-produce `nodes.jsonl` and `edges.jsonl` entries
   for that screen and its immediate dependencies, following the node and
   edge definitions in `docs/phase-a-inventory.md`. Extract *every* EL
   expression on the screen, without filtering, exactly as the current
   contract specifies — the raw count and the useful count are both findings
   (§1.2).

3. **Run `a3` on every EL node**, using `prompts/a3-lift-el-expression.md`,
   one call per node, tier S. For each result, judge and record: is the
   lifted rule *meaningful* (recovers business intent), *mechanical* (a
   correct restatement with no intent), or *wrong*. This yields the EL lift
   yield — the other decisive number (§4.5).

4. **Run `b3` and `b4`** for the behaviour boundary and the `BHV` draft.
   Record the actual size of the 2-hop neighbourhood — node count and
   whether any hub node caused it to blow up (§1.4, D11).

5. **Run `c1`, and `c2`** where a compound condition exists. Check the
   decision table by hand for MC/DC correctness and record whether it is
   correct. This is a direct test of §1.3 — whether a schema-valid output
   can be semantically wrong.

6. **Run `c3`** and render the test. Record every place where the renderer
   required a judgment call that `templates/renderers/*.md` does not
   specify — inventing a literal value, choosing an assertion API, resolving
   the S02-style conflict in D4. Each one is evidence about whether `c3` can
   be deterministic at all (P1-5).

7. **Make the rendered test actually run** against the legacy app, under
   coverage, and produce a per-behaviour branch report. Record how much
   hand-wiring this took beyond what `c3` emitted — this quantifies the
   Phase C/D boundary problem (§1.1).

8. **Run `c5`** on every uncovered branch in the behaviour's spans. Record
   the branch count, and for each classification, whether a human reviewing
   it agrees. Pay particular attention to `dead_code` and
   `unreachable_defensive` verdicts, which §1.4 predicts the bounded input
   cannot support.

9. **Compare against ground truth.** Diff the finished `BHV` against the
   plain-language description from step 1. Record: rules present in ground
   truth but missing from the spec (false negatives — the failure mode the
   framework exists to prevent), and rules asserted by the spec that are not
   true of the screen (false positives — the failure mode nothing in the
   framework currently catches).

### 4.4 Deliverable

A findings report — a new file, not an edit to this one — containing:

- Stage 0 outcome: pass or fail, seam used, elapsed time, attribution
  behaviour for shared code.
- The two viability numbers from §4.5.
- Step 9's ground-truth diff, stated as counts and examples.
- A defect log: every point where a step contract was wrong, ambiguous, or
  unimplementable, and the workaround used. Cross-reference §2 where the
  smoke test confirms an already-predicted defect, and flag new ones
  distinctly.
- A recommendation on each P0 item in §3, now informed by evidence rather
  than prediction.

### 4.5 The two numbers that decide viability

Neither is knowable from the desk. Both come out of the smoke test:

1. **EL lift yield** — the fraction of real EL expressions `a3` lifts
   *meaningfully* at tier S (step 3). If this is low, the mechanism that
   keeps view-layer logic out of the blind spot does not work, and Phase A's
   value proposition weakens substantially.
2. **Time to first covered test** — elapsed time from a booted app to an
   attributable branch report (Stage 0), plus the hand-wiring cost from
   step 7. This determines whether Phase C is economically viable per
   behaviour, and therefore whether the framework's central claim can be
   delivered at all.

### 4.6 After the smoke test

Only if the smoke test passes and the two numbers are acceptable: expand to
a **five-behaviour pilot** on the same application, spanning a screen, a
rule, a BPMN process, a scheduled job, and something touching a DB trigger.
That pilot tests breadth across the taxonomy — coverage attribution across
shared `RULE` behaviours, the `c5 → c1 → c3 → c4` loop's convergence, and
whether Phase B's boundary-drawing holds up on non-screen behaviours.

Do not apply the framework to several migrations until the pilot completes.

---

## 5. Phase D — implementation from the spec pack

> **SUPERSEDED — this entire section describes a design that was reversed.**
> Implementation is out of scope again; Phase D is now spec validation
> (browser-driven tests against the *legacy* app). `d0`–`d6`,
> `target_test_seam`, `layout_fidelity`, and `service_boundary_fidelity` do
> not exist. The endpoint-contract derivation (§5.6's `d1b`) survived and
> moved into Phase C — see `docs/spec-pack.md`. This section is kept as the
> record of what was considered and why it was dropped. **`DECISIONS.md` is
> authoritative on what is settled; this file is not.**

**Decision taken (2026-08-07):** Phase D is brought into scope, and its
shape changes. It is *not* "build a test harness for the new stack."
Automatically generating a working test suite for a Spring Boot + Angular
application is hard to the point of impracticality, and it was the wrong
thing to aim at.

Instead: **the artifacts this framework produces become the implementation
brief for the migration**, and an LLM implements the target application from
them. BPMN process definitions are carried into that pack as first-class
artifacts, on the agreement that the processes themselves are not redesigned.

This section states what that decision implies. It is written to be
implemented — the step contracts sketched in 5.6 do not exist yet and need
authoring in `steps/`.

### 5.1 Why this strengthens the framework

It closes a loop that was previously open at one end.

The same canonical `BHV-####.md`, rendered twice against two different
seams, serves two distinct verification runs:

| Render | Runs against | Proves |
|---|---|---|
| legacy | the legacy app, under coverage (`c4`) | the spec is **complete** — it exercises what the legacy system actually does |
| target | the new Spring Boot / Angular app (`d4`) | the implementation is **correct** — it does what the spec says |

The behaviour document becomes the pivot between the two. That is a
genuinely strong property, and it is the best argument for this reframe:
completeness and correctness are established by the same artifact against
two systems, rather than by two independently drifting sets of documents.

It also gives `origin: new` scenarios a precise meaning. They are the only
place the two runs are permitted to diverge — a legacy run cannot pass them
(the behaviour never existed there), a target run must. That distinction is
currently informal; under this decision it becomes structural, and the
renderers must emit `origin: new` scenarios into the target render and
exclude them from the legacy render.

### 5.2 What this does *not* fix

Bringing Phase D in scope does not resolve §1.1. That problem is on the
**legacy** side: `c4` still requires running rendered tests against the
instrumented legacy application, and that still needs a harness Phase 0
explicitly does not build.

If anything the dependency tightens. Under this decision the spec is no
longer a document handed to a human team who will notice its gaps while
implementing — it is the direct input to automated implementation. **An
unverified spec now propagates its gaps straight into the new system.** The
completeness oracle moves from "valuable validation" to "the only thing
standing between a missing legacy rule and its silent absence from
production," which is the exact failure mode `docs/method.md:11-16` names as
the reason the framework exists.

P0-1 (the Stage 0 smoke test) therefore becomes more important under this
decision, not less.

### 5.3 `test_seam` must split into two parameters

`framework.yaml: test_seam` currently conflates the legacy verification seam
and the target test seam. They are different systems with different seams —
a legacy JSF app tested at `service` or `ui`, a Spring Boot + Angular app
tested at `rest` plus a browser driver. One parameter cannot describe both.

Replace with:

```yaml
legacy_test_seam: rest | service | ui      # consumed by c3 (legacy render) + c4
target_test_seam: rest | service | e2e     # consumed by d3 (target render) + d4
```

This also supersedes part of D6 — `test_seam`'s multiple readers were partly
a symptom of it meaning two things at once. Record the resolution in
`DECISIONS.md`.

### 5.4 BPMN pass-through is narrower than "we don't change the processes"

The agreement not to redesign the processes is sound, and carrying the BPMN
definitions through as artifacts is right. But "the BPMN doesn't change"
holds for process *topology* only, and three things underneath it do change.
An implementer told simply "reuse the BPMN" will get this wrong.

1. **Implementation bindings are application code and must be
   re-implemented.** Service task delegates (`camunda:class`,
   `camunda:delegateExpression`, `camunda:expression`), execution and task
   listeners, form keys, and user-task assignee/candidate-group expressions
   all point at legacy classes and legacy beans. They do not survive the
   migration. The process XML must be treated as *topology plus a binding
   layer*, where the topology is carried over verbatim and every binding is a
   re-implementation work item traceable to its `TASK` node.

2. **Gateway conditions are EL and reference legacy beans.** Phase A already
   lifts `condition_expr` through `a3` into `RULE` nodes
   (`docs/phase-a-inventory.md:144-148`), which is exactly the right
   groundwork — but the lifted rules reference properties of beans that will
   not exist in the target. Each needs re-binding against the new domain
   model, and each is a place where behaviour can silently change.

3. **Engine continuity is now a stated precondition, not an assumption.**
   **Decision (2026-08-07): the BPMN engine is kept — or at minimum the file
   structure is kept.** That retires the largest risk here, but it must be
   written down as a condition the framework depends on rather than left
   implicit, because it is exactly the kind of assumption that is true on
   the first migration and false on the fourth.

   `framework.yaml:20-24` currently declares `bpmn_target` an informational
   label, with the explicit assurance that "no step assumes engine-specific
   BPMN semantics." Under this decision that assurance no longer holds — the
   definitions are deployed to a real engine in the target stack — so
   `bpmn_target` changes status from *label* to *precondition*.

   **Action:** replace `bpmn_target` with an explicit pair, and check it at
   the Phase 0 gate:

   ```yaml
   bpmn_source_engine: camunda7      # what the legacy app runs
   bpmn_target_engine: camunda7      # what the new app will run
   ```

   Three cases, which must not be conflated:

   - **Same engine, same major version** — the intended case. Process
     topology and gateway expressions carry over; only the binding layer
     (items 1 and 2 above) is re-implemented.
   - **Same file structure, different engine or major version** — the weaker
     case the "or at least the file structure" position permits. The `.bpmn`
     files carry over as the source of truth for topology, but expression
     language and execution semantics do **not** transfer for free. Every
     gateway condition and every listener attachment must be re-validated
     individually. Camunda 7 → 8 is the canonical instance: Zeebe changes
     execution semantics, expression language, and job handling. Budget this
     as real work; it is not a pass-through.
   - **Engine change with process redesign** — **outside this framework's
     scope.** Fail the Phase 0 gate, flag it, and handle it as a separate
     workstream. Do not absorb it silently into Phase D.

Phase A should be extended to inventory the binding layer explicitly — a
node kind or a `raw_facts` field on `TASK` capturing the delegate class,
listener classes, and form key — so that binding re-implementation is
enumerable and coverable rather than discovered during implementation.
This is a Phase A change, and belongs in the same pass as D10 and D14.

### 5.5 The implementation pack

Phase D's input is the full set below. Several of these the framework
already produces but never consumes — most notably the triage log, whose
`dead_code` entries are direct "do not implement" instructions.

| Artifact | Role in implementation |
|---|---|
| `BHV-####.md` (all) | The specification. Primary input |
| Target-rendered tests (`d3`) | Executable acceptance criteria for the new app |
| Decision tables | Exact condition/outcome logic, more precise than the prose ACs |
| Triage log | `dead_code` → **do not implement**. `unreachable_defensive` → implement or drop, with the recorded justification as the decision basis |
| Inventory graph (`nodes.jsonl` / `edges.jsonl`) | Traceability, and the dependency order for sequencing work (5.7) |
| Lifted `RULE` nodes | Form-state logic. These map directly onto Angular validators, `*ngIf` conditions, and disabled-state bindings — the payoff for the EL-lifting work is realised here |
| `SCR.form_fields` | Field inventory for target form and DTO construction |
| `DB` nodes | The data model the new persistence layer must serve |
| BPMN definitions + binding inventory | Process topology (verbatim) and the binding work items (5.4) |
| Target architecture decisions | **Does not exist yet — see 5.8** |

**Interaction with P1-1.** That recommendation filters trivial `value` EL
bindings out of the `a3` lift path. It must not delete them from the
inventory: they are needed here as template/DTO field evidence. Filter them
from *rule lifting*, retain them as *inventory*.

### 5.6 Step contracts to author

Phase D needs contracts in `steps/`, following the existing conventions
(`id`, `phase`, `tier`, `input` with an explicit `bound`, `output_schema`,
`validators`, `escalate`). Suggested decomposition:

- **`d0-define-target-architecture`** — human-authored, once per application.
  Package layout, layering, API conventions, error handling, auth approach,
  Angular module and state-management conventions. See 5.8; this is a
  prerequisite, not an optional step.
- **`d1-order-implementation-work`** — script. Topologically sort behaviours
  from the inventory graph into a dependency-respecting sequence (5.7).
- **`d2-implement-behavior`** — LLM, tier L. One behaviour per call, given
  its `BHV`, its decision tables, its `RULE` nodes, the target architecture
  from `d0`, and the interfaces of already-implemented dependencies.
- **`d3-render-target-tests`** — script. Same canonical `BHV`, rendered
  against `target_test_seam`. Includes `origin: new` scenarios (5.1).
- **`d4-verify-implementation`** — script. Run `d3`'s output against the new
  application. A behaviour is implemented when its target render passes.
- **`d5-reconcile-divergence`** — LLM, tier S. One failing scenario per call:
  classify as implementation defect, spec defect (route back to `c1`), or
  accepted deliberate divergence.
- **`d6-implement-process-bindings`** — LLM, tier M/L. One BPMN binding per
  call, per 5.4.

**Principle 4 must be re-scoped.** `DECISIONS.md:18-21` states that every
step must run on a small/mid model, "architectural, not aspirational."
Implementing a Spring Boot service from a specification is not tier-S or
tier-M work under any bounding. Either scope principle 4 explicitly to the
**specification pipeline (Phases A–C)** — which is the honest and
recommended option, since that is where the bounding discipline earns its
keep — or drop it. Do not leave it stated globally while Phase D violates
it, and update `docs/model-tiers.md` accordingly.

### 5.7 Sequencing

The inventory graph already contains what is needed to order the work:
`COVERS` plus `INVOKES`/`READS`/`WRITES` edges yield a dependency-respecting
topological order over behaviours. Implement in that order — data model,
then `rule` behaviours, then the `screen` and `process` behaviours that link
to them.

This is a real strength of the graph that nothing currently uses, and `d1`
should be a straightforward script.

Note that a `BHV` is sized for *specification* (≤15 ACs, a few hundred legacy
LOC — `docs/metrics.md:40-49`). Whether that is also the right granularity
for an implementation work item is untested. Record it as an open question
and measure it during the pilot, rather than assuming the units coincide.

### 5.8 Principal risk: implementation without an architecture

`DECISIONS.md:61` places target architecture design out of scope. Under this
decision that hole becomes load-bearing: an LLM implementing fifty
behaviours with no architectural constraints will implement them fifty
different ways — inconsistent layering, divergent error handling, duplicated
domain logic, incoherent API surface.

`d0` above is the mitigation and it is not optional. It is human work, done
once per application, before `d2` runs on anything. Its absence is the most
likely way this phase produces a large volume of plausible code that does
not compose into a maintainable system.

### 5.9 Validate on the smoke test thread

Extend the §4 smoke test with a step 10: take the single behaviour carried
through Stage 1 and implement it in the target stack via `d2`, then verify
with `d3`/`d4`.

One behaviour is enough to expose the expensive unknowns early — whether a
`BHV` carries sufficient information to implement from, how much target
architecture must be fixed before implementation is coherent, and whether
the target-rendered test is a meaningful acceptance criterion or merely
restates the spec. Do this before authoring the full `steps/d*.yaml` set,
not after.

---

## 6. What to keep unchanged

Iteration should not damage the parts that are right:

- **Script-first, LLM-second.** The rule that an LLM never proposes a node,
  only interprets one the extractor already found, is the framework's best
  idea. Keep it absolutely.
- **Behaviour as the unit of specification**, with the code graph as a
  traceability index rather than the decomposition. Correct, and the reason
  the completeness gate is meaningful at all.
- **One canonical spec, rendered outward.** The principle is right even
  though the current renderer does not honour it (D3, P1-5) — fix the
  renderer, do not abandon the principle.
- **Mechanical pre-reduction before every synthesis step** (`b1` → `b2`).
  This is the correct general pattern and should be extended, not relaxed,
  when new steps are added.
- **The triage log as a deliverable** rather than a byproduct. Even under a
  risk-tiered gate (P0-3), the log is the artifact that makes completeness
  auditable.
- **`DECISIONS.md`'s separation of settled from open questions.** Keep it
  current as this review's items are resolved.

---

## 7. Open questions for the framework author

1. ~~Is Phase D genuinely out of scope?~~ **Resolved 2026-08-07** — brought
   in scope and reshaped as spec-driven implementation (§5). BPMN engine
   continuity confirmed as a precondition (§5.4 item 3); the framework
   assumes the engine, or at minimum the file structure, is kept, and Phase 0
   checks it.
2. Is the small-model constraint a cost requirement or a design preference?
   If cost, P0-4's verification layer needs to be costed against it, since
   verification is where the quality actually comes from.
3. Across the several planned migrations, do the applications share a JSF
   stack? The answer determines whether extractor cost is paid once or
   per-engagement (P2-2).
4. Who performs the human review that P0-4 and the triage log require, and
   is that role staffed and budgeted?
