# Renderer: layout_tree -> wireframe

Consumed by `steps/c9-assemble-spec-pack.yaml`, which emits one
`views/wireframes/SCR-####.txt` per active `SCR` node and one
`views/wireframes/TPL-####.txt` per active `TPL` node. Like the Gherkin and
JUnit renderers, this is a deterministic mapping specified precisely enough
to implement without judgment calls — if a case arises this mapping doesn't
cover, fix the mapping, don't hand-draw around it.

## Why this file exists

`views/pages.json` carries the layout tree in full, and a consumer that
parses it perfectly still has to hold the whole nesting in their head to see
the page. The wireframe is the same fact arranged so it can be read at a
glance — by a reviewer checking the extraction against the legacy screen, and
by an implementer or agent that reads text.

It is a **projection**: regenerated from `views/pages.json`, never edited,
and checked by `projection_regenerates_identically` like every other
projection in the pack. It introduces no fact of its own. Anything true in a
wireframe and absent from `layout_tree` is a renderer bug.

## Output file

- Encoding: UTF-8. Box-drawing characters are used for structure; everything
  inside a box is ASCII.
- Line ending: `\n`. No trailing whitespace on any line. Exactly one trailing
  newline at end of file.
- Total width: **100 columns**, fixed. Not configurable — a configurable
  width would make a projection's bytes depend on a parameter, and the file
  exists to be diffed across re-runs.

## Layout algorithm

1. The root container occupies the full 100 columns. Every box consumes 1
   column of border on each side, so a box's **inner width** is its allotted
   width minus 2.
2. A `grid` or `split` with `columns: N` divides its inner width into N cells
   by integer division. The remainder is distributed one column at a time to
   the leftmost cells, left to right. Cells are separated by a single `│`,
   which is drawn from the separator's own budget (N-1 columns, taken before
   the division).
3. Every other container kind gives its children the full inner width,
   stacked vertically in `children` order. The one exception is a `toolbar`
   with `orientation: horizontal`, whose children are laid out on one line in
   `children` order, separated by two spaces, wrapping to a second line when
   they no longer fit — a vertically stacked button bar reads as a menu.
4. A child with `colspan: k` occupies k consecutive cells plus the k-1
   separators between them. A `colspan` larger than the remaining cells in
   the row is clamped to the remainder; a clamp is not an error and is not
   annotated (the source declared an overflow, and reproducing it as an
   overflow would be inventing).
5. `rowspan` is **not** rendered. A wireframe is a reading aid, not a
   faithful renderer, and vertical spanning cannot be drawn in this form
   without ambiguity. `rowspan > 1` is recorded in the legend instead (see
   below), which keeps the fact visible without pretending to draw it.
6. Any text wider than its cell is truncated to `width - 1` characters and
   suffixed `~`. Never wrapped: a wrapped label makes two rows out of one and
   the diff stops being readable.

## Containers

A container is drawn as a box when it has a `label`, a `render_guard`, or a
`container_kind` other than `stack`. A `stack` with neither a label nor a
guard is drawn without a box — its children simply stack — because boxing
every grouping wrapper produces nesting no reader can follow.

```
┌─ <label> ────────────────────────────────────────┐
│ ...children...                                   │
└──────────────────────────────────────────────────┘
```

The header line is `┌─ `, the label, ` `, then `─` padding to the closing
`┐`. An unlabelled box that must still be drawn carries its annotations
alone as the header text, in the same form; an unlabelled box with no
annotations either uses `┌` + `─` padding + `┐`.

Per kind, the header carries one annotation, appended to the label before
padding:

| `container_kind` | Header annotation |
|---|---|
| `grid` | ` (N cols)` when `columns > 1`; nothing when 1 |
| `tabs` | nothing on the box; see tab strip below |
| `wizard-steps` | nothing on the box; see tab strip below |
| `accordion` | nothing on the box; each child pane is its own box |
| `split` | ` (split)` |
| `toolbar` | ` (toolbar)` |
| `dialog` | ` (dialog)` |
| `region` | ` (region: <region_name>)` |
| `table` | nothing; the leaf renders it |
| `custom` | ` (custom: <legacy_component>)` |
| `stack` | nothing |

Then, in this order:

- `collapsible: true` appends ` [+]` when `initially_collapsed`, ` [-]` when
  not.
- `render_guard` appends ` (when <guard_id>)`. The id, not the rule text —
  the text goes in the legend, where it has room to be accurate.

## Tabs and wizard steps

A `tabs` or `wizard-steps` container draws a strip as its first inner line,
listing each child's `label` in order, with the `initially_selected` child in
square brackets and the rest bare, separated by two spaces:

