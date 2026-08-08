# Metrics

Every metric below states the action it triggers. A metric that triggers
nothing is not tracked — if you find yourself wanting to add a metric "for
visibility," add a report instead; this file is only for numbers that change
what happens next.

## 1. Scenario density

**Formula:** `scenarios(BHV) / ΣCC(BHV)` — count of authored scenarios
(Gherkin scenarios / AC entries, post-`c1`) divided by the sum of cyclomatic
complexity across every node the behavior `COVERS`.

**Applies to:** any `BHV` with `ΣCC(BHV) >= 5`. Below that, the ratio is not
computed — at low complexity the ratio is dominated by rounding noise, not
signal (a behavior with `ΣCC = 2` and one scenario already "scores" 0.5 with
no information content).

**Threshold / band:** healthy band 0.2–0.5, center ~1/3.

**Action:**
- Below 0.2 → flag **under-specified**. Block Phase C sign-off for this
  behavior until additional scenarios are authored (route back to `c1`) or
  a reviewer records why fewer scenarios genuinely suffice (e.g. several
  `CC` branches are provably equivalent for this behavior's purpose).
- Above 0.5 → flag **behavior too coarse / over-scenario'd**. Trigger a
  Phase B split review (`b3`/`b4` re-run on a narrower node subset) — a
  ratio this high usually means the behavior boundary bundled several
  distinct behaviors' worth of branching into one `BHV`.
- Within band → no action; informational only.

**Expiry:** this metric is a *proxy* used before real coverage data exists.
Once `c4` produces measured legacy branch coverage for a behavior, the ratio
is no longer computed or acted on for that behavior — the coverage number
from `c4` is truth, and the two metrics are not combined or averaged. Do not
resurrect the ratio for a behavior that already has coverage data, even to
"double check."

## 2. Sizing thresholds

**Formula:** AC count (post-`c1`) and Σ legacy LOC across `legacy_refs`
spans on the behavior's covered nodes.

**Threshold:** more than ~15 ACs, or more than a few hundred legacy LOC.

**Action:** either threshold crossed → split the behavior. Re-run
`b3-draft-behavior-boundary` on a narrower node subset; do not hand-split a
`BHV-####.md` file directly, since that breaks the guarantee that the split
halves' coverage is still provably complete against the original node set.

## 3. Branch coverage (completeness oracle), risk-tiered

**Formula:** for each behavior, the fraction of reachable branches across
its `legacy_refs` spans exercised by its rendered tests, as measured by
`c4` under `coverage_tool`.

**Threshold, by `risk_tier` (`docs/phase-b-behaviors.md`, "Risk tier"):**

- **`full`** — every `rule`/`process` behavior, and any behavior with
  `high_risk_override: true`. 100% of branches must reach a final state:
  "covered," or triaged as `missing_scenario` (routed back and re-covered),
  `dead_code`, or `unreachable_defensive` with justification. No acceptable
  percentage of untriaged branches for these behaviors.
- **`sampled`** — every other behavior. A sample of uncovered branches is
  triaged individually; the remainder reach the log as `not_sampled`. The
  sampling rate is recorded per-application as part of the triage log
  deliverable — this framework mandates recording the rate, not a specific
  value, since the right rate is calibration data from a pilot, not a desk
  decision. A class whose sampled branches
  show an elevated `missing_scenario` rate is escalated to full triage for
  that class, regardless of the sampling rate — a bad signal on the sample
  is not averaged away.

**Rationale for the split:** an absolute 100% gate applied uniformly is
either unachievable at real branch counts (and gets quietly ignored, which
is worse than a calibrated gate that's actually enforced) or achievable only
by paying for triage volume with no relationship to where the risk actually
is. Concentrating full triage on `rule`/`process`/high-risk behaviors puts
the expensive check where a missed branch is most costly.

**Action:** for a `full`-tier behavior, any branch not in "covered" or
"triaged" state blocks Phase C sign-off. For a `sampled`-tier behavior, any
branch not in "covered," "triaged," or "not_sampled" state blocks sign-off —
"not_sampled" is a valid final state, "nothing recorded" is not. This is
what makes the triage log a hard gate rather than a nice-to-have report.

## 4. Inventory coverage

**Formula:** fraction of `nodes.jsonl` entries with `status: "active"` that
have at least one `COVERS` edge from some `BHV`.

**Threshold:** 100%.

**Action:** below 100% blocks Phase B sign-off for the application. Every
uncovered node must be linked to a behavior or explicitly triaged as
out-of-scope with a written reason (same triage mechanism as branch
coverage — see `docs/phase-b-behaviors.md`, "Overlap and the completeness
check"). This is the mechanical enforcement of principle 1 in
`docs/method.md`: nothing found in Phase A is allowed to silently disappear
by Phase B.

## 5. Edge/reference resolution validity

**Formula:** fraction of `edges.jsonl` entries whose `from`/`to` resolve to
an existing active node, and fraction of `legacy_refs` entries (across
`nodes.jsonl` and every `BHV-####.md`) that resolve to a real `file:line`.

**Threshold:** 100%.

**Action:** any failure blocks the graph load step (`a5`) or the relevant
`BHV`'s validation (`c6`). This is a hard stop, not a warning — a dangling
reference means either the extractor has a bug or the legacy source moved
out from under the graph, and both need a human before anything downstream
is trusted.

## 6. Escalation rate per step

**Formula:** over the last 20 calls to a given step (rolling window),
`count(escalated) / 20`.

**Threshold:** > 20%.

**Action:** flag the step's input bounding for review. A step that escalates
on one in five calls is almost always mis-scoped — its "bounded input" is not
actually bounded enough, or its prompt is asking for more than one judgment.
Fix the step, not the model: reaching for a larger model here hides the
defect rather than correcting it, and leaves the step just as fragile on the
next application. The escalation log exists to identify *which* input shapes
trip the step, which is what tells you where to split it.

## 7. Spec-defect rate (human review)

**Formula:** over Phase C's Step 5b semantic-verification sample
(`docs/phase-c-acceptance.md`) — `count(items a human overturned) /
count(items reviewed)` — tracked separately for the independent-
re-derivation sample and for the mandatory `dead_code`/high-risk review.

**Applies to:** the application as a whole, not one behavior; it is a
property of the pipeline's semantic reliability, not of any single `BHV`.

**Threshold:** none fixed here. This is the one metric this framework
currently has no structural check for and no proxy against — every other
metric in this file validates shape or measured coverage, not whether an
LLM step's judgment was actually correct. It exists to be
watched, not thresholded, until a pilot establishes what rate is normal.

**Action:** a rate that is non-trivial and not trending down after repeated
correction is evidence the step's prompt or context is mis-scoped — feed it
back into the relevant `prompts/*.md`, the same way the escalation-rate
metric (#6) feeds back into how a step is bounded.

## Metrics considered and deliberately not included

- **Raw cyclomatic complexity per node**, tracked on its own: it feeds
  metric 1 and 2 above but triggers nothing by itself — CC is known to miss
  compound conditions, config combinatorics, and EL logic (see
  `DECISIONS.md`), so a raw CC threshold would be measuring the wrong thing
  in exactly the cases that matter most.
- **LLM call latency/cost**: operationally useful, but it doesn't change
  what any step does next within this framework's contract — track it in
  whatever ops tooling runs the pipeline, not here.
