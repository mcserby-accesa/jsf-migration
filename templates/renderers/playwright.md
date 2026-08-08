# Renderer: BHV -> Playwright

Consumed by `steps/c3-render-tests.yaml` when `framework.yaml: spec_format`
includes `playwright`. A deterministic mapping, specified precisely enough to
implement without judgment calls — if a case arises this mapping doesn't cover,
fix the mapping, don't hand-write around it.

Run by `steps/d1-run-spec-validation.yaml` against the **legacy** application.
See `docs/phase-d-spec-validation.md` for why this exists and what a failure
means (it means the spec is wrong, not the app).

## File layout

One spec file per `BHV-####`, named `BHV-####-<slug-of-title>.spec.ts`, written
to a configurable output directory (not fixed by this framework).

## What is rendered, and what is not

**Rendered:** navigation, element location, assertions, and the decision-table
expansion. All four are derivable from the pack.

**Not rendered:** application state. A case asserting "the panel is hidden when
status is APPROVED" must put the app in that state, and the framework does not
know how — it has no authority to write SQL against your seeded database. Each
case therefore calls a named setup hook the adopting team implements, exactly
as `c3`'s Gherkin renders steps whose definitions the team writes.

## Preamble

```ts
// Generated from BHV-0142.md by templates/renderers/playwright.md — do not edit.
// A failure here means the SPEC is wrong, not the application.
// See docs/phase-d-spec-validation.md.
import { test, expect } from '@playwright/test'
import { given, signIn } from './support/<bhv-id>.setup'

test.describe('BHV-0142 — Leave Request Detail submission', () => {
```

`./support/<bhv-id>.setup` is the team-implemented module. Its required exports
are fixed by this renderer so the generated file compiles against a known
interface:

| Export | Signature | Contract |
|---|---|---|
| `given` | `(scenarioId: string) => Promise<void>` | put the application into the scenario's Given state |
| `signIn` | `(page: Page, role: string) => Promise<void>` | authenticate as a user holding that `AUTHN.declared_roles` role |

A hook shared by several scenarios is named once with one owner, per
`behaviors/step-index.json`'s discipline.

## Scenario cases

One `test()` per scenario, in table order, titled exactly as the Gherkin
renderer titles it — `<scenario_id> — <Then text, truncated to ~80 chars>` —
so the two formats' reports are comparable line for line, and so
`rendered_scenario_titles_unique` holds by construction here too.

```ts
  test('BHV-0142-S01 — the request is submitted for approval', async ({ page }) => {
    // legacy_refs: LeaveRequestBean.java:120-134
    // surface: rest POST /api/v1/leave-requests   (behaviors/scenario-bindings.json)
    await given('BHV-0142-S01')
    await signIn(page, 'EMPLOYEE')
    await page.goto('/leave/detail.xhtml')
    // When
    await page.locator('[id$=":submitButton"]').click()
    // Then
    await expect(page.locator('[id$=":confirmationHeadline"]'))
      .toHaveText('Your request has been submitted for approval.')
  })
```

Traceability comments carry the same two lines the Gherkin renderer emits —
`legacy_refs` and `surface` — for the same reason: a failing case must be
one click from the legacy code it was derived from.

## Locators

Locator derivation is the one place this renderer can go quietly wrong, so the
rule is fixed and ordered:

1. If the target's extraction carries a non-null `client_id`, emit
   `page.locator('#' + <client_id>)` with the value CSS-escaped (a JSF client
   id contains `:`, which must be escaped as `\:`).
2. If `client_id` is `null` — the view builds ids dynamically, or the
   NamingContainer chain was not statically resolvable — emit a suffix match on
   the component id: `page.locator('[id$=":<component_id>"]')`, **and** emit a
   comment naming the fallback:
   ```ts
   // locator: suffix match — client_id not statically resolvable for this component
   ```
   The comment is not decoration. A suffix match is ambiguous if two
   NamingContainers hold the same component id, and a reader debugging a
   failure must be able to tell a fallback locator from an exact one.
3. Never a text-based or nth-child locator. On-screen text is extracted into
   `labels`/`messages` and is asserted *against*; using it to locate makes the
   test tautological, and a positional locator silently follows a layout change
   the pack would otherwise have caught.

Which element to target:

- For a field assertion — the `form_fields` entry named by the AC.
- For a **rule** assertion — the `RULE`'s `DERIVED_FROM` edge leads to its `EL`
  node, whose `attached_component_id` names the guarded component. When that
  component is a `layout_tree` container carrying that rule as its
  `render_guard`, the container's `legacy_refs` confirms it. Both point at the
  same element; the `EL` node is authoritative because it holds the id.

## Rule assertions from decision tables

This is the mapping that makes Phase D worth running. A `RULE` derived from an
`EL` node whose attribute is `rendered`, `disabled`, or `required`, and whose
behavior has a decision table, renders as one parameterised block — one case
per table row, post-`c2b` reduction:

```ts
  // RULE-0031 — Manager approval panel visibility
  // derived from EL-0089 (rendered) on approveButtonPanel, SCR-0142
  // decision table DT-BHV-0142-01, 4 rows after pairwise reduction
  for (const row of [
    { scenarioId: 'DT-BHV-0142-01-R1', status: 'PENDING_MANAGER_APPROVAL', role: 'MANAGER',  locked: false, visible: true  },
    { scenarioId: 'DT-BHV-0142-01-R2', status: 'PENDING_MANAGER_APPROVAL', role: 'EMPLOYEE', locked: false, visible: false },
    { scenarioId: 'DT-BHV-0142-01-R3', status: 'APPROVED',                 role: 'MANAGER',  locked: false, visible: false },
    { scenarioId: 'DT-BHV-0142-01-R4', status: 'PENDING_MANAGER_APPROVAL', role: 'MANAGER',  locked: true,  visible: false },
  ]) {
    test(`${row.scenarioId} — approval panel visible=${row.visible}`, async ({ page }) => {
      await given(row.scenarioId)
      await signIn(page, row.role)
      await page.goto('/leave/detail.xhtml')
      const el = page.locator('[id$=":approveButtonPanel"]')
      // locator: suffix match — client_id not statically resolvable for this component
      await expect(el).toBeVisible({ visible: row.visible })
    })
  }
```

Fixed mapping from the EL attribute to the assertion:

| `EL.attribute` | Assertion |
|---|---|
| `rendered` | `toBeVisible({ visible: <expected> })` |
| `disabled` | `toBeDisabled()` / `toBeEnabled()` |
| `required` | `toHaveAttribute('aria-required', '<expected>')`, falling back to the harness's required marker when the legacy component emits none |
| `value` | `toHaveValue(<expected>)` for an input, `toHaveText(<expected>)` for output |
| anything else | not rendered; recorded by `d1` as `not_exercised` with the reason, never silently omitted |

The row's `scenarioId` is the decision-table row id, not a fresh identifier —
`d1`'s report keys on it, and so does the triage log.

## Navigation rules

A `RULE` derived from a `NAV` node renders as a navigation assertion: perform
the action that produces the outcome, then assert the resulting URL against the
`NAV` node's `to_view`.

```ts
  test('BHV-0142-S04 — the confirmation view is shown', async ({ page }) => {
    await given('BHV-0142-S04')
    await signIn(page, 'EMPLOYEE')
    await page.goto('/leave/detail.xhtml')
    await page.locator('[id$=":submitButton"]').click()
    await expect(page).toHaveURL(/\/leave\/confirmation\.xhtml/)   // NAV-0022
  })
```

The URL is matched as a regex anchored on the `to_view` path, because a JSF
postback appends `ViewState` and often a `jfwid`/conversation parameter that is
not a fact about the navigation rule. Never assert an exact URL string.

## Scenarios that cannot be rendered

A scenario whose `Then` asserts something with no browser-observable
counterpart — a domain-object return value, an unrounded intermediate — is
**not** rendered as a passing stub. It is omitted from the spec file and
recorded in `c3`'s output with a reason, which `d1` reports as
`not_exercised`.

A rendered test that asserts nothing is worse than an absent one: it reports
green and adds to the count.

`behaviors/scenario-bindings.json` already carries this verdict per scenario —
a binding of `domain-only` or `not-observable` is exactly this case, and the
renderer reads it rather than re-deciding.

## Ajax-updated regions

When the asserted element sits inside an `ajax_bindings` entry's
`update_target_field_ids`, the assertion must follow the partial update rather
than race it. Emit Playwright's auto-waiting `expect` (as above) and never a
fixed delay:

```ts
    await page.locator('[id$=":leaveType"]').selectOption('ANNUAL')
    // ajax: leaveType updates entitlementPanel (SCR-0142 ajax_bindings)
    await expect(page.locator('[id$=":entitlementPanel"]')).toBeVisible()
```

The comment names the extracted binding, so a flaky case can be traced to a
real ajax relationship rather than guessed at.

## Text normalization

Every string emitted into a title or an assertion goes through the same
normalization as the Gherkin renderer (`templates/renderers/gherkin.md`, "Text
normalization"), plus one addition: `'` and `` ` `` are escaped for the emitted
TypeScript string literal. A `labels`/`messages` value is asserted **verbatim
after normalization** — never paraphrased, never trimmed to a substring, since
carrying the literal wording is the reason it was extracted.

## Idempotence requirement

Re-rendering an unchanged `BHV-####.md` must produce a byte-identical
`.spec.ts`. Stable scenario ordering (table order), stable row ordering
(post-`c2b` order), no timestamps, no absolute paths, and no generated
identifiers beyond the ids already in the pack.

## What this renderer is not

It is not a test suite for the replacement. It runs against the legacy
application, and the framework ships no target-side harness
(`DECISIONS.md`, "explicitly out of scope"). Reusing these files against a
rebuilt Angular application would require different locators, different
navigation, and a different meaning for every failure — that is the adopting
team's work, and nothing here is designed for it.
