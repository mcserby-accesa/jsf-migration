# JSF → Spring Boot / Angular Migration Framework

A method for extracting what a legacy JSF application *does* into a complete,
traceable, testable specification — so the rebuild is driven by a verified
description of the old system rather than by someone reading the old code and
writing the new code at the same time.

**This repository is the framework, not a migration.** It contains contracts:
documents, JSON schemas, step definitions, prompts, and templates. Nothing
here parses Java, walks a BPMN file, or calls a model. A team adopting it
writes those implementations against the contracts specified here.

## What you get out of it

One directory, the **spec pack**, describing your legacy application well
enough to rebuild it without ever opening the legacy source:

| | |
|---|---|
| Behavior specs | What the system does, in observable terms, one document per behavior |
| Executable tests | The same specs rendered as Gherkin and/or JUnit |
| Inventory graph | Every screen, service, rule, process, job, table, and how they connect |
| Page & service skeletons | Field groups, widget kinds, table columns, method signatures — what replaces "go read the `.xhtml`" |
| REST API contract | OpenAPI, derived from the legacy service surface + your conventions |
| BPMN definitions | Copied byte-for-byte, plus an inventory of what each task binds to |
| Data model | Tables, columns, keys, triggers, procedures |
| Coverage triage log | Every legacy branch the specs *didn't* reach, and why that's acceptable |

Full manifest: [docs/spec-pack.md](docs/spec-pack.md).

**Building the replacement application is not part of this framework.** The
spec pack is the handoff. See [DECISIONS.md](DECISIONS.md), "explicitly out
of scope."

## Why it's shaped this way

Migrations that work by re-reading the old code fail in two predictable ways:
business rules hidden outside the obvious classes get silently dropped, and
the new system is validated against specs written by the same person who just
read the same code — so the spec and the implementation share blind spots and
confirm each other.

Four decisions follow from that:

1. **Specs describe behavior, not classes.** A behavior is "what happens when
   a manager rejects a leave request," never "the migration of
   `LeaveServiceBean`." The code graph proves coverage; it isn't the unit of
   work.
2. **Machines find things; models only interpret them.** Every node in the
   inventory comes from a deterministic extractor. A model is never asked
   "what's in this codebase" — only "this specific thing was found and is
   ambiguous; which is it?"
3. **One spec, rendered outward.** Acceptance criteria are authored in exactly
   one place. Gherkin and JUnit are generated from it, so they cannot drift
   apart.
4. **Every step is small enough to be checked.** One bounded input, one
   judgment, a schema-validated answer. This is why the work is decomposed
   the way it is. A side effect worth having: a small, cheap model can run
   the whole pipeline. Which model you actually use is your call — the
   framework doesn't specify one.

## The phases

Each phase has a gate. You do not proceed past a failing gate.

| | Phase | What you do | What you get | Gate to pass |
|---|---|---|---|---|
| **0** | Environment | Boot the legacy app with representative data | A running system to extract from and test against | It boots; the coverage tool attaches |
| **0b** | Walking skeleton | Hand-carry *one* behavior all the way through | Proof the whole pipeline works on your app | A real test runs and reports real coverage |
| **A** | Inventory | Run extractors over source, views, config, DB, BPMN | `nodes.jsonl` + `edges.jsonl` — the legacy graph | Nothing ambiguous or unresolvable remains |
| **B** | Behaviors | Group graph nodes into behaviors and draft their specs | `BHV-####.md` documents, correctly sized | Every node belongs to some behavior |
| **C** | Acceptance | Write acceptance criteria, render tests, run them against the legacy app, triage what they missed | Tests, decision tables, triage log, API contract | Zero untriaged branches |
| **D** | Spec validation | Drive the specs through a browser against the legacy app | Confirmation the specs match reality | *(designed, not yet authored)* |

Phase 0 and 0b are one-time entry gates. A, B, and C repeat per behavior.

**Phase 0 — Environment.** Extractors can't tell "this doesn't exist" from
"I couldn't reach it," and tests can't measure coverage on an app that won't
run. Everything downstream assumes a booted app. [Details](docs/phase-0-environment.md)

**Phase 0b — Walking skeleton.** Before producing fifty specs, prove one can
make it end to end and produce attributable coverage. This tests the
framework's own riskiest assumption first, not after months of work.
[Details](docs/phase-0b-walking-skeleton.md)

**Phase A — Inventory.** Deterministic scanners walk Java, `.xhtml` views,
`faces-config.xml`, the database catalog, BPMN files, and scheduler config.
Anything unambiguous is written straight through; anything ambiguous is
routed to a single bounded model call. EL expressions get special handling —
coverage tools cannot see them, so each one is extracted and translated into
an explicit rule, which is what stops view-layer logic from vanishing.
[Details](docs/phase-a-inventory.md)

