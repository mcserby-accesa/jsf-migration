# Phase C — Acceptance

Goal: for every `BHV-####`, produce acceptance criteria grounded in legacy
evidence, reduce configuration combinatorics to a tractable covering set,
render both into executable test formats, run those tests against the
*legacy* app under coverage, and triage every gap until none remain
untriaged. The triage log is the deliverable that proves the spec is
complete — not just internally consistent.

Phase C requires a behavior that has passed Phase B's boundary/sizing/
completeness gates, and a `risk_tier` assigned per `docs/phase-b-behaviors.md`
("Risk tier").

## Step 1 — Derive acceptance criteria (`c1`)

Input: one behavior's confirmed node set plus the `legacy_refs` excerpts for
those nodes (bounded — this is "one behavior," not "the codebase"). Output:
a list of ACs, each phrased as Given/When/Then, each citing at least one
`legacy_refs` entry as its evidence. An AC with no legacy evidence is not
derived — it is invented, and invented ACs are exactly what this framework
is built to avoid (see `docs/method.md`, principle 1). If a genuinely new AC
is needed (a gap the legacy system never handled, deliberately being fixed in
the migration), it is authored by a human reviewer directly in the
`BHV-####.md`, flagged `origin: new`, never produced by `c1`.

ACs are written into the behavior's scenario table per
`templates/BHV-template.md` — this is the only place ACs live; nothing
downstream re-derives or re-authors them.

`c1` produces `origin: legacy` rows only. Reclassifying one as
`origin: legacy-defect` — "this is what the legacy system does, and it is
wrong" — is a human judgment made at Step 5b review, along with the
`disposition` that decides whether the replacement reproduces it. `c1` has
no basis for that call: it derives what the code does from the code, which
is exactly the evidence that cannot say whether the behavior was intended.

## Step 2 — Decision tables for compound logic (`c2`) and pairwise reduction (`c2b`, script)

Plain Given/When/Then ACs represent single-condition branches well but lose
information about **compound boolean conditions** — CC counts a compound
`if (a && b || c)` as fewer branches than the MC/DC-relevant combinations
that actually need distinct test cases to prove each condition
independently affects the outcome. For any `rule` behavior (or any behavior
node) with a compound condition:

1. `c2` (one rule/condition per call) proposes the full decision
   table: one row per condition combination relevant to MC/DC coverage of
   that specific expression, with the expected outcome and its
   `legacy_refs`.
2. Where the table's dimensions are **configuration values** rather than
   logic branches (e.g. three feature flags × two role types × four status
   values — combinatorial explosion that has nothing to do with code
   branches), `c2b` (script, deterministic) runs the table through
   `framework.yaml: combinatorial_reducer` (PICT or ACTS) to produce a
   pairwise-covering subset. This is mechanical specifically because pairwise
   reduction is a well-defined deterministic algorithm — it is not a
   judgment call, and routing it through an LLM would just be an expensive,
   less reliable way to run a known algorithm.

The distinction matters: MC/DC table rows (step `c2`) are never pairwise-
reduced — every row represents a specific claim about which condition drives
the outcome, and dropping rows would silently drop coverage claims. Only
*configuration* dimensions layered on top of a table are candidates for
pairwise reduction.

## Step 3 — Render (`c3`, script, deterministic)

ACs and decision tables are rendered into `spec_format` (`gherkin` | `junit`
| `both`, from `framework.yaml`) per the rules in
`templates/renderers/gherkin.md` and `templates/renderers/junit.md`. This
step is never an LLM call — the whole point of a format-independent
canonical spec is that rendering is a mechanical, deterministic mapping, so
that Gherkin and JUnit outputs can never drift from each other or from the
`BHV-####.md` they came from (see `docs/method.md`, principle 3). If a
rendering rule can't mechanically express something the AC/table says, that
is a bug in the renderer's rule set to fix, not a case for hand-translation.

## Step 3b — Verify the rendered artifacts load (`c3b`, script)

`c3` guarantees that the same behavior renders to the same bytes. It does
not guarantee that those bytes parse, and those are different claims. A
scenario title derived from scenario text collides with a sibling's; Markdown
emphasis from the canonical `.md` survives into a step that the harness
compiles into a regular expression; a Feature description whose reflowed
first line begins with the word "When" is read as a stray step declaration.
Each of these fails the whole file before a single assertion runs, and each
is invisible until something tries to load it — which, with implementation
out of scope, happens after handover, in a repository this framework never
sees.

So `c3b` parses `c3`'s output with a real parser for the target format —
the application's own, not a regex approximation — and checks three
structural properties the parser itself won't: unique scenario titles and
method names across the whole application, plain-text step content, and no
step keyword beginning a description line.

