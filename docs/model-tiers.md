# Model tiers

Every LLM step in this framework declares a tier — S, M, or L — and every
tier is a bundle of hard constraints, not a vague notion of "how smart a
model this needs." The constraints exist so that a Gemini-Flash-class model
(tier S) or a Gemini-Pro-class model (tier M) can execute the step correctly
on the first or second try, essentially always. See `framework.yaml:
model_tiers` for the (swappable) model-family mapping — no step contract or
prompt ever names a vendor model directly.

**Scope note (2026-08-07):** the tier system, and `DECISIONS.md` principle 4
that motivates it, apply to the **specification pipeline — Phases A–C**.
Phase D's `d2-implement-behavior` is explicitly exempt: implementing a
Spring Boot service from a `BHV` spec is a synthesis task no input-bounding
makes tier-S/M-shaped, and it defaults to the largest available model by
design, not as an escalation. Do not add `d2` to the per-step tier table
below as if it belonged in this system.

## Tier definitions

### Tier S — single bounded classification/extraction

- Input: one node, one edge, or one raw expression — never more than what
  fits on one screen of text.
- Judgment: a single classification, confirmation, or short extraction.
  Typically an enum choice or a short structured description.
- Output: a small JSON object, few fields, validated against a strict schema.
- Examples in this framework: `a2-classify-ambiguous-node`,
  `a3-lift-el-expression`, `a4-confirm-edge-inference`,
  `c5-triage-uncovered-branch`.

### Tier M — bounded synthesis over a small, pre-reduced set

- Input: one behavior's confirmed node set, one candidate cluster of 2–5
  items produced by a mechanical pre-reduction step, or one bounded local
  subgraph (hard-capped, e.g. 2 hops) — never "the codebase" or "all
  screens."
- Judgment: still exactly one — draft this spec, confirm/reject this
  cluster, propose this boundary, derive ACs for this one behavior. Tier M
  is not "tier S but with more judgments crammed into one call"; it's tier S
  with a larger but still strictly bounded *input*.
- Output: a structured document (e.g. `BHV-####.md` body fields) or a longer
  JSON object, still validated against a schema.
- Examples: `b2-confirm-rule-behavior`, `b3-draft-behavior-boundary`,
  `b4-write-behavior-spec`, `c1-derive-acceptance-criteria`,
  `c2-build-decision-table`.
- **Every tier-M step in this framework exists because a mechanical
  pre-reduction step feeds it a bounded candidate**, not because the task
  seemed to need a bigger model. `b2` only runs after `b1`'s clone/AST-
  similarity detector has already found the candidate cluster; `b3`'s
  neighborhood is hop-capped and pre-split if it would otherwise overflow.
  If you are tempted to write a new tier-M step whose input is not the
  output of some mechanical reduction, that is a sign the step needs a
  reduction step added in front of it, not a sign it should be tier L.

### Tier L — reserved for escalation only

- No step in this framework is *authored* to default to tier L. It exists
  purely as the escalation target when a tier-M call keeps failing (see
  below).
- If a pilot run shows a specific step consistently needs tier L as its
  steady state, that is a finding to bring back into this document and
  `DECISIONS.md` — it means either the step's input bounding is wrong or a
  mechanical pre-reduction is missing, and the fix is almost always to add
  that reduction rather than to permanently move the step to tier L.

## Per-step tier table

