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
case was previously unspecified, and was resolved inconsistently by hand in
`examples/` as a result.

1. **Feature block**
   ```gherkin
   Feature: <BHV.id> — <BHV.title>
     # <BHV.description, reflowed, one comment line per output line>
     # source: <BHV.id>, taxonomy: <BHV.taxonomy>
   ```
   The description is emitted as **comment lines, not free text**. Gherkin's
   free-text narrative is delimited only by the absence of a keyword, so a
   description whose reflowed text happens to begin a line with `When`,
   `Given`, `Then`, `And`, `But`, `Rule`, or `Scenario` is read by real
   parsers as a stray step declaration and fails the whole file before any
   scenario runs. A description is prose for a human reader; nothing is lost
   by commenting it and a whole class of parse failure goes away.
2. **One `Scenario:` per row of the Scenarios table**, in table order, using
   `scenario_id` as a tag:
   ```gherkin
   @<scenario_id>
   Scenario: <scenario_id> — <Then text, truncated to ~80 chars>
     Given <Given>
     When <When>
     Then <Then>
   ```
   **The title is prefixed with `scenario_id`, and that is not decoration.**
   Titles derived from scenario text alone collide — two scenarios in one
   behavior legitimately share a precondition, and several harnesses treat a
   scenario title as a unique key (some throw on the duplicate; others
   silently merge the two in their reports, which is worse). The
   `scenario_id` is already unique by construction, so prefixing it makes
   collision impossible rather than unlikely. Truncation applies to the text
   part only; the id is never truncated.

   The title's text part comes from `Then`, not `Given`: what a scenario
   asserts distinguishes it from its siblings, while its precondition often
   does not.
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
5. **`origin: legacy-defect` scenarios** render with two additional tags:
   `@legacy-defect` and either `@preserve` or `@fix`, from the row's
   `disposition`. A `@fix` scenario additionally carries a comment naming
   its `replaced_by_scenario_id`:
   ```gherkin
   @BHV-0011-S02 @legacy-defect @fix
   Scenario: BHV-0011-S02 — the escalation bypass is not applied
     # legacy-defect: true in the legacy system, deliberately NOT preserved.
     # replaced_by: BHV-0011-S05
   ```
   These scenarios are still rendered and still run: `c4` runs against the
   *legacy* application, where the defect is real, and a spec that quietly
   omitted it would be an incomplete description of the legacy system. The
   tags exist because the same rendered file is later read by an implementer
   building the replacement, for whom a `@fix` scenario is a statement of
   what the new system must *not* do. Without the tag, that scenario is
   indistinguishable from a requirement, and the implementer either
   reimplements the bug or writes a private note reasoning their way around
   it — one behavior at a time, with no record.
6. **Traceability**: every rendered `Scenario`/`Scenario Outline` carries a
   comment line with its `legacy_refs`, e.g. `# legacy_refs:
   OrderServiceBean.java:120-134`. This is what lets a reviewer jump from a
   failing Gherkin scenario straight to the legacy code it was derived from.
7. **Surface binding**: every rendered `Scenario`/`Scenario Outline` carries
   a comment line naming its entry in `behaviors/scenario-bindings.json` —
   e.g. `# surface: rest GET /api/v1/requisitions` or `# surface:
   domain-only (no client-observable equivalent)`. The binding is derived in
   Phase C by `c7b` and is not authored here; this line is a convenience
   pointer, and the JSON file remains the single source of truth. See
   `docs/phase-c-acceptance.md`, step 3b.

## Text normalization

The canonical `BHV-####.md` is Markdown, and its Given/When/Then cells are
written to be read there. Gherkin step text is not Markdown: harnesses
commonly compile step text into a regular expression, so a literal `*` or
`(` from Markdown emphasis becomes a quantifier or a group and the file
fails to load before a single assertion runs.

Every string this renderer emits into a step, a title, or an `Examples:`
cell is therefore normalized first:

1. Strip Markdown inline emphasis markers — `**bold**`, `*italic*`,
   `_underscore_`, and backtick code spans — keeping the text inside them.
   Strip the markers only where they *are* emphasis: a `*` inside a path
   glob (`/pages/*`) or an arithmetic expression is content and must
   survive. The test is structural, not lexical — a pair of markers around a
   non-empty span with no intervening whitespace-only content is emphasis;
   an unpaired marker is content.
2. Collapse any internal newline or run of whitespace to a single space. A
   step is one line by definition.
3. Escape `|` as `\|` inside `Examples:` cells, where it would otherwise be
   read as a column separator.
4. Leave everything else exactly as authored. This is a normalization, not a
   rewrite: no rephrasing, no capitalization changes, no punctuation
   cleanup.

If a step's text cannot survive this normalization without changing meaning,
that is a defect in the authored `BHV-####.md` to fix at the source — not a
case for the renderer to work around, and not a case for a hand-edit of the
generated file.

## Shared step text is expected; unrecorded shared step text is the defect

Cucumber-family harnesses match step text globally across the whole glue
registry, not per feature file. Two behaviors whose scenarios both begin
"a signed-in user" resolve to the same step definition — which is the
mechanism working as intended, and the reason the framework does not
namespace step text per behavior. Rewriting every step to be unique would
throw away the reuse that makes a shared glue layer worth having.

What the framework does instead is make the sharing visible before it is
discovered by collision: `c9` emits `behaviors/step-index.json`, mapping
each distinct normalized step text to every behavior that renders it and to
the single behavior that owns its definition. See `docs/spec-pack.md`.

Nothing about this changes what this renderer emits. It changes only that a
team implementing behavior 12 can see that its "a row's Open action is
clicked" is behavior 5's step, before writing a second definition of it.

## Idempotence requirement

Re-rendering an unchanged `BHV-####.md` must produce a byte-identical
`.feature` file. This means: stable scenario ordering (table order, not
alphabetical or hash-based), stable tag ordering, and no timestamps or
non-deterministic content embedded in the output.
