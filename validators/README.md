# Validators

This is a contract specification only — no validator here is implemented.
Each entry states: what it applies to, what it reads, exactly what it
checks, the shape of its pass/fail output, and what happens on failure.
Every validator is deterministic; none involve model judgment.

Validators are invoked by the step that declares them in its `validators:`
list (`steps/*.yaml`). Several validators are large enough to be their own
step (`a5`, `b5`'s completeness half, `c6`) — those are documented in both
places; this file is the authority on *what the check means*, the step
file is the authority on *when it runs*.

---

## `edge_endpoints_resolve`

- **Applies to:** `a1-extract-inventory` output, re-checked by `a5-validate-inventory`.
- **Reads:** `nodes.jsonl`, `edges.jsonl`.
- **Checks:** for every line in `edges.jsonl`, both `from` and `to` are IDs
  present in `nodes.jsonl` with `status: "active"`.
- **Output:** `{ "passed": bool, "failures": ["<from>-><to> (<type>): <missing endpoint>"] }`.
- **On failure:** blocks the graph load into `graph_store`; the extractor or
  a manual correction must fix it before re-running.

## `legacy_refs_resolve`

- **Applies to:** every `nodes.jsonl` entry, every `BHV-####.md`, every AC
  and decision-table row. Checked by `a5`, and again by `c6` per-behavior.
- **Reads:** the `legacy_refs` field plus the actual legacy source tree (or
  DDL/SQL source for `DB` trigger/proc `body_ref`).
- **Checks:** every `file:line` or `file:line-range` string resolves to a
  real, existing location in the referenced source. A reference into a file
  that no longer exists, or a line range past end-of-file, fails.
- **Output:** `{ "passed": bool, "failures": ["<owning id>: <ref> does not resolve"] }`.
- **On failure:** blocks `a5` (Phase A) or `c6` (per-behavior, Phase C).
  Common cause: legacy source moved/changed after extraction — re-run `a1`
  before assuming the reference itself was ever wrong.

## `no_duplicate_ids`

- **Applies to:** `nodes.jsonl` (checked by `a5`) and the behavior registry
  (checked whenever `b4` assigns a new `BHV-####` id).
- **Reads:** all IDs currently in `nodes.jsonl` / the behavior registry.
- **Checks:** no ID prefix+number pair appears twice with `status: "active"`.
  A `status: "removed"` node keeping its old ID is not a duplicate — see
  `docs/phase-a-inventory.md`, "ID stability."
- **Output:** `{ "passed": bool, "failures": ["<duplicated id>"] }`.
- **On failure:** blocks graph load / ID assignment; fix the ID-assignment
  counter, do not silently renumber (that would break existing
  `legacy_refs`/`covers` links elsewhere).

## `structural_skeleton_complete`

- **Applies to:** every active `SCR`/`SVC` node, checked by `a5`.
- **Reads:** `raw_facts` on each `SCR`/`SVC` node.
- **Checks:** every active `SCR` node's `raw_facts` includes `form_fields`,
  `field_groups`, `data_tables`, `ajax_bindings`, and `converters_validators`
  (each may be an empty list, but must be present); every active `SVC`
  node's `public_methods` entries include `params`, `return_type`,
  `action_bound`, and `nav_outcomes`.
- **Output:** `{ "passed": bool, "failures": ["<node id>: missing <field>"] }`.
- **On failure:** blocks Phase A exit; the extractor stopped short of a
  complete skeleton, which is what "the implementer never reads legacy
  source" depends on — see `docs/phase-a-inventory.md`, "Structural
  skeletons," and `DECISIONS.md`.

## `no_remaining_ambiguous_nodes`

- **Applies to:** `nodes.jsonl`, checked by `a5` as the Phase A exit gate.
- **Reads:** `extraction_confidence` field on every node.
- **Checks:** no active node has `extraction_confidence: "ambiguous"` — every
  such node has been routed through `a2`/`a3`/`a4` to a final `"certain"` or
  `"rejected"` state.
- **Output:** `{ "passed": bool, "failures": ["<node id> still ambiguous"] }`.
- **On failure:** blocks Phase A -> Phase B transition; run the outstanding
  `a2`/`a3`/`a4` calls.

## `known_file_types_scanned`

- **Applies to:** the whole extraction pass, checked by `a5`.
- **Reads:** the application's own repo-layout inventory from Phase 0 (which
  file types/config formats it actually contains) against which node kinds
  were actually produced.
