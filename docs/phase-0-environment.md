# Phase 0 — Environment (entry gate)

Phase 0 is a **gate**, not a pipeline step. It runs once per application,
before Phase A's extractors are ever pointed at the codebase. There is no
`steps/0-*.yaml` contract for it, because it is not repeated, resumed, or
re-run per node/behavior the way Phase A–C steps are — it is a checklist with
a binary pass/fail outcome, checked once (and re-checked only if the legacy
app or its data changes materially).

## Why this gate exists

Every later phase assumes two things about the legacy app: that its code is
*reachable* (extractors can point at running or buildable artifacts) and that
its *runtime behavior* is observable (the coverage oracle in Phase C can
exercise it and measure branches). If the app can't boot with data that
resembles production shape, both assumptions are false, and the framework has
no way to distinguish "this behavior doesn't exist" from "we couldn't get far
enough to see it."

Skipping this gate does not save time. It relocates the failure into Phase A
(where a node the extractor couldn't verify against a live app looks
identical to a node that's genuinely dead) or into Phase C (where the
coverage oracle in `steps/c4-run-coverage-oracle.yaml` needs a bootable app
to run derived tests against at all).

## Entry criteria (all required)

1. **The legacy app boots.** Whatever "boots" means for this app's stack —
   an application server starts, a health-check endpoint or a known page
   returns 200 — is scripted and repeatable, not a one-time manual step done
   by someone who then leaves. Record the exact command(s) and required
   environment (JDK version, app server version, JVM flags, external service
   stubs) in the application's own environment README — this framework does
   not prescribe the stack, only that it must be scripted.
2. **Representative data is loaded.** "Representative" means: every screen,
   process, and rule behavior you expect to inventory in Phase A has at least
   one row of backing data that lets it render/execute without an error path
   being the only reachable path. A database seeded with zero rows technically
   boots the app but makes every list screen, every conditional-render EL
   expression, and every BPMN gateway decision unreachable — which silently
   corrupts the Phase C coverage oracle (an unreachable branch looks
   identical to a dead one).
3. **Coverage instrumentation is wired and produces output.** Before trusting
   Phase C's completeness oracle later, prove now — with one smoke test, not
   the real acceptance suite — that the configured `coverage_tool`
   (`framework.yaml: coverage_tool`) actually attaches to the running app and
   emits a report. This is cheap to check now and expensive to discover is
   broken after Phase B has produced fifty behaviors.
4. **The app is reachable by whatever seam Phase C will test against.** Choose
   `framework.yaml: legacy_test_seam` (`rest` | `service` | `ui`) here, per
   application — do not assume the `service` default holds without checking.
   For each candidate, confirm reachability *and* record what it forfeits,
   since this is the central feasibility trade-off of Phase C, not a detail:
   - `rest`: confirm a REST/SOAP boundary actually exists and responds. Most
     legacy JSF apps are postback/ViewState-driven and have none — do not
     default to this without confirming otherwise. Forfeits: nothing bypassed
     if it genuinely exists, but it's rare that it covers view-layer logic.
   - `service`: confirm the service layer is invocable outside the web
     container (e.g. via a test harness or JMX). Forfeits: the view layer —
     `rendered`/`disabled`/`required` EL logic is not exercised by a service-
     level test at all; that gap is *why* Phase A's `a3` EL-lift path exists,
     and it's the intended compensation, not a coincidence.
   - `ui`: confirm a browser-drivable entry point exists. Forfeits: speed and
     simplicity — driving JSF ViewState and partial-ajax updates through a
     browser is where Phase C's effort typically explodes. Choose this only
     when the view layer's behavior cannot be adequately covered any other
     way.
   This check only needs to prove reachability, not build the harness —
   harness construction beyond one throwaway test is Phase 0b's and Phase D's
   concern. Record the choice and the rejected alternatives' reasons in the
   same checklist file referenced in "Exit criteria" below.
5. **BPMN engine continuity, if the app has BPMN processes.** Check
   `framework.yaml: bpmn_source_engine` against `bpmn_target_engine`:
   - **Same engine, same major version** — passes. Process topology and
     gateway expressions carry over; only the binding layer (service task
     delegates, listeners, form keys) is re-implemented in Phase D.
   - **Same file structure, different engine or major version** (e.g.
     Camunda 7 → 8) — passes, but flag it: expression language and execution
     semantics do not transfer for free, and every gateway condition and
     listener attachment needs individual re-validation in Phase D. Budget
     this as real work.
   - **Engine change with process redesign** — **fails this gate.** Flag it
     and handle it as a separate workstream; do not let it pass silently into
     Phase D. See REVIEW.md §5.4 item 3.
6. **Read access to everything Phase A will extract from.** Source code,
   `faces-config.xml` and other JSF config, the BPMN process definitions, and
   the database schema (including trigger and stored-procedure definitions —
   these often live in a DBA-controlled schema separate from the app's own
   migrations). A missing grant discovered mid-Phase-A produces a
   silently-incomplete graph, not an error.

## Seed-data strategies, in order of preference

1. **A sanitized production snapshot**, subsetted to a manageable size but
   preserving referential shape (foreign keys intact, status/enum value
   distributions preserved). This is the strategy most likely to surface
   real edge cases (an EL expression gated on a status value nobody
   remembered existed).
2. **A maintained synthetic fixture set** if production data cannot leave its
   environment or contains data that can't be sanitized economically.
   Fixture sets must cover every value of every enum/status column that gates
   a rendered/disabled/required EL expression or a BPMN gateway — cross-check
   this against the Phase A inventory once it exists; a fixture set built
   before the inventory exists should be revisited afterward.
3. **Hand-built minimal fixtures**, last resort, one row per screen/process.
   Flag explicitly in the triage log (Phase C) that coverage results built on
   minimal fixtures are lower-confidence — an uncovered branch might be
   uncovered only because the fixture set doesn't reach it, not because it's
   dead.

Whichever strategy is used, record it. Phase C's triage log
(`docs/phase-c-acceptance.md`) references the seed-data strategy when
classifying an uncovered branch as "unreachable" — "unreachable given this
data" and "unreachable given any data" are different claims, and only the
second one justifies not migrating the code.

## Exit criteria

Phase 0 is passed when all six entry criteria are checked and the checks are
recorded (a short `PHASE-0-CHECKLIST.md` in the application's own repo, dated
and attributable, is sufficient — this framework does not prescribe its
format because it is application-specific and not part of the graph). Phase A
extractors should refuse to run, or at minimum emit a loud warning, against
an application that hasn't passed this gate.

Passing Phase 0 does not clear Phase A to run at volume. A second, one-time
gate — the walking-skeleton exercise in `docs/phase-0b-walking-skeleton.md`
— must also pass first: it proves the completeness oracle (`c4`) can actually
produce attributable coverage on this application, using the seam chosen in
criterion 4 above, before months of spec production depend on that
assumption being true.

## Re-checking

Re-run this gate if: the legacy app's runtime environment changes (JDK/app
server upgrade), the seed dataset is replaced, or a long gap (a few months)
elapses between Phase 0 and the start of Phase A on the same application.
