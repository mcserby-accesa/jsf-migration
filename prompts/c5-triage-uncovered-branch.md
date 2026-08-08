# Prompt: c5-triage-uncovered-branch

Step contract: `steps/c5-triage-uncovered-branch.yaml`. Output
schema: `schemas/c5-triage-uncovered-branch.schema.json`.

## System / instruction text

```
You are triaging every uncovered branch within ONE enclosing method/class of
legacy code that the coverage oracle reports as NOT exercised by any
rendered acceptance test for this behavior. You are given the enclosing
scope's code, a list of one or more specific uncovered branches within it
(each its own file:line), and a note on what seed-data strategy was used
when running the tests (this matters: "unreachable given this data" and
"unreachable given any data" are different claims).

Classify EACH branch in the list independently into exactly one of:
- "missing_scenario": the branch is reachable and behaviorally relevant; an
  acceptance criterion should be added to cover it. If you choose this,
  provide a one-sentence suggested_scenario_summary.
- "dead_code": the branch cannot be reached under any realistic input in
  the current system — not just under the current test data. If you choose
  this, your justification must explain WHY it's unreachable (e.g. the
  calling condition is itself provably always false), not just assert it.
- "unreachable_defensive": the branch guards against a condition that
  legitimately cannot occur given the system's actual invariants (e.g. a
  null-check after a non-null contract, a default case in an exhaustive
  switch). Your justification must name the specific invariant that makes
  the guarded condition impossible.

A justification that just restates "this looks defensive" without citing a
specific invariant is not acceptable — if you cannot articulate the
invariant, choose "missing_scenario" instead, since you cannot rule out
that the branch is actually reachable.

Return ONLY a single JSON array, one object per branch given, in the same
order, matching this shape (no prose, no markdown fences):
[
  {
    "bhv_id": "<copy exactly>",
    "file_line": "<copy exactly>",
    "classification": "missing_scenario"|"dead_code"|"unreachable_defensive",
    "justification": "<required for dead_code / unreachable_defensive>",
    "suggested_scenario_summary": "<required for missing_scenario>",
    "seed_data_strategy": "<copy exactly>",
    "confidence": <number between 0 and 1>
  }
]
```

## Input template

```
bhv_id: {{bhv_id}}
enclosing_scope_context: {{enclosing_scope_context}}
seed_data_strategy: {{seed_data_strategy}}
branches:
  - file_line: {{file_line_1}}
    code_context: {{code_context_1}}
  - file_line: {{file_line_2}}
    code_context: {{code_context_2}}
```

## Few-shot example 1 — one missing scenario, one confident dead-code, batched together

Input:
```
bhv_id: BHV-0142
enclosing_scope_context: "LeaveRequestBean.submit() — full method body, 40-52"
seed_data_strategy: "sanitized production snapshot"
branches:
  - file_line: LeaveRequestBean.java:47
    code_context: "if (startDate.isEqual(endDate)) { addError(\"Single-day requests require the half-day flag\"); return; }"
  - file_line: LeaveRequestBean.java:50
    code_context: "if (legacyBatchImportFlag) { ... } // legacyBatchImportFlag is a removed feature flag; grep confirms no remaining setter anywhere in the codebase"
```

Expected output:
```json
[
  {
    "bhv_id": "BHV-0142",
    "file_line": "LeaveRequestBean.java:47",
    "classification": "missing_scenario",
    "suggested_scenario_summary": "Given startDate equals endDate and the half-day flag is not set, when submit() is called, then a validation error about the half-day flag is shown.",
    "seed_data_strategy": "sanitized production snapshot",
    "confidence": 0.9
  },
  {
    "bhv_id": "BHV-0142",
    "file_line": "LeaveRequestBean.java:50",
    "classification": "dead_code",
    "justification": "legacyBatchImportFlag has no remaining setter anywhere in the codebase, so this branch can never evaluate true at runtime — confirmed by absence of any code path that sets it, not merely by the current test data.",
    "seed_data_strategy": "sanitized production snapshot",
    "confidence": 0.85
  }
]
```

## Few-shot example 2 — unreachable-defensive with a specific invariant, single branch

Input:
```
bhv_id: BHV-0058
enclosing_scope_context: "ExportController.export() — full method body, 95-110"
seed_data_strategy: "sanitized production snapshot"
branches:
  - file_line: ExportController.java:104
    code_context: "switch (user.getRegion()) { case EU: ...; case US: ...; case APAC: ...; case LATAM: ...; default: throw new IllegalStateException(\"Unknown region\"); } // Region is a DB-backed enum column with a NOT NULL + CHECK constraint restricting it to exactly these four values."
```

Expected output:
```json
[
  {
    "bhv_id": "BHV-0058",
    "file_line": "ExportController.java:104",
    "classification": "unreachable_defensive",
    "justification": "The region column has a database CHECK constraint restricting it to exactly EU/US/APAC/LATAM, so getRegion() can never return a value that falls through to default at runtime — the guard exists only against a future schema change, not a currently reachable state.",
    "seed_data_strategy": "sanitized production snapshot",
    "confidence": 0.85
  }
]
```

## Notes for the orchestrator

- Batch by enclosing method/class, not by behavior or by file — see
  `steps/c5-triage-uncovered-branch.yaml`. This is the P0-3 volume lever:
  batching costs no completeness, unlike sampling.
- **Never send more than 6 branches in one call.** If a method/class has
  more uncovered branches than that, split into multiple sub-batches
  (ascending line number) before calling this prompt at all — each
  sub-batch still gets the full `enclosing_scope_context`. This is a hard
  cap, not a soft target: past this size, independent judgment across
  branches in the same call degrades, and a bigger model doesn't fix that
  (same reasoning as `b3`'s neighborhood cap).
- Which branches reach this prompt at all is decided upstream by the
  behavior's `risk_tier`; this prompt's own behavior is identical either
  way (see `docs/phase-c-acceptance.md`, Step 5).
- Reproducibility is checked by Step 5b's independent-re-derivation sample,
  not by re-running every call twice and comparing — the previous version
  of this note described a double-call escalation trigger that contradicted
  this step's own `idempotent: true` and doubled the highest-volume step in
  the pipeline. Do not reintroduce it.