- **Checks:** if the app has a `faces-config.xml`, at least one `NAV`/`CFG`
  node exists; if it has BPMN files, at least one `PROC` exists; etc. — a
  coarse sanity check that no extractor silently no-op'd.
- **Output:** `{ "passed": bool, "failures": ["expected >=1 node of kind <k> given file type <t>, found 0"] }`.
- **On failure:** blocks Phase A exit; almost always an extractor
  configuration bug (wrong path glob, wrong parser invoked).

## `inventory_coverage_complete`

- **Applies to:** the full graph, checked by `b5` (completeness-report mode).
- **Reads:** `nodes.jsonl` (`status: "active"`), `edges.jsonl` (`type: "COVERS"`).
- **Checks:** every active node has at least one incoming `COVERS` edge from
  a `BHV`, OR is present in the out-of-scope triage log with a written
  reason.
- **Output:** `{ "coverage_fraction": number, "uncovered_node_ids": [...] }`
  (see `schemas/b5-check-sizing-and-density.schema.json`).
- **On failure (coverage_fraction < 1.0):** blocks Phase B sign-off for the
  application. See `docs/metrics.md`, "Inventory coverage."

## `sizing_thresholds`

- **Applies to:** one `BHV-####`, checked by `b5` (sizing-report mode), first
  from `b3`'s estimate and again after `c1` returns real AC counts.
- **Reads:** `sizing.ac_count`, `legacy_refs` LOC span sum, `sizing.sum_cc`.
- **Checks:** `ac_count <= ~15` and legacy LOC `<= a few hundred`.
- **Output:** `{ "sizing_status": "ok"|"split_required", ... }`.
- **On failure:** triggers a Phase B split — re-run `b3`/`b4` on a narrower
  node subset. See `docs/metrics.md`, "Sizing thresholds."

## `scenario_density_band`

- **Applies to:** one `BHV-####` with `sum_cc >= 5`, checked by `b5`.
- **Reads:** `scenarios.length`, `sizing.sum_cc`.
- **Checks:** `scenarios / sum_cc` against the 0.2–0.5 band.
- **Output:** `{ "density_status": "under-specified"|"in-band"|"too-coarse" }`.
- **On failure:** below band routes back to `c1` for more scenarios; above
  band triggers a Phase B split review. **Expires** once `c4` produces
  measured coverage for this behavior — see `docs/metrics.md`.

## `rendering_idempotent`

- **Applies to:** `c3-render-tests` output, checked by `c6`.
- **Reads:** two consecutive renders of the same unchanged `BHV-####.md`.
- **Checks:** byte-identical output (same `content_hash`) both times.
- **Output:** `{ "passed": bool, "failures": ["<format>/<path>: hash mismatch"] }`.
- **On failure:** a bug in the renderer (`templates/renderers/*.md`'s rule
  set has a non-deterministic mapping somewhere) — fix the rule, never
  hand-patch the generated file.

## `rendered_output_exists_for_every_spec_format`

- **Applies to:** `c3-render-tests` output, checked by `c6`.
- **Reads:** `framework.yaml: spec_format`, `c3`'s `outputs` list.
- **Checks:** if `spec_format` is `gherkin`/`junit`, exactly that format is
  present; if `both`, both are present, and their `source_ac_ids` sets match.
- **Output:** `{ "passed": bool, "failures": ["missing format: <fmt>"] }`.
- **On failure:** re-run `c3`.