| Step | Tier | Why not a smaller tier |
|---|---|---|
| `a1-extract-inventory` | script | Deterministic extraction; no judgment |
| `a2-classify-ambiguous-node` | S | One node, one enum choice |
| `a3-lift-el-expression` | S | One EL string + its one attached component; a short paraphrase, not a synthesis |
| `a4-confirm-edge-inference` | S | One candidate edge, choose among a short list of static-analysis candidates |
| `a5-validate-inventory` | script | Deterministic checks |
| `a6-lift-db-logic` | S | One trigger/procedure body + its one lift, same shape as `a3` |
| `b1-detect-rule-similarity-candidates` | script | Clone/AST-similarity detection is a mechanical algorithm — this is the mandatory pre-reduction that keeps `b2` at tier M instead of needing whole-codebase reasoning |
| `b2-confirm-rule-behavior` | M | Judges one 2–5-item cluster `b1` already found; would be S except confirming "is this really the same rule" sometimes requires reading two full method bodies side by side, which exceeds tier-S's "one screen of text" budget |
| `b3-draft-behavior-boundary` | M | Bounded 2-hop neighborhood, but drafting *which* nodes belong is a genuine synthesis judgment, not a classification |
| `b4-write-behavior-spec` | M | Drafting prose scenarios from a confirmed node set + legacy excerpts is a synthesis/writing task |
| `b5-check-sizing-and-density` | script | Arithmetic against thresholds in `docs/metrics.md` |
| `c1-derive-acceptance-criteria` | M | Synthesizing a full AC list from a behavior's evidence is a multi-fact synthesis, not a single classification |
| `c2-build-decision-table` | M | Enumerating MC/DC-relevant rows for one compound condition requires holding several conditions in mind at once |
| `c2b-pairwise-reduce` | script | PICT/ACTS is a deterministic algorithm; routing it through an LLM would be strictly worse |
| `c3-render-tests` | script | Deterministic template rendering — this is the core guarantee that Gherkin/JUnit never hand-drift (`docs/method.md`, principle 3) |
| `c4-run-coverage-oracle` | script | Runs tests under a coverage tool; no judgment |
| `c5-triage-uncovered-branch` | S | One branch, one three-way classification |
| `c6-validate-acceptance-spec` | script | Deterministic checks |

## Escalation policy

Every tier-S and tier-M step declares, in its `steps/*.yaml` contract:

```yaml
escalate:
  trigger: 3 consecutive schema-validation failures OR low-confidence output twice in a row
  action: retry the same call at the next tier up (S -> M -> L), with the same bounded
          input plus one additional ring of context if the step's input definition allows
          it (e.g. b3's 2-hop cap becomes 3-hop only for the escalated retry, never as a
          permanent change to the step's default). Log the escalation event.
```

**Escalation retry count is 3** — chosen as a default that tolerates one or
two model hiccups without masking a genuinely mis-scoped step; revisit after
a pilot (see `DECISIONS.md`, open question #2).

**Every escalation is logged**, not just retried silently:

```json
{
  "step": "b3-draft-behavior-boundary",
  "input_ref": "SCR-0142",
  "attempt_tier": "M",
  "escalated_to": "L",
  "reason": "3 consecutive schema-validation failures",
  "timestamp": "..."
}
```

This log is what feeds metric 6 in `docs/metrics.md` (escalation rate per
step, 20-call rolling window, >20% triggers a tier-assignment review). The
point of logging every escalation — not just acting on it in the moment — is
that the per-step tier table above is a *hypothesis*, stated with its
justification column so a reviewer can tell which steps were guesses. A
pilot's escalation log is what turns those hypotheses into evidence, and
this document should be edited to match that evidence afterward rather than
treated as permanent.

## Prompting constraints (apply to every LLM step, any tier)

- Plain-text prompt + an explicit instruction to return JSON matching the
  step's schema. No vendor-specific tool-use or structured-output/function-
  calling feature — this keeps every step portable across model providers
  without touching the prompt.
- Every prompt in `prompts/*.md` includes at least two few-shot examples:
  one that produces a "normal" confident output and one that demonstrates
  the low-confidence/escalate-worthy case, so the model has seen what
  "I'm not sure" should look like in the schema (e.g. a `confidence` field
  or an explicit `needs_escalation: true`), not just what a confident answer
  looks like.
- Output is validated externally against `schemas/*.json` — the model is
  never trusted to have self-validated its own JSON.
- Steps are idempotent: re-running the same input against the same step
  produces the same classification/content (schema-conformant, not
  necessarily byte-identical prose) — this is enforced by keeping the
  prompt fully determined by the bounded input, with no session/conversation
  state carried between calls.
