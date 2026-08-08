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
  `field_groups`, `data_tables`, `ajax_bindings`, `converters_validators`,
  `labels`, and `messages` (each may be an empty list, but must be present);
  every active `SVC` node's `public_methods` entries include `params`,
  `return_type`, `action_bound`, and `nav_outcomes`. Value facts on those
  same nodes are checked separately by `value_facts_complete`, and layout
  facts by `layout_tree_complete`.
- **Output:** `{ "passed": bool, "failures": ["<node id>: missing <field>"] }`.
- **On failure:** blocks Phase A exit; the extractor stopped short of a
  complete skeleton, which is what "the implementer never reads legacy
  source" depends on — see `docs/phase-a-inventory.md`, "Structural
  skeletons," and `DECISIONS.md`.

## `layout_tree_complete`

- **Applies to:** every active `SCR` and `TPL` node, checked by `a1` and
  again by `a5`; re-checked over the assembled pack by `c9`.
- **Reads:** `raw_facts.layout_tree` and `raw_facts.layout_template` on each
  node, `schemas/layout-tree.schema.json`, and `edges.jsonl`.
- **Checks:**
  1. Every active `SCR` and `TPL` has a `layout_tree` that validates against
     the schema; every active `SCR` has a `layout_template` key (its
     `template_ref` may be `null` — an absent key may not be).
  2. `node_id`s are unique within their node and are the document-order
     sequence a depth-first walk produces, with no gaps.
  3. Every `field_id` a tree references resolves in that node's
     `form_fields`; every `table_id` in `data_tables`; every `label_index`
     in `labels`, at an entry whose `field_id` is null.
  4. Every entry in `form_fields` appears **exactly once** as a leaf. A field
     appearing twice is an extractor bug; a field appearing zero times is a
     field with no position, which is the failure state this whole structure
     exists to make impossible.
  5. Every `render_guard` resolves to an active `EL` or `RULE` node whose
     `attached_screen` (or whose `GUARDS` edge) is this node.
  6. Every `layout_template.template_ref` and every `include` leaf's
     `template_ref` resolves to an active `TPL`, with the matching
     `COMPOSES_INTO` / `INCLUDES` edge present in `edges.jsonl`.
  7. Every `region_name` a screen claims to fill exists as a `region`
     container in that template's own `layout_tree`.
  8. Exactly one child of each `tabs` / `wizard-steps` container has
     `initially_selected: true`.
  9. `field_groups` is the flattening of the tree: one entry per labelled
     container, in document order, with the field ids beneath it. The two
     agree exactly. `field_groups` states nothing independently — it is kept
     because it is easier to query than a tree, not because it is a second
     source (`docs/phase-a-inventory.md`, "Layout").
- **Output:** `{ "passed": bool, "failures": ["<node id>[/<LT id>]: <detail>"] }`.
- **On failure:** blocks Phase A exit (`a5`) or pack handover (`c9`).
- **What it deliberately does not check:** that the tree is *correct* — that
  the extractor resolved a dynamic composition the way the application
  actually renders it. No deterministic check can, since the same view
  renders differently per role and per row of data. That is what
  `reference/screenshots/` gives a human reviewer, and it is the stated cost
  of extracting layout from source rather than from a rendered DOM (see
  `docs/phase-a-inventory.md`, "Layout").

## `screen_reference_captured`

- **Applies to:** `a8-capture-screen-references` output, checked by `a8` and
  re-checked over the pack by `c9`.
- **Reads:** `a8`'s report / `reference/screenshots/index.json`, and the
  active `SCR` node list.
- **Checks:** every active `SCR` appears either in `captures` (at least once)
  or in `not_captured` with a reason from the enumerated set; every capture's
  `screen_id` resolves to an active `SCR`; every capture file exists at its
  recorded path with a matching `sha256`; no path appears twice.
- **Output:** `{ "passed": bool, "failures": ["<SCR id>: <detail>"] }`.
- **On failure:** blocks Phase A exit and pack handover.
- **What passing does not mean:** that every screen has a screenshot. A pack
  where a dozen screens are `unreachable_with_seed_data` passes, and should —
  each is a real finding about the seed set. What it prevents is a screen
  reaching handover with neither an image nor a reason, where "the capture
  found nothing" and "there was nothing to capture" read identically.
- **Explicitly not checked:** that a re-capture is byte-identical. Font
  hinting and antialiasing vary between runs of the same browser on the same
  page; the stable thing is the capture *list*, not the pixels. See
  `steps/a8-capture-screen-references.yaml`, notes.

## `wireframe_renders_for_every_screen`

- **Applies to:** `views/wireframes/`, checked by `c9`.
- **Reads:** the rendered wireframes, `views/pages.json`, and
  `templates/renderers/wireframe.md`.
- **Checks:** one file exists per active `SCR` and per active `TPL`; each is
  valid UTF-8 with no line exceeding 100 columns, no trailing whitespace, and
  exactly one trailing newline; each carries the header and `template:` lines
  the renderer specifies; and every id appearing in a legend entry resolves
  within the pack.