Every failure here is a bug in `templates/renderers/*.md` or in the authored
`BHV-####.md`, fixed at the source and re-rendered. Never in the generated
file: a hand-edited render fails `rendering_idempotent` on the next pass, and
that check is only meaningful if nobody works around it.

## Step 4 — Run against the legacy app under coverage (`c4`, script)

Rendered tests run against the legacy application (which passed the Phase 0
and Phase 0b gates) via whichever `legacy_test_seam` `framework.yaml`
declares (`rest`/`service`/`ui`), instrumented with `coverage_tool` (default
`jacoco`). Output: a coverage report keyed to legacy `file:line` ranges,
per-behavior (scoped to the `legacy_refs` spans its `COVERS` edges claim).

This is the completeness oracle: it answers "does the spec I just wrote
actually exercise what the legacy system actually does," which is a
fundamentally different (and stronger) question than "did I re-read the code
carefully enough."

## Step 5 — Triage uncovered branches (`c5`), risk-tiered

Input: **one enclosing method or class's** worth of uncovered branches at
once, **hard capped at 6 per call** — file:line, surrounding code context,
and the behavior each belongs to (bounded: one method/class, one batched
call of at most 6, one judgment per branch within it). This batches by
enclosing scope rather than calling once per branch:
most uncovered branches in a method/class share enough context that
classifying them together costs the same tokens as one branch alone would,
at a fraction of the call count, with zero loss of completeness — batching
is tried before any coverage is sacrificed. The cap exists because batching
without one just relocates the volume problem into a different failure
mode: past a handful of branches in one call, the model's judgment on
a later branch risks anchoring on an earlier one in the same batch,
producing a fluent, schema-valid, wrong classification — exactly what
the framework's bounded-input discipline exists to prevent. A
method/class with more than 6 uncovered branches is pre-split by the
orchestrator into multiple sub-batches (by ascending line number), the same
mechanical-pre-split principle as `b3`'s neighborhood cap, never solved by
using a bigger model.

**Not every behavior's uncovered branches get triaged individually.** A
behavior's `risk_tier` (`docs/phase-b-behaviors.md`, "Risk tier") decides how
much of `c5`'s output this step is exigent about:

- **`full`** (every `rule`/`process` behavior, and any behavior with
  `high_risk_override: true`): every uncovered branch is triaged. No
  exceptions.
- **`sampled`** (everything else): a sample of uncovered branches is
  triaged; the rest are recorded in the triage log as `not_sampled`. The
  sampling rate is chosen and recorded per-application — this framework
  specifies the mechanism, not the rate, since the right rate is calibration
  data from a pilot, not a desk decision. Whatever the rate,
  if a class's *sampled* branches show an unusually high rate of
  `missing_scenario`, that class's remaining branches must be triaged in
  full — a bad signal on the sample overrides the sampling rate, rather than
  being averaged away by it.

An unconditional 100%-of-everything gate looks rigorous and gets quietly
ignored in practice on a real application's branch count;
this risk tiering is meant to be a gate that is actually enforced, at the cost of
being calibrated rather than absolute.

For whichever branches are triaged, output is a classification, exactly one
of:

- **`missing_scenario`** — the branch is reachable and behaviorally relevant;
  an AC (or decision-table row) needs to be added to cover it. This routes
  back to `c1`/`c2` for that behavior, then re-runs `c4`.
- **`dead_code`** — the branch is not reachable under any realistic input in
  the current system (confirmed, not assumed — cite why: e.g. the calling
  condition is itself unreachable, or a feature flag is permanently off in
  every environment). Marked **do not migrate**; the `BHV` records this
  explicitly rather than silently omitting the code path. Every `dead_code`
  verdict additionally requires mandatory human review — see Step 5b.
- **`unreachable_defensive`** — the branch is reachable in principle but
  guards against a condition that legitimately can't occur given the
  system's actual invariants (a null-check after a non-null contract, a
  default case in an exhaustive enum switch). Accepted **with a written
  justification** — this is not a free pass; a triage entry that just says
  "defensive" without explaining *why* the guarded condition can't occur
  fails review.

Every triage decision (including `not_sampled` bookkeeping entries) is
appended to the application's triage log (one log, not one per behavior — it
is a deliverable read as a whole, since patterns across entries are how a
reviewer catches a `c5` call that's rationalizing missing coverage as
"defensive" too often). See `schemas/c5-triage-uncovered-
branch.schema.json` for the entry shape.

## Step 5b — Semantic verification (sample-based)

None of `validators/README.md`'s checks are semantic — they confirm shapes,
not that a lift or a decision table means what the legacy code meant. This
step adds the one semantic check the framework has:

