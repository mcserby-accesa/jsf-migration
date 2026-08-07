<!--
  Canonical BHV-####.md structure. This file is the ONLY place acceptance
  criteria are authored (docs/method.md, principle 3). Gherkin/JUnit
  outputs are rendered from this document by templates/renderers/*.md —
  never hand-authored, never hand-edited to "fix" a rendering.

  schemas/bhv.schema.json validates the HYDRATED representation of this
  document: the YAML frontmatter block below, MERGED with the parsed
  '## Scenarios' table (-> scenarios) and '## Decision tables' section
  (-> decision_tables) further down this file — not the frontmatter block
  in isolation. 'scenarios' and 'decision_tables' are required by that
  schema but deliberately do not appear in the frontmatter itself; they are
  markdown content by design, since they're meant to be read, not just
  machine-validated. (This fixes D1/D2, REVIEW.md — a previous version of
  this comment claimed "the frontmatter block... must validate against"
  the schema, which was never literally true.)

  Do not add fields to either the frontmatter or the Scenarios/Decision
  tables sections that aren't in the schema; add them to the schema first.
-->
---
id: BHV-####
title: <short, behavior-focused title — describe what is observed, not what class implements it>
taxonomy: screen | process | rule | integration | job | cross-cutting
status: draft | sized | acceptance-in-progress | coverage-triaged | done
risk_tier: full | sampled  # assigned mechanically by b5 — see docs/phase-b-behaviors.md, "Risk tier"; do not hand-set except via high_risk_override below
high_risk_override: <true only if this behavior touches money, authorization, or a state transition that taxonomy alone wouldn't flag — forces risk_tier: full; omit or false otherwise>
bpmn_source_engine: <only present when taxonomy: process — copied from framework.yaml>
legacy_refs:
  - <file:line or file:line-range, one per covered node's relevant span>
covers:
  - <inventory node id, e.g. SCR-0142>
  - <inventory node id, e.g. SVC-0089>
related_behaviors:
  - <BHV-#### this shares a RULE node with, if any>
sizing:
  ac_count: <int, filled in after c1>
  sum_cc: <number, sum of CC across covered nodes>
  scenario_density: <ac_count / sum_cc, or null if sum_cc < 5 — see docs/metrics.md>
  density_band_status: under-specified | in-band | too-coarse | null
  # density_band_status (and scenario_density) MUST become null once c4 has
  # produced measured coverage for this behavior (status: coverage-triaged
  # or later) — the ratio is a proxy used only before real coverage data
  # exists (docs/metrics.md #1, "Expiry"). A status of coverage-triaged with
  # a live density_band_status is a defect (D5, REVIEW.md).
---

<!--
  Neighborhood diagram: generated deterministically alongside b3 from this
  behavior's capped 2-hop neighborhood — never hand-edited, never
  LLM-authored. See docs/phase-b-behaviors.md, "Neighborhood diagram."
-->

## Neighborhood diagram

```mermaid
<Mermaid graph of this behavior's boundary_node_ids and the edges between
them, generated from the same neighborhood_nodes/neighborhood_edges b3 was
given as input.>
```

## Description

<One paragraph, in observable-behavior terms: what a user or another system
sees. No references to legacy class names in this section — those live only
in `covers` and `legacy_refs`. If you find yourself writing "this migrates
X," stop and rewrite in terms of what X does, not what X is.>

## Scope note

<One or two sentences on why this boundary was drawn where it was — which
nodes are inside `covers` and, if relevant, what a reviewer might expect to
see included but was deliberately left out (and why — e.g. "field
validation is a separate RULE behavior, BHV-0031, shared with two other
screens").>

## Scenarios

Each row becomes one Gherkin scenario and/or one JUnit test method via
`templates/renderers/`. `scenario_id` is stable once assigned — renderers and
the coverage triage log key off of it, not off row position.

| scenario_id | Given | When | Then | legacy_refs | origin | decision_table_ref |
|---|---|---|---|---|---|---|
| BHV-####-S01 | <precondition> | <action> | <observable outcome> | `file.java:120-134` | legacy | |
| BHV-####-S02 | ... | ... | ... | ... | legacy | |
| BHV-####-S03 | *(example of a new, gap-fill scenario — rare; requires a human author, never produced by c1)* | ... | ... | *(no legacy_refs entry needed)* | new | |
| BHV-####-S04 | *(example of a scenario summarizing a decision table rather than authored directly)* | ... | ... | `file.java:201` | legacy | DT-BHV-####-01 |

Rules for filling this table:

- `origin: legacy` scenarios MUST cite at least one `legacy_refs` entry drawn
  from evidence the extraction/derivation step actually saw — never invented.
- `origin: new` scenarios are the only rows a human, not a step, may add
  directly. They exist for deliberate behavior changes in the migration
  (a gap being fixed), not for "logic I assume should exist."
- A row with a non-empty `decision_table_ref` (the table's `table_id`, e.g.
  `DT-BHV-####-01` — not a specific row) means its Given/When/Then is a
  plain-language summary of the whole decision table kept in the section
  below (see `docs/phase-c-acceptance.md`, step 2) — the decision table
  itself, not this row, is the source of truth for the exact condition
  combinations. **This row is not independently rendered** by `c3` — see
  `templates/renderers/*.md`; it's accounted for via the table's own
  rendered output instead (D4, REVIEW.md).

## Decision tables (if any)

Each table here corresponds to one entry in `schemas/bhv.schema.json`'s
`decision_tables` array in the hydrated representation: `table_id`,
`sub_conditions` (the column headers below, minus `expected_outcome` and
`legacy_refs`), and `rows` (`row_id` + one value per sub-condition +
`expected_outcome` + `legacy_refs`).

<Embed or link one table per compound condition this behavior owns, produced
by `c2` and (where applicable) reduced by `c2b`. Table ID format:
`DT-BHV-####-NN`. Each table states its sub-conditions, one row per
MC/DC-relevant combination (never pairwise-reduced), and cites `legacy_refs`
per row. If a table has a configuration-value dimension layered on top,
that dimension's reduction (via `framework.yaml: combinatorial_reducer`) is
recorded as a separate, explicitly labeled sub-table so the two kinds of row
are never visually conflated.>

## Coverage triage (summary)

<A short summary linking to the application-level triage log entries
relevant to this behavior's `legacy_refs` spans — see
`docs/phase-c-acceptance.md`, step 5, and `validators/README.md`. This
section is populated after `c4`/`c5` run; it is empty in a freshly drafted
`BHV`.>