- **Output:** `{ "passed": bool, "failures": ["<path>: <detail>"] }`.
- **On failure:** blocks pack handover. The fix is in
  `templates/renderers/wireframe.md` or in the `layout_tree` it renders,
  never in the generated file — a hand-edited wireframe fails
  `projection_regenerates_identically` on the next pass.
- **Note:** byte-identical regeneration is covered by
  `projection_regenerates_identically` and not repeated here. This validator
  checks the properties that make the file *readable* — the same division of
  labour as `rendering_idempotent` versus `rendered_artifacts_parse`.

## `value_facts_complete`

- **Applies to:** every active `SCR`/`SVC`/`DB` node, checked by `a1` and
  again by `a5`; re-checked over the assembled pack by `c9`.
- **Reads:** `raw_facts` on each node.
- **Checks:** every `DB` table column carries `precision`, `scale`, `length`,
  `default`, `check_constraints`, and `value_domain` **as keys** — `null` is
  an acceptable value for any of them, an absent key is not; every
  `converters_validators` entry carries `attributes`; every `SCR` carries
  `labels` and `messages`; every `SVC` carries `constants` and
  `derivation_methods`; and every `derivation_methods` entry has a lifted
  `RULE` with a `DERIVED_FROM` edge back to it.
- **Output:** `{ "passed": bool, "failures": ["<node id>: missing <field>"] }`.
- **On failure:** blocks Phase A exit (`a5`) or pack handover (`c9`).
- **Why `null` and absent are different:** `null` records that the catalog or
  the source had nothing to say, which is a finding and routes to the
  open-questions register. An absent key records that the extractor never
  looked, which is indistinguishable from the first once the pack is handed
  over. See `docs/phase-a-inventory.md`, "Value facts."

## `identity_model_present`

- **Applies to:** the graph, checked by `a5`; the pack, checked by `c9`.
- **Reads:** `nodes.jsonl` for `AUTHN` nodes; `auth/identity.json` in the pack.
- **Checks:** exactly one active `AUTHN` node exists, with `auth_method`,
  `declared_roles`, and `credential_store` set; and `auth/identity.json`
  projects it. An application with no authentication passes with
  `auth_method: none` — the check is that the pack *states* the identity
  model, not that there is one.
- **Output:** `{ "passed": bool, "failures": ["<detail>"] }`.
- **On failure:** blocks Phase A exit / pack handover. Almost always the auth
  scanner not having run, since every application has an answer here even if
  the answer is "none."

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

## `rendered_artifacts_parse`

- **Applies to:** `c3`'s rendered output, checked by `c3b` per behavior and
  re-checked over the whole pack by `c9`.
- **Reads:** every rendered `.feature` / test class, and the application's
  own parser for that format.
- **Checks:** the file loads. Not that its scenarios pass — that no parser
  error, dialect error, or regex-compilation error occurs while reading it.
- **Output:** `{ "passed": bool, "failures": [{ "location": "<file:line>", "detail": "<parser message>" }] }`.
- **On failure:** blocks the behavior's Phase C sign-off. The fix is in
  `templates/renderers/*.md` or in the authored `BHV-####.md`, never in the
  generated file — a hand-edited render fails `rendering_idempotent` on the
  next pass.
- **Why a real parser:** the framework specifies a deterministic mapping from
  spec structure to test structure, which guarantees the same input renders
  to the same bytes and guarantees nothing about whether those bytes load.
  Only a parser knows what its own dialect rejects, and every rejection this
  catches is otherwise silent until someone runs the file — after handover,
  in a repository this framework never sees.

## `rendered_scenario_titles_unique`

- **Applies to:** `c3`'s rendered output, checked by `c3b` and by `c9`.
- **Reads:** every rendered scenario title, test-method name, and
  `@DisplayName` across the whole pack.
- **Checks:** no two are equal, and no two share a common prefix up to the
  point where a typical console summary truncates.
- **Output:** `{ "passed": bool, "failures": [{ "location": "<scenario_id>", "collides_with": ["<scenario_id>"] }] }`.
- **On failure:** blocks Phase C sign-off. Under the current renderer rules
  this is satisfied by construction (every title carries its `scenario_id`),
  which is the point: the validator guards the construction rather than
  hoping the authored text happens to differ. Duplicate titles are rejected
  outright by some harnesses and silently merged in the reports of others —
  and the second failure mode presents as a suite whose own test count is
  inconsistent with itself.

## `step_text_is_plain_text`

- **Applies to:** `c3`'s rendered output, checked by `c3b` and by `c9`.
- **Reads:** every rendered step, title, and `Examples:`/`@CsvSource` cell.
- **Checks:** no unescaped Markdown emphasis marker, no embedded newline, no
  unescaped table delimiter — per `templates/renderers/gherkin.md`, "Text
  normalization."
- **Output:** `{ "passed": bool, "failures": [{ "location": "...", "source_field": "given|when|then|title|expected_outcome", "detail": "..." }] }`.
- **On failure:** blocks Phase C sign-off. `source_field` points at the
  authored field so the fix lands in the canonical document.
