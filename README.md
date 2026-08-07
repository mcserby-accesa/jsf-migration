# JSF → Spring Boot / Angular Migration Framework

This repository is a **skeleton for a reusable migration framework**, not a
migration of any particular application. It specifies contracts — documents,
schemas, step definitions, prompts, templates — for extracting a legacy JSF
(+ embedded BPMN) application's behavior into a format-independent,
traceable, testable specification that can then drive a Spring Boot 4 +
Angular rebuild.

Nothing in this repo parses Java, walks a BPMN file, or calls an LLM. Every
place that requires an implementation (an extractor, a validator, a renderer)
is specified as a contract: inputs, outputs, JSON Schema, and pass/fail
rules. A team adopting this framework writes those implementations against
the contracts here.

## Why this shape

Four decisions drive every doc and contract in this repo (see
[DECISIONS.md](DECISIONS.md) for the full list):

1. **Specs anchor on observable behavior, never on legacy classes.** The
   legacy code graph is a traceability index that proves completeness — it is
   not the thing being decomposed into specs.
2. **Inventory is script-generated.** The graph of legacy nodes/edges is
   produced by deterministic extractors, complete and re-runnable. LLM
   judgment begins only once that graph exists, at *interpretation*.
3. **The behavior spec is format-independent.** A `BHV-####` document is the
   single canonical artifact. Gherkin and JUnit outputs are *rendered* from
   it mechanically — they are never hand-translated between each other.
4. **Every Phase A–C step must run on a small/mid model** (Gemini-Flash
   class or similar). This is enforced structurally: bounded input, one
   judgment per call, a validated JSON Schema output, few-shot examples, and
   an escalation path — not an aspiration to be revisited later. Phase D's
   implementation step is explicitly exempt; see `DECISIONS.md`.

## Phase overview

| Phase | Name | Produces | Who/what does the work |
|---|---|---|---|
| 0 | Environment | A booted legacy app with representative data | Entry gate — manual/scripted, see [docs/phase-0-environment.md](docs/phase-0-environment.md) |
| A | Inventory | `nodes.jsonl` + `edges.jsonl`, the legacy code graph | Deterministic extractors, LLM only for classifying ambiguous cases |
| B | Behaviors | `BHV-####.md` specs, clustered and sized | Mechanical clustering + tier-M LLM confirmation/drafting |
| C | Acceptance | Acceptance criteria, decision tables, coverage triage log | Tier-M/S LLM drafting + deterministic rendering and coverage tooling |
| D | Implementation | Target application, implemented from the spec pack | Human-authored target architecture (`d0`) once, then large-model LLM implementation per behavior (`d2`) — see `DECISIONS.md`; step contracts sketched in REVIEW.md §5.6, not yet authored |

Phase A cannot start at volume until Phase 0's entry gate and Phase 0b's
walking-skeleton gate are both satisfied. Phase B cannot
be signed off until every inventory node from Phase A resolves to at least
one behavior (see [docs/metrics.md](docs/metrics.md)). Phase C cannot be
signed off until the coverage triage log is complete.

## Repository layout

```
framework.yaml            all tunable parameters, defaults + rationale
DECISIONS.md              settled decisions vs. open questions
docs/
  method.md               the method end to end, with rationale
  phase-0-environment.md  legacy boot entry gate, seed-data strategies
  phase-0b-walking-skeleton.md  one-behavior walking-skeleton entry gate
  phase-a-inventory.md    node/edge types, extraction rules
  phase-b-behaviors.md    behavior definition, taxonomy, sizing, clustering
  phase-c-acceptance.md   AC authoring, decision tables, coverage loop, triage
  metrics.md              every metric: formula, threshold, triggered action
  model-tiers.md          tier definitions, per-step table, escalation policy
steps/*.yaml               one contract per pipeline step
schemas/*.json             JSON Schema for every step's output
templates/
  BHV-template.md          canonical behavior document structure
  renderers/*.md            BHV -> Gherkin / BHV -> JUnit rendering rules
prompts/*.md               prompt template + few-shot examples, per LLM step
validators/README.md       contract for every validator referenced by a step
examples/                  one fully worked BHV, plus both renderings
```

## How to run this (conceptually)

There is no runner binary in this repo — that is an implementation left to
the adopting team. The intended shape:

1. A thin orchestrator reads `framework.yaml` for parameters.
2. For each step in `steps/*.yaml`, it resolves the step's declared input
   (a file, a single node, a single behavior — see each step's `input`),
   invokes either a script or an LLM call using the step's `prompt` template,
   and validates the raw output against the step's `output_schema`.
3. On schema failure, it retries per the step's `escalate` policy; on repeated
   failure it escalates tier and logs the event (see
   [docs/model-tiers.md](docs/model-tiers.md)).
4. Validated output is appended to the graph store (`nodes.jsonl` /
   `edges.jsonl`, loaded into DuckDB/SQLite for querying) or written as a
   `BHV-####.md` file.
5. Steps are idempotent and resumable: re-running a step against unchanged
   input reproduces the same output and does no work twice.

To execute Phase A by hand today: read
[docs/phase-a-inventory.md](docs/phase-a-inventory.md) top to bottom, build
the extractors it specifies, and run `steps/a1-extract-inventory.yaml`
through `steps/a5-validate-inventory.yaml` in order.

## Non-goals

This skeleton does not implement parsers, validators, or an orchestrator; it
does not design the target Spring Boot/Angular architecture; and it does not
analyze any specific application. See "Explicitly out of scope" in
[DECISIONS.md](DECISIONS.md).