1. **Independent re-derivation on a sample.** For a sample of `c1`/`c2`
   outputs, re-run the same step with a differently-framed prompt (same
   input, restated instructions) and diff the two outputs. A divergence
   flags the original for human review — it does not by itself mean either
   output is wrong, only that the step's judgment wasn't stable on this
   input.
2. **Mandatory human review**, not sampled: every `dead_code` triage verdict
   (irreversible — it means "do not migrate"), and every `rule` behavior
   whose taxonomy or `high_risk_override` marks it as touching money,
   authorization, or a state transition. This review is also where a
   scenario is reclassified `origin: legacy-defect` and given its
   `disposition` — see step 1. A defect that reaches an implementer as an
   ordinary requirement gets rebuilt, and the framework has no other point
   at which anyone is looking at legacy behavior and asking whether it was
   intended.
3. **Track the spec-defect rate** — the fraction of reviewed items a human
   overturns. See `docs/metrics.md` #7. This is the number that says whether
   the pipeline is actually producing correct specs, as opposed to merely
   schema-valid ones — a schema-valid, confidently wrong answer passes every
   structural gate in this framework.

The sample size for (1) is calibration data, deferred to pilot evidence, same
as `c5`'s sampling rate — the mechanism is decided now, the rate is not.

## Step 5c — Derive the endpoint contract and bind scenarios to it (`c7`, script; `c7b`)

`c7` derives the target REST contract mechanically from the legacy surface
plus the application's `target-conventions.yaml` — see `docs/spec-pack.md`,
"The API contract." Two things about its scope matter here.

First, the surface is the whole client-visible surface. A legacy JSF screen
that renders from bean properties, a navigation menu, a converter that
formats a value for display: none is a public service method, and each is
something the replacement's client must fetch from somewhere. `c7` records
a verdict for every `SCR` and `NAV` node as well as every `SVC` method — an
operation, or `client_side_only`, or unmapped-with-a-reason routed to `c8`.

Second, `c7b` then binds each of the behavior's scenarios to where the
target can observe it: a named operation, the client, the domain layer, or
nowhere. This is one bounded call per behavior, and it exists because a
scenario's Given/When/Then is written in the legacy system's terms. "The
login page is served inline at HTTP 200." "The browser navigates to /logout
via a plain href." Each is a true, evidenced statement about a page-based
application, and each needs a decision before it can be checked against a
system with no pages.

That decision is unavoidable. What is avoidable is making it fifty separate
times, at implementation time, with no record — which is what happens when
the pack ships the scenario and not the binding. `c7b` makes it once,
against the derived contract and the conventions file's stated translation
policy, and records it in `behaviors/scenario-bindings.json`.

A binding never rewrites a scenario. The scenario remains a statement about
the legacy system and `c4` still runs it against the legacy system; a
binding that adapts rather than preserves the legacy meaning says so, and
that seeds an open-questions entry.

## Step 6 — Validate (`c6`, script/validator)

Deterministic checks before a behavior's acceptance work is considered done:

1. Every AC and decision-table row cites at least one resolvable
   `legacy_refs` entry (or is explicitly `origin: new`).
2. Rendered Gherkin/JUnit output exists for every `spec_format` value
   configured, round-trips (re-rendering from the same `BHV-####.md`
   produces byte-identical output — idempotence of `c3`), and loads under a
   real parser with unique titles and plain-text steps (`c3b`).
2b. Every scenario has exactly one surface binding, and every
   `origin: legacy-defect` scenario has a `disposition` — plus a
   `replaced_by_scenario_id` when that disposition is `fix`.
3. The triage log has zero entries for this behavior with status
   `unresolved` — every uncovered branch reached a final state: one of the
   three classifications above, or (only for a `sampled`-tier behavior)
   `not_sampled`.
4. No `unreachable_defensive` entry is missing its justification field.
5. Every `dead_code` entry, and every `rule`/high-risk behavior, has a
   recorded Step 5b human review outcome.

A behavior does not exit Phase C until `c6` passes. See
`validators/README.md`.

## What Phase C explicitly does not produce

Test harnesses, fixtures, seed-data wiring for the *new* system, or CI
pipeline configuration. Phase C's contract ends at a validated, rendered
spec, a coverage-backed triage log, and the derived API contract. Anything
built on top of those belongs to whoever implements the replacement, which
this framework does not do (see `DECISIONS.md`).

Note also what Phase C cannot reach: at the default `legacy_test_seam:
service`, `c4` never renders a page, so EL and navigation rules extracted in
Phase A are specified here but executed by nothing. Validating those is
Phase D's job — see `DECISIONS.md`.