- **Note:** the canonical `BHV-####.md` is Markdown and its cells are written
  to be read there; emphasis in an authored cell is not a defect. Emphasis
  surviving into a step that a harness compiles into a regular expression is.

## `step_index_complete`

- **Applies to:** `behaviors/step-index.json`, checked by `c9`.
- **Reads:** the index and every rendered artifact in the pack.
- **Checks:** every distinct rendered step text appears exactly once in the
  index; every behavior rendering it is listed in its `used_by`; every entry
  names a `definition_owner` that is one of them; and the owner is the one
  the documented rule selects (earliest wave, ties by lowest id).
- **Output:** `{ "passed": bool, "failures": ["<step text>: <inconsistency>"] }`.
- **On failure:** blocks pack handover — a stale index is worse than none,
  because it will be trusted.
- **What it deliberately does not check:** that step texts are unique across
  behaviors. Shared step text is how a shared glue layer works, and
  rewriting it to be unique would discard the reuse. The failure this
  addresses is not that two behaviors share a step; it is that neither knew.

## `scenario_surface_bound`

- **Applies to:** `behaviors/scenario-bindings.json`, checked by `c9`.
- **Reads:** the bindings, every behavior's scenarios, and `api/openapi.yaml`.
- **Checks:** every scenario in the pack has exactly one binding; every
  `rest` binding names an `operation_id` that resolves in the merged OpenAPI
  document; every non-`rest` binding has a non-empty rationale; the
  bindings' `conventions_hash` equals the manifest's; and every binding with
  `surface: not-observable` or `preserves_legacy_meaning: false` carries an
  `open_question_id` that resolves in the open-questions register.
- **Output:** `{ "passed": bool, "failures": ["<scenario_id>: <detail>"] }`.
- **On failure:** blocks pack handover.
- **What passing does not mean:** that every scenario is observable in the
  target. A pack where a dozen scenarios bind `not-observable` passes this
  check, and should — those are real findings, each with a register entry.
  What it prevents is a scenario reaching an implementer with no decision
  recorded either way.

## `open_questions_well_formed`

- **Applies to:** `triage/open-questions.jsonl`, checked by `c9`.
- **Reads:** every entry the pipeline seeded (`raised_by` is a step id).
- **Checks:** ids are unique, match `OQ-####`, and are assigned in the
  documented stable order; every `subject` id resolves within the pack;
  `status` is set; every `assumed` entry states its `assumption`; every
  upstream state that should seed an entry has one (a null `value_domain`, a
  lift with `open_value_domain`, an external `credential_store`, a
  `not-observable` binding, a `c8`-judged endpoint).
- **Output:** `{ "passed": bool, "failures": ["<OQ id or source>: <detail>"] }`.
- **On failure:** blocks pack handover.
- **Not checked:** whether any question is answered. A pack ships with open
  questions by design; the gate exists so it cannot ship with an open
  question nobody wrote down. Entries appended after handover (`raised_by:
  implementer`) are outside this check entirely — same posture as
  `progress.jsonl`.

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
- **Reads:** every active `SVC` node's `public_methods`, every active `SCR`
  and `NAV` node, every EL-derived `RULE`, `c7`'s `operations`,
  `client_side_only` and `unmapped` lists, and every `c8` resolution.
- **Checks:** every one of those reaches exactly one final state — a mapped
  operation, a `client_side_only` verdict with a rationale, or `no_endpoint`
  with reasoning. Zero remain in `unmapped` unresolved, and zero are
  `needs_human_contract`.
- **Output:** `{ "passed": bool, "failures": ["<node id>[.<method>]: <state>"] }`.
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
- **Checks:** no `.xhtml`, `.java`, `.jsp`, `.css`, or other legacy source
  file has been copied in. Two deliberate exceptions: `.bpmn` files, and the
  screenshots under `reference/screenshots/`. Both are carried-over
  artifacts, not source standing in for a spec.
- **Output:** `{ "passed": bool, "failures": ["<path>: legacy source in pack"] }`.
- **Why a screenshot is not the loophole it looks like:** the rule exists
  because legacy source is an unaudited channel an implementer can read
  *instead of* the spec — copy a `.xhtml` in and the extracted skeleton stops
  being the only description of the page. An image cannot be read that way:
  nothing can be lifted out of it, nothing in the pack derives from it, and
  no gate consults it. A rendered stylesheet or a saved HTML rendering of a
  page would be a different matter and stays prohibited — that is source in
  the sense the rule means, whichever directory it is filed under.
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
  the pack resolves within the pack — including `operation_id`s in
  `scenario-bindings.json`, `replaced_by_scenario_id`s in behavior
  documents, and `OQ-####` ids referenced from anywhere; (4)
  `manifest.json` lists every file present and every file it lists exists;
  (5) each of the validators above passed; (6) `handover/ui-conventions.yaml`
  is either present and hashed, or recorded absent — the file is optional
  (nothing derives from it), and the gate checks only that the manifest says
  which.
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
