# Renderer: BHV -> JUnit

Consumed by `steps/c3-render-tests.yaml` when `framework.yaml: spec_format`
is `junit` or `both`. Tests always run against the *legacy* app —
`framework.yaml: legacy_test_seam` (`rest` | `service` | `ui`) selects which
of the three skeleton shapes below is emitted. There is no target-side
render: this framework never tests the replacement system (`DECISIONS.md`).

## File layout

One JUnit 5 test class per `BHV-####`: `BHV####<PascalTitle>Test.java`
(package/output directory not fixed by this framework — application
-specific). One `@Test` method per Scenarios-table row **whose
`decision_table_ref` is empty**, plus one `@ParameterizedTest` per decision
table (post `c2b` reduction), all in one class, in table order.

**Rows with a non-empty `decision_table_ref` are not independently
rendered.** Per `templates/BHV-template.md`'s rule 3, such a row's
Given/When/Then is a plain-language summary of one row of a decision table
whose own `@ParameterizedTest` already covers that exact condition
combination — rendering the row a second time as its own `@Test` would
duplicate, not add, coverage. This row is still accounted for by `c3`'s
"no silent drops" validator via its `decision_table_ref` association (see
`steps/c3-render-tests.yaml`), not via an independent rendered method. Same
rule as `templates/renderers/gherkin.md`, which states the reasoning;
`templates/BHV-template.md`'s rule 3 is the authority on the row itself.

## Mapping rules

1. **Class header**
   ```java
   /** Rendered from BHV-####. Do not hand-edit — re-render from the BHV instead. */
   class BHV####<PascalTitle>Test {
   ```
2. **Given/When/Then row (empty `decision_table_ref`) → one `@Test` method**,
   named `<scenario_id with '-' replaced by '_'>_<short slug of Then>` — the
   `scenario_id` leads, so two scenarios with similar assertions cannot
   produce the same method name, and a truncated console summary still
   identifies which scenario it belongs to:
   - The method body's structure depends on `legacy_test_seam`:
     - `rest`: arrange request payload/headers from `Given`, perform the
       call implied by `When` via the configured REST client seam, assert
       the response per `Then`.
     - `service`: arrange method arguments from `Given`, invoke the service
       method implied by `When` directly, assert the return value/state per
       `Then`.
     - `ui`: arrange starting page state from `Given`, drive the UI action
       implied by `When` via the configured browser-driver seam, assert
       visible state per `Then`.
   - Exact call syntax is application-specific and intentionally not fixed
     here — this framework specifies the *mapping from spec structure to
     test structure*, not a driver library.
   - A `// legacy_refs: <refs>` comment immediately precedes each method.
3. **Decision-table rows** → one `@ParameterizedTest` with `@CsvSource` (or
   equivalent), one CSV row per table row, columns matching `sub_conditions`
   in table order. MC/DC rows and pairwise-reduced configuration rows are
   emitted as **separate** parameterized methods, never combined into one
   `@CsvSource`, for the same reason as the Gherkin renderer: keeping
   logic-branch coverage and configuration-combination coverage visibly
   distinct.
4. **`origin: new` scenarios** get an additional `@Tag("new-behavior")`
   annotation.
5. **`origin: legacy-defect` scenarios** get `@Tag("legacy-defect")` plus
   `@Tag("preserve")` or `@Tag("fix")` from the row's `disposition`, and a
   `// replaced_by: <scenario_id>` comment when the disposition is `fix`.
   Same reasoning as the Gherkin renderer's rule 5: the test still runs
   against the legacy app, where the defect is real, and the tag is what
   tells a later reader that this assertion describes behavior the
   replacement is meant to change.
6. **`@DisplayName`** is emitted on every method as
   `"<scenario_id> — <Then, truncated>"`. Console and report summaries
   truncate long display names, and two scenarios whose names differ only
   past the truncation point are reported as one — a discrepancy that
   surfaces as an unexplained off-by-one in a suite's own test count. The
   `scenario_id` prefix makes the surviving prefix unique.
7. **Text normalization** applies to every string this renderer emits into a
   display name, a comment, or a `@CsvSource` row, per the identical rules
   in `templates/renderers/gherkin.md`, "Text normalization" — Markdown
   emphasis stripped, newlines collapsed. A `@CsvSource` value additionally
   has `,` and `'` escaped per JUnit's own quoting rules.

## Idempotence requirement

Same as the Gherkin renderer: stable method ordering (table order), no
generated timestamps, no non-deterministic naming (e.g. no random suffixes)
— re-rendering an unchanged `BHV-####.md` must produce byte-identical
source.

## What this renderer explicitly does not do

It does not wire up test fixtures, seed data, mocks, or a CI job to run the
generated class. The emitted class is a syntactically complete skeleton
whose assertions and arrangement calls are derived mechanically from the
`BHV`; wiring it to actually run against the booted legacy app (`c4`) is a
separate, explicit next step — see `docs/phase-0b-walking-skeleton.md` for
why that step is validated on one behavior before Phase A runs at volume,
This skeleton must contain no invented literals that step cannot actually
derive mechanically.