**Phase B — Behaviors.** Behaviors are drafted from the graph. Screen and
process behaviors start from one node and its immediate neighborhood. Reused
*rule* behaviors — the ones teams miss, because they aren't attached to any
one screen — are found by clone detection first, then confirmed one candidate
at a time. [Details](docs/phase-b-behaviors.md)

**Phase C — Acceptance.** Acceptance criteria are derived from each
behavior's cited legacy evidence, never invented. Compound conditions get
decision tables. Everything renders mechanically into tests, which run
against the *legacy* app under coverage. Whatever the tests don't reach gets
classified: missing scenario, dead code, or defensive-and-justified. That
triage log is the proof the spec is complete. [Details](docs/phase-c-acceptance.md)

**Phase D — Spec validation.** Phase C's tests run at the service layer, so
they never render a page — meaning the EL and navigation rules extracted in
Phase A are specified but never actually executed. Phase D closes that with
browser-driven tests against the legacy app. Designed, not yet authored; see
[DECISIONS.md](DECISIONS.md).

## How to use it

**1. Read two documents.** [docs/method.md](docs/method.md) for the method
and its reasoning, then [docs/spec-pack.md](docs/spec-pack.md) for what
you're building toward.

**2. Configure.** Copy [framework.yaml](framework.yaml) and set the handful
of parameters for your application — output format, coverage tool, BPMN
engine, which layer to test against. Each parameter documents what it does
and what reads it. Copy [templates/api-conventions.yaml](templates/api-conventions.yaml)
too, and fill in your target API conventions. Note that the framework does
not specify which LLM to use; steps say only whether they need a model or a
script, and every model-driven step is bounded small enough that a cheap
model handles it.

**3. Pass Phase 0.** Get the legacy app booting with representative data and
confirm your coverage tool attaches. Do not skip ahead — everything after
this assumes it.

**4. Pass Phase 0b.** Pick one small, real behavior. Write its spec by hand,
render it, run it, get coverage back. When that works end to end, the
pipeline is proven on your application.

**5. Build the extractors.** [docs/phase-a-inventory.md](docs/phase-a-inventory.md)
specifies exactly what each one must produce — node types, edge types,
required fields, extraction rules. Build to that specification.

**6. Run the pipeline.** Work through `steps/` in order: `a1`→`a6`, then
`b1`→`b5`, then `c1`→`c9`. Each `steps/*.yaml` names its input, its output
schema, its validators, and what happens on failure.

**7. Hand over the spec pack.** `c9` assembles it and runs the completeness
gate. If that gate fails, the pack is not ready — fix the step that owns the
missing part and re-run, never patch the assembled pack by hand.

You'll need an orchestrator — a thin runner that reads `framework.yaml`,
resolves each step's declared input, calls either a script or a model, and
validates the output against the step's schema. This repository does not
provide one. Steps are designed to be idempotent and resumable, so a re-run
against unchanged input does no work twice.

## Terms used throughout

| Term | Means |
|---|---|
| **Behavior** (`BHV-####`) | The unit of specification: something a user or system observes, not a class |
| **Node / edge** | An item in the legacy graph (screen, service, rule, table…) and a relationship between two |
| **Seam** | The layer tests attach to — direct method calls (`service`), HTTP (`rest`), or a browser (`ui`) |
| **Lift** | Turning a raw expression (an EL condition, a trigger body) into a plain-language rule |
| **Coverage oracle** | Running derived tests against the *legacy* app to measure what the spec actually exercises |
| **Triage** | Classifying a branch the tests didn't reach: missing scenario, dead code, or defensive |
| **Spec pack** | The framework's output: the complete deliverable directory |
| **Original / projection** | Inside the pack: the one authoritative copy of a fact, vs. a regenerated re-shaping of it |
| **Walking skeleton** | One behavior carried end to end early, to prove the pipeline works |
| **MC/DC** | A coverage standard requiring each condition in a compound boolean be shown to independently affect the outcome |

## Repository layout

```
framework.yaml            parameters, with defaults and rationale
DECISIONS.md              what's settled, what's still open
REVIEW.md                 a critical review of this framework, and its history

docs/
  method.md               the method end to end — read first
  spec-pack.md            the deliverable: manifest and completeness gate
  phase-*.md              one document per phase
  metrics.md              every metric: formula, threshold, what it triggers

steps/*.yaml              one contract per pipeline step
schemas/*.json            output schema for every step
validators/README.md      what every validator checks and when
prompts/*.md              prompt template + examples, per model-driven step
templates/
  BHV-template.md         the behavior document structure
  api-conventions.yaml    your target API conventions — fill this in
  renderers/*.md          how a behavior becomes Gherkin / JUnit
examples/                 one fully worked behavior, both renderings
```

## Non-goals

No parsers, validators, or orchestrator implementations. No target
architecture design. No analysis of any specific application. No data
migration. See [DECISIONS.md](DECISIONS.md).