## `no_unresolved_triage_entries`

- **Applies to:** one `BHV-####`'s branch coverage, checked by `c6`.
- **Reads:** `c4`'s branch report, the behavior's `risk_tier`, and the
  application's triage log.
- **Checks:** every branch reported `"uncovered"` by `c4` for this
  behavior's `legacy_refs` spans has a corresponding triage log entry with a
  final state — for `risk_tier: full`, one of `missing_scenario`/
  `dead_code`/`unreachable_defensive`; for `risk_tier: sampled`, one of
  those three or `not_sampled`. "Not left pending" either way.
- **Output:** `{ "passed": bool, "failures": ["<file:line>: no triage entry"] }`.
- **On failure:** blocks Phase C sign-off for this behavior; run `c5` on the
  remaining branches. See `docs/metrics.md`, "Branch coverage."

## `semantic_verification_recorded`

- **Applies to:** one `BHV-####`, checked by `c6`.
- **Reads:** the Step 5b review log (`docs/phase-c-acceptance.md`).
- **Checks:** every triage entry with `classification: "dead_code"` for this
  behavior, and every AC/decision-table content if the behavior's taxonomy is
  `rule`/`process` or it has `high_risk_override: true`, has a recorded human
  review outcome (agree / overturned).
- **Output:** `{ "passed": bool, "failures": ["<item id>: no review outcome recorded"] }`.
- **On failure:** blocks Phase C sign-off for this behavior; this is a human
  action, not a re-run of any LLM step. See `docs/metrics.md` #7.

## `unreachable_defensive_has_justification`

- **Applies to:** the triage log, checked by `c6` per-behavior and
  periodically over the whole log.
- **Reads:** every triage entry with `classification: "unreachable_defensive"`.
- **Checks:** `justification` is non-empty and is not one of a small set of
  known-boilerplate phrases (e.g. bare "defensive code", "just in case") —
  this is a shallow lexical check, not a judgment of whether the
  justification is *correct*; correctness is a human review concern.
- **Output:** `{ "passed": bool, "failures": ["<file:line>: justification missing or boilerplate"] }`.
- **On failure:** blocks Phase C sign-off for the behavior; route back to
  `c5` with more context for that branch.

## `endpoint_contract_complete`

- **Applies to:** `c7`/`c8` output, checked by `c9`.
- **Reads:** every active `SVC` node's `public_methods`, `c7`'s `operations`
  and `unmapped` lists, and every `c8` resolution.
- **Checks:** every public method reaches exactly one final state — a mapped
  operation, or `no_endpoint` with reasoning. Zero methods remain in
  `unmapped` unresolved, and zero are `needs_human_contract`.
- **Output:** `{ "passed": bool, "failures": ["<SVC id>.<method>: <state>"] }`.
- **On failure:** blocks pack handover. A `needs_human_contract` entry is
  resolved by a human authoring that one operation, or by supplying the
  missing type facts and re-running `c8` — never by letting `c8` guess.

## `openapi_merge_consistent`

- **Applies to:** the merged `api/openapi.yaml`, checked by `c9`.
- **Reads:** every operation fragment from `c7`/`c8`.
- **Checks:** no two fragments claim the same path + verb; every `$ref`
  resolves within the merged document; every referenced schema component is
  defined exactly once; the merge is order-independent (sorting the fragments
  differently produces a byte-identical document).
- **Output:** `{ "passed": bool, "failures": ["<path> <verb>: <collision or dangling ref>"] }`.
- **On failure:** blocks pack handover. A path collision usually means two
  legacy services map onto one resource name — fix `strip_suffixes` or the
  resource derivation in `api-conventions.yaml`, not the generated file.

## `bpmn_copied_verbatim`

- **Applies to:** every file under the pack's `process/`, checked by `c9`.
- **Reads:** the copied `.bpmn` files and their legacy source files.
- **Checks:** byte-identical, hash for hash. No reformatting, no
  namespace normalization, no pretty-printing.
