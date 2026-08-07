# Renderer: BHV -> Gherkin

Consumed by `steps/c3-render-tests.yaml` when `framework.yaml: spec_format`
is `gherkin` or `both`. This is a deterministic mapping, specified precisely
enough to implement without judgment calls — if a case arises this mapping
doesn't cover, fix the mapping, don't hand-translate around it.

## File layout

One `.feature` file per `BHV-####`, named `BHV-####-<slug-of-title>.feature`,
written to a configurable output directory (not fixed by this framework).

## Mapping rules

**Rows with a non-empty `decision_table_ref` are not independently
rendered as their own `Scenario`.** Per `templates/BHV-template.md`'s rule
3, such a row's Given/When/Then is a plain-language summary of one row of a
decision table whose own `Scenario Outline`/`Examples` (rule 3 below)
already covers that exact condition combination — rendering the row a
second time would duplicate, not add, coverage. This row is still
accounted for by `c3`'s "no silent drops" validator via its
`decision_table_ref` association, not via an independent `Scenario`. This
is the resolution to D4 (REVIEW.md) — previously unspecified, and resolved
inconsistently by hand in `examples/`.

1. **Feature block**
   ```gherkin
   Feature: <BHV.title>
     <BHV.description, reflowed to Gherkin's free-text feature narrative>
     # source: <BHV.id>, taxonomy: <BHV.taxonomy>
   ```
2. **One `Scenario:` per row of the Scenarios table**, in table order, using
   `scenario_id` as a tag:
   ```gherkin
   @<scenario_id>
   Scenario: <Given text, truncated to a short title if longer than ~80 chars>
     Given <Given>
     When <When>
     Then <Then>
   ```
3. **Decision-table-derived scenarios** (non-empty `decision_table_ref`):
   render one `Scenario Outline:` per decision table, with one `Examples:`
   row per table row (post `c2b` reduction, if any). Column headers are the
   table's `sub_conditions`; the outline's Given/When/Then use
   `<placeholder>` syntax matching those headers.
   ```gherkin
   @<decision_table_ref>
   Scenario Outline: <table's owning condition, short form>
     Given <sub_condition_1> is <sub_condition_1_placeholder>
     And <sub_condition_2> is <sub_condition_2_placeholder>
     When the rule is evaluated
     Then the outcome is <expected_outcome>

     Examples:
       | sub_condition_1 | sub_condition_2 | expected_outcome |
       | <row 1 values>  | ...             | ...              |
   ```
   MC/DC rows and pairwise-reduced configuration rows are rendered as
   separate `Scenario Outline:` blocks (separate `Examples:` tables) even
   when they came from the same decision table — never merged into one
   table, so a reader can tell which rows are logic-branch coverage and
   which are configuration-combination coverage.
4. **`origin: new` scenarios** render identically to `legacy` ones but with
   an additional tag `@new-behavior` so a reviewer scanning generated
   `.feature` files can immediately see which scenarios have no legacy
   precedent.
5. **Traceability**: every rendered `Scenario`/`Scenario Outline` carries a
   comment line with its `legacy_refs`, e.g. `# legacy_refs:
   OrderServiceBean.java:120-134`. This is what lets a reviewer jump from a
   failing Gherkin scenario straight to the legacy code it was derived from.

## Idempotence requirement

Re-rendering an unchanged `BHV-####.md` must produce a byte-identical
`.feature` file. This means: stable scenario ordering (table order, not
alphabetical or hash-based), stable tag ordering, and no timestamps or
non-deterministic content embedded in the output.
