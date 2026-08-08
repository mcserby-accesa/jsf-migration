# Phase 0b — Walking skeleton (entry gate)

Phase 0b is a **gate**, like Phase 0 — one-time per application, not a
repeatable pipeline step. There is no `steps/0b-*.yaml` contract for it, for
the same reason Phase 0 has none (`DECISIONS.md`, open question #9): it is a
checklist with a binary pass/fail outcome, not something resumed or re-run
per node/behavior.

It runs **between Phase 0 and Phase A at volume.** Phase 0 proves the legacy
app boots, has data, and is reachable. Phase 0b proves something stronger
and more specific: that this framework's entire differentiating claim — a
behavior spec validated against *measured legacy coverage*, not a second
careful reading of the code (`docs/method.md`) — can actually be produced
end to end on this application, by carrying exactly one behavior through
`c1 → c2 → c3 → c4` until a rendered test executes against the booted
legacy app and yields a coverage report attributable to that behavior's
`legacy_refs` spans.

## Why this gate exists

Without it, the pipeline is a waterfall in which the single riskiest
component — the coverage oracle (`c4`), which every downstream construct in
Phase C is defined in terms of (see `docs/phase-c-acceptance.md`,
`docs/metrics.md` #3) — is validated last, after Phase A and Phase B have
already produced a full inventory and a full set of drafted behaviors. If
`c4` cannot actually run on this application (wrong seam, coverage tool
doesn't attach to what's actually exercised, rendered skeleton needs
hand-authored literals `c3` can't mechanically derive), that is dramatically
cheaper to discover from one behavior than from fifty.

This is the same mechanism the current skeleton's own validation exercise
uses on itself before it has met a real codebase (see `docs/method.md`'s
pipeline diagram) — Phase 0b is that discipline written
into the framework as something every future application runs, not only a
one-off check performed on this skeleton.

## Procedure

1. **Pick one behavior** — representative, not worst-case. It should have:
   an EL-gated element (`rendered`/`disabled`/`required`), ideally a compound
   condition, a real database read or write, and someone available who knows
   what it's supposed to do (for comparing the result against, informally —
   this gate does not require a formal ground-truth diff; that level of
   rigor belongs to a pilot, not this gate).
2. **Produce the inventory slice** for that behavior and its immediate
   neighborhood — by the real Phase A extractors if they already exist for
   this application/stack, or by hand/throwaway script if this is the first
   time the framework is being applied here. Building the extractors is not
   a prerequisite for this gate.
3. **Draft the boundary and spec** (`b3`/`b4`), lifting any EL expressions
   (`a3`) the behavior depends on.
4. **Derive ACs and decision tables** (`c1`, `c2` if a compound condition is
   present).
5. **Render** (`c3`) into whichever `spec_format` this application uses.
6. **Wire the rendered test to actually run** against the booted legacy app,
   through the `legacy_test_seam` chosen at the Phase 0 gate, under
   `coverage_tool`. This is the one piece of harness construction this gate
   requires — scoped to exactly one behavior's test, by whatever means work
   (hardcoded setup is fine). It is not general harness/fixture/CI
   construction, which remains a stated non-goal (`DECISIONS.md`).
7. **Run `c4`.** Confirm the resulting coverage report's branch entries are
   attributable to this behavior's `legacy_refs` spans.

## Pass criteria

Step 7 produces an attributable branch report. Record and keep, since this
feeds Phase C's per-behavior cost planning going forward:

- Elapsed time from "app boots" (Phase 0 exit) to "attributable branch
  report in hand" — the framework's "time to first covered test" number.
- Which `legacy_test_seam` was used and what it forfeited (should match the
  choice and rationale already recorded at the Phase 0 gate).
- How much hand-wiring Step 6 took beyond what `c3` actually emitted — this
  is the concrete size of the gap between "rendered skeleton" and "running
  test," and it is real, ongoing cost, not a one-time setup cost, if it
  recurs per behavior.
- Whether coverage of *shared* code (a utility invoked by the test but
  outside this behavior's claimed spans) appeared in the report, and how it
  was attributed — an open question the coverage-attribution validators
  (`validators/README.md`) need an answer to before Phase C runs at volume.

## Fail criteria

If Step 7 does not produce attributable coverage, **stop.** Do not proceed
to Phase A at volume — the completeness oracle does not run on this
application yet, and that is more valuable to know now than after Phase A/B
have produced a full graph and behavior set on the strength of an assumption
that turned out false. Report what blocked it; likely candidates:

- The chosen seam doesn't actually reach the code the behavior depends on.
- `coverage_tool` doesn't attach to the code actually exercised (a Phase 0
  regression — re-check that gate, don't just retry here).
- The rendered skeleton needed hand-authored literals, harness APIs, or
  assertions `c3` could not mechanically derive from the `BHV` — a renderer
  defect to fix (`templates/renderers/*.md`), not a one-off workaround to
  paper over.

A failure here is scoped and reported, the same way it would be for the
framework's own validation exercise — this gate exists
specifically so that finding surfaces on one behavior, not fifty.

## Re-checking

Re-run this gate under the same triggers as Phase 0: the legacy app's
runtime environment changes, the seed dataset is replaced, or a long gap (a
few months) elapses between this gate and the start of Phase A on the same
application.