- **Output:** `{ "passed": bool, "failures": ["<file>: hash mismatch with <source>"] }`.
- **On failure:** blocks pack handover. The pack ships what was discovered;
  a "helpfully" reformatted process definition is no longer the artifact the
  legacy engine actually runs.

## `projection_regenerates_identically`

- **Applies to:** every pack part with `kind: "projection"`, checked by `c9`.
- **Reads:** the written projection and its declared `source`.
- **Checks:** regenerating the projection from its source produces a
  byte-identical file. Same discipline as `rendering_idempotent`, applied to
  the whole pack.
- **Output:** `{ "passed": bool, "failures": ["<path>: differs from regeneration"] }`.
- **On failure:** blocks pack handover. Two causes, both real: the generator
  is non-deterministic (fix the generator), or someone hand-edited a
  projection (discard the edit and change the original instead). A pack whose
  projections don't regenerate has two copies of some fact and no way to say
  which is authoritative.

## `no_legacy_source_in_pack`

- **Applies to:** the assembled pack, checked by `c9`.
- **Reads:** every file in the pack.
- **Checks:** no `.xhtml`, `.java`, `.jsp`, or other legacy source file has
  been copied in. `.bpmn` files are the one deliberate exception — they are a
  carried-over artifact, not source to be read in place of a spec.
- **Output:** `{ "passed": bool, "failures": ["<path>: legacy source in pack"] }`.
- **On failure:** blocks pack handover. If something in the pack is missing a
  fact that only the source has, extend the Phase A extractor that should
  have captured it. See `DECISIONS.md`, principle 5.

## `dependency_order_derivable`

- **Applies to:** `behaviors/order.json`, checked by `c9`.
- **Reads:** `order.json`, `nodes.jsonl`, `edges.jsonl`.
- **Checks:** every behavior in the pack appears exactly once; every
  `depends_on` entry cites at least one real edge present in `edges.jsonl`;
  every behavior in a `cycle_group` is listed in the `cycles` array and vice
  versa; `wave` values are consistent with the condensed dependency graph
  (nothing depends on something in a later wave); `generated_from` hashes
  match the graph actually in the pack.
- **Output:** `{ "passed": bool, "failures": ["<bhv id>: <inconsistency>"] }`.
- **On failure:** blocks pack handover. A cycle is **not** a failure — an
  unreported cycle is. The generator never breaks one; a stale
  `generated_from` hash means the order was derived against a different graph
  and must be regenerated before anyone schedules against it.

## `spec_pack_complete`

- **Applies to:** the assembled pack, checked by `c9` as the framework's
  final gate.
- **Reads:** `manifest.json` and the pack contents.
- **Checks:** (1) every active inventory node is covered by a behavior or
  recorded out-of-scope with a reason (re-checks `inventory_coverage_complete`);
  (2) every behavior present passed `c6`; (3) every ID referenced anywhere in
  the pack resolves within the pack; (4) `manifest.json` lists every file
  present and every file it lists exists; (5) each of the validators above
  passed.
- **Output:** `{ "passed": bool, "failures": ["<check>: <detail>"] }`.
- **On failure:** the pack is not handed over. See `docs/spec-pack.md`,
  "Completeness gate" — a partial pack presented as a complete one is the one
  failure that discredits every phase upstream of it.

## Cross-cutting: escalation-rate monitoring

- **Applies to:** the escalation event log described in
  each step's `escalate:` block.
- **Reads:** the last 20 calls to a given step.
- **Checks:** `count(escalated) / 20 > 0.2`.
- **Output:** `{ "step": "...", "escalation_rate": number, "flagged": bool }`.
- **On failure (flagged: true):** not a blocker for any single behavior —
  it flags the step's input bounding for human
  review, to correct the step's input bounding empirically after a pilot. See
  `docs/metrics.md`, "Escalation rate per step."
