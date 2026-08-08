# Phase D — Spec validation

Phase D drives the derived acceptance criteria through a **browser against the
running legacy application**, to check that the specs describe what the legacy
system actually does.

It validates the spec, not the replacement. The framework never tests the
target system (`DECISIONS.md`, "Phase D is spec validation, not
implementation"), so the seam here is fixed rather than chosen: the legacy app,
through a browser, at the URL Phase 0 booted.

## Why it exists — the gap it closes

Everything else in this framework proves the spec is *complete*. Phase D is the
only thing that checks whether part of it is *true*.

At the default `legacy_test_seam: service`, `c4` never renders a page. So this
happens, and it happens to the framework's headline claim:

1. `a1` extracts every `rendered`/`disabled`/`required` EL expression, because
   JaCoCo cannot see them.
2. `a3-lift-rule` lifts each into an explicit `RULE` with a plain-language
   statement of the condition.
3. `c1` turns it into acceptance criteria; `c2` builds a decision table when
   the condition is compound; `c3` renders it into a test.
4. That test runs at the service seam, where **no page is rendered and the
   rule is never evaluated.**

The same is true of every `NAV` navigation rule, and now of every
`render_guard` on a `layout_tree` container — conditional layout is EL-derived,
and `layout_tree_complete` checks only that a guard *resolves to a real rule*,
never that the panel actually disappears when that rule is false.

Those lifts are the framework's central contribution and, without Phase D,
they are claims no step checks. That is the gap. It is not redundant with
`c4`; it is the part `c4` structurally cannot reach.

**A failure here means the spec is wrong.** That inverts the normal reading of
a red test and is the single most important thing to understand about this
phase: `c4` failing says the tests don't match the code; `d1` failing says the
*lift* was wrong — the rule was misread, or the condition was inverted, or a
property was misattributed. The fix routes back to `a3`, not to the app.

## What is rendered, and from what

Phase D adds no new authored content. `playwright` becomes a third
`spec_format`, rendered by `c3` from the same canonical `BHV-####.md` as
Gherkin and JUnit (`templates/renderers/playwright.md`). Principle 3 applies
unchanged: hand-writing browser tests from the pack would breach the
one-spec-rendered-outward rule exactly as hand-translating Gherkin to JUnit
would.

What makes a browser test *derivable* rather than authored is that the pack
already carries the four things one needs, and the last two only since the
layout work:

| Needed | Where it comes from |
|---|---|
| Which page to open | `SCR.view_path`; `TPL.nav_menu[].target_view` |
| How to locate an element | `form_fields[].client_id` (with `id` as fallback); `EL.client_id` for a guarded container |
| Which element a rule governs | the `RULE`'s `DERIVED_FROM` edge to its `EL`, whose `attached_component_id` names it; and the `render_guard` on the `layout_tree` container |
| Which condition combinations to exercise | the behavior's decision table, already built by `c2`/`c2b` |

That last row is what makes this cheap. An EL-derived rule with a compound
condition **already has** a table of condition combinations, reduced by
`c2b`. Each row becomes one browser case: put the app in that state, assert
the element's visibility. The renderer joins three things the pack already
holds — which element (`render_guard` → `EL`), what condition (the `RULE`),
which combinations (the decision table) — and invents none of them.

## What the framework does not render: fixtures

A test asserting "the panel is hidden when status is APPROVED" has to put the
application into that state. The framework does not know how, and will not
guess: it has no authority to write SQL against your seeded database.

So the renderer emits a call to a **named setup hook per scenario**, which the
adopting team implements once — exactly the relationship `c3`'s Gherkin already
has with its step definitions. `behaviors/step-index.json`'s discipline
applies: a hook shared by several scenarios is named once with one owner.

This is a real cost and it is the honest one. The framework renders the
navigation and the assertions, which are derivable, and hands you the state
setup, which is not.

## Scope — `spec_validation_scope`

Running every scenario through a browser is the effort explosion
`docs/phase-0-environment.md` already warns about for the `ui` seam: driving
JSF ViewState and partial-ajax through a browser is where the work goes. Phase
D avoids it by validating the rules `c4` cannot reach rather than everything.

`framework.yaml: spec_validation_scope`:

| Value | Validates |
|---|---|
| `none` | nothing — and the pack records how many lifted rules therefore went unverified |
| `view_and_high_risk` *(default)* | every behavior covering a `RULE` derived from an `EL` or `NAV` node, plus anything `high_risk_override: true` |
| `full` | every behavior in the pack |

The default is not a compromise, it is the shape of the problem: those are
exactly the behaviors whose evidence `c4` structurally cannot produce.
Everything else already has a coverage-backed test, so putting it through a
browser buys a second look at something already checked.

**`none` is a legitimate choice.** Whether validating the spec is worth the
investment is the adopting team's call, and the framework has no standing to
insist. Record it at the Phase 0 gate alongside `legacy_test_seam`, where the
seam decision and what it forfeits are already written down.

**What `none` must not be is silent.** A pack with two hundred EL-derived
rules and no validation is a pack whose central claim rests on two hundred
unchecked lifts, and that has to be visible to whoever opens it — not
discoverable only by reading someone's `framework.yaml`. So:

- `c9` records `spec_validation` in the manifest: the scope, how many lifted
  rules were in scope, how many were validated, how many were not.
- Every lifted rule that went unvalidated seeds an open-questions entry
  (`unvalidated_lifted_rule`), stating that the rule is a claim no step
  checked.

Same discipline as `not_sampled` in the triage log: declining work is fine,
declining it without a record is not. "We chose not to validate these" and
"there was nothing to validate" must not read identically.

## The steps

| Step | Kind | Does |
|---|---|---|
| `c3-render-tests` | script | renders `playwright` alongside `gherkin`/`junit`, per `spec_format` |
| `c3b-verify-rendered-artifacts` | script | parses the rendered spec files, as it already does for the other formats |
| `d1-run-spec-validation` | script | runs them against the booted legacy app and reports per-rule outcomes |

There is no LLM step in Phase D. Nothing here is a judgment: the rendering is
a deterministic mapping and the run is a run. A `d1` failure routes back to
`a3-lift-rule` for a human to look at, which is a review action, not a retry.

## `d1`'s report is rule-level, not scenario-level

`c4` reports branch coverage. `d1` reports **rule validation**: for every
lifted `RULE` in scope, whether a browser case actually exercised it and what
happened. That is the artefact, because "94% of scenarios passed" says nothing
about whether the twelve EL lifts in this behavior were among them.

Four outcomes per rule, and the third is the one that matters:

- `validated` — a case exercised the rule and the legacy app behaved as the
  lift says.
- `contradicted` — a case exercised it and the app did not. **The spec is
  wrong.** Blocks Phase C sign-off for the owning behavior and routes to
  `a3-lift-rule` review.
- `not_exercised` — a case exists but could not reach the state (the seeded
  data cannot produce it). A finding about the fixture set, recorded, not a
  pass.
- `out_of_scope` — excluded by `spec_validation_scope`, counted and seeded
  into the open-questions register.

`not_exercised` deserves its own outcome for the reason Phase 0 gives about
seed data: "unreachable given this data" and "unreachable given any data" are
different claims, and only the second one is about the application.

## Entry criteria

Phase D runs after `c6` has signed off the behaviors it covers, and needs:

1. The legacy app booted and reachable **in a browser** — Phase 0 criterion 6,
   which `a8` already requires for screen capture. If `a8` ran, this holds.
2. Seeded accounts for the `AUTHN` node's `declared_roles`, since a
   role-conditional EL rule cannot be exercised without one user per role.
   Phase 0 criterion 6 covers this too.
3. `spec_validation_scope` set, and its value recorded in the Phase 0
   checklist with the reason.

## Exit criteria

Every lifted `RULE` in scope has one of the four outcomes above, and none is
`contradicted`. A `contradicted` rule is not a Phase D failure to be waived —
it is a defective spec, and shipping a pack containing one would ship a stated
falsehood about the legacy system.

Rules outside scope are counted and registered rather than resolved. See
`validators/README.md`, `spec_validation_recorded`.