```
│ [Details]  Approvals  History                    │
```

Only the initially-selected child's contents are drawn. Every other pane
renders as a single line naming it:

```
│ ... Approvals (not shown)                        │
```

This is a deliberate loss. Drawing every pane stacked would make a
three-tab screen read as one long form, which is precisely the confusion the
wireframe exists to remove. The unshown panes are fully present in
`views/pages.json`, and each has its own entry in the legend.

`wizard-steps` renders identically but numbers the strip: `[1 Dates]  2
Approver  3 Review`.

## Field leaves

A field leaf renders from its `form_fields` entry:

```
<label padded to label column>  [<component_kind><modifiers>]
```

- **Label** comes from the `labels` entry whose `field_id` matches. Placement
  follows the field's `label_position`:
  - `left` — label left-aligned in a label column, then two spaces, then the
    control. The label column is the longest label among the *sibling* leaves
    in the same container, capped at 24 characters.
  - `top` — label on its own line, control on the next.
  - `right` — control first, two spaces, then the label.
  - `none` — control only.
  - `unspecified` — rendered as `left`, and the field is listed in the legend
    under "label position not declared in source", so a reader is never left
    thinking the source said `left`.
- **Control** is the `component_kind` verbatim inside brackets, padded with
  spaces to the width implied by `width_class` — `full` fills the remaining
  cell width, `half` half of it, `third` a third, `quarter` a quarter, `fixed`
  and `unspecified` a fixed 20 columns. Widths round down; a control narrower
  than its own kind name is truncated per rule 6.
- **Modifiers**, appended inside the brackets in this fixed order: `*` when
  the field is `required`, `#` when it is read-only or disabled by default,
  `?` when either is governed by an EL expression rather than a static
  attribute (the guard id goes in the legend).

```
Start date    [date              *]
Half day      [boolean-toggle     ]
Balance       [numeric           #]
```

**`action` and `link` fields are the exception**: their label *is* the
control, so it renders inside the brackets rather than beside them —
`[ Approve ]` — and `label_position` is ignored for them. A button rendered
as `[action]` with its text in a label column beside it would be describing
a control that does not exist.

## Table leaves

A `data_table` leaf renders its column headers, one header row, then one
placeholder row, then a pagination line when `pagination.enabled`:

```
┌─ Requests ───────────────────────────────────────┐
│ Reference   │ Submitted  │ Status    │ Days      │
│ ...         │ ...        │ ...       │ ...       │
│ 10 per page (server-side)                        │
└──────────────────────────────────────────────────┘
```

Columns divide the inner width by the same rule as a grid. A column with
`sortable` appends ` ^` to its header, `filterable` appends ` =`; both append
` ^=`.

## Static text leaves

Rendered as the resolved `text`, truncated per rule 6, with no brackets and
no label column. This is what distinguishes an instruction line from a field.

## Include leaves

```
│ >> TPL-0007 (approvalButtons)                    │
```

The `>>` marks a composition boundary. The included content is not drawn —
it has its own wireframe file. A `render_guard` on the include appends
` (when <guard_id>)` as for a container.

## The header and the legend

Every file opens with three lines and closes with a legend:

```
SCR-0142 — Leave Request Detail
template: TPL-0003 (fills: content, pageTitle)
source: leave/detail.xhtml

<the wireframe>

legend
  LT-4    render_guard RULE-0031 — The approval panel is shown only when ...
  LT-9    pane not shown: Approvals
  LT-11   rowspan 2 (not drawn)
  endDate label position not declared in source
```

Legend entries are emitted in this order — guards, unshown panes, undrawn
spans, undeclared label positions — and within each group in `node_id`
order. Rule text is truncated to fit 100 columns. The legend is omitted
entirely when empty; the blank line before it is omitted with it.

The `template:` line reads `template: none (renders its own frame)` when
`layout_template.template_ref` is null. It is never omitted — a screen that
owns its frame is a fact, and a missing line reads as an extractor that
didn't look.

## Idempotence requirement

Re-rendering an unchanged `views/pages.json` must produce byte-identical
files. This means: children in `children` order, never sorted; legend order
as specified above; no timestamps; no hostname, path, or run id embedded
anywhere; and integer division for every width, so no floating-point
formatting difference can appear between platforms.

## What a wireframe is not

It is not a rendering, not a mockup, and not a specification of appearance.
It shows containment, order, and conditionality — the facts `layout_tree`
holds. Spacing, proportion, colour, and density are not in it, are not
extracted anywhere, and are what `reference/screenshots/` is for. A reader
treating a wireframe as a picture of the legacy screen has read more into it
than it claims.
