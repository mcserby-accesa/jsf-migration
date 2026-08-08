# Worked example

One fully worked behavior, `BHV-0142` ("Leave request detail submission"),
carried end to end: a small inventory excerpt it was drafted from, the
canonical `BHV-####.md`, its two rendered outputs (Gherkin and JUnit, since
`spec_format: both` for this example, overriding the `gherkin` default to
show both renderings), and a triage-log excerpt showing how
two of its coverage gaps were resolved. Everything here is illustrative — it
is not, and does not analyze, any real application (see `DECISIONS.md`,
"explicitly out of scope").

Files, in the order they'd be produced by the pipeline:

1. `inventory-excerpt/nodes.jsonl`, `inventory-excerpt/edges.jsonl` — the
   Phase A graph slice this behavior was drafted from (output shape of `a1`,
   after `a2`/`a3`/`a4` resolved the ambiguous cases and lifted the
   expressions — see `docs/phase-a-inventory.md`). Worth reading for the
   value facts specifically: `DB-0044`'s `STATUS` column carries its
   enumerated `value_domain` and `WORKING_DAYS` its `scale: 1`, `SVC-0089`
   carries its `constants` and its one flagged `derivation_method`, and
   `RULE-0044` is that method lifted into an explicit formula with its
   rounding stated. None of those is recoverable from the scenarios below,
   which is why they are extracted rather than inferred.

   `AUTHN-0001` states this application's identity model, including
   `credential_store: external` — the credentials are in the container's
   realm, not the repository. That is a finding the pack states positively,
   not an absence a reader is left to notice.

   Worth reading for the **layout** too. `SCR-0142` carries a `layout_tree`:
   the two-column date grid, the collapsible entitlement panel that renders
   only for annual leave (`RULE-0052`), and the approval toolbar that
   renders only for a manager on a pending request (`RULE-0031`). None of
   that is in `field_groups`, which is why `field_groups` is now defined as
   a flattening of the tree rather than a fact of its own. `TPL-0003` is the
   page frame both screens compose into — its banner, its split layout, its
   content region, and the navigation menu, including the Approvals item
   that is visible only to managers. A screen skeleton without it describes
   a fragment while reading as a description of a page.
2. `wireframe-excerpt/SCR-0142.txt` — the same layout tree rendered by
   `templates/renderers/wireframe.md`, which is what `c9` writes into
   `views/wireframes/`. It states nothing the tree doesn't; read the two
   side by side and the reason it exists is the point — one of them can be
   seen, the other has to be reassembled.

   Not shown here, because it cannot be: `reference/screenshots/`, the
   captured image of this screen as the booted legacy application actually
   rendered it (`a8`). It is non-normative — nothing in the pack derives
   from it or is checked against it.
3. `mermaid-excerpt/` — the pack's four diagram families, rendered per
   `templates/renderers/mermaid.md`: `erd.mmd` (the data model, with
   precision/scale/value domains on the attributes — the value facts an ORM's
   default silently overrides), `menu.mmd` (how a user reaches a screen and who
   is allowed to, with role-guarded edges dotted, and one deliberately
   `unresolved:` target to show what an unmatched menu destination looks like),
   `order.mmd` (build waves, with a two-behavior cycle drawn thick — `order.json`
   reports cycles and never breaks them, and this is where one becomes visible),
   and `BHV-0142-flow.mmd` (this behavior's screen flow, one hop out to a screen
   another behavior owns). The fourth family, `neighborhood_diagram`, is inline
   in `BHV-0142.md` below.

   All five were checked against a real Mermaid parser, which is what
   `mermaid_diagrams_render` requires of a pack — a deterministic mapping
   guarantees the same bytes every time and guarantees nothing about whether
   they load.
4. `BHV-0142.md` — the canonical behavior document (`b3`+`b4` drafted the
   boundary and scenario stubs; `c1` derived the final AC list; `c2` added
   the decision table for the one compound condition; `c5`'s triage
   findings added scenario S03 after the fact). Structure follows
   `templates/BHV-template.md`.
5. `triage-log-excerpt.jsonl` — two entries from `c5-triage-uncovered-branch`
   showing one `missing_scenario` (which fed back into `BHV-0142.md` as
   scenario S03) and one `unreachable_defensive` (accepted, with its
   justification).
6. `BHV-0142.feature` — the Gherkin rendering of `BHV-0142.md`, produced
   mechanically by `c3-render-tests` per `templates/renderers/gherkin.md`.
7. `BHV0142LeaveRequestDetailSubmissionTest.java` — the JUnit rendering of
   the same document, per `templates/renderers/junit.md`, with
   `legacy_test_seam: service`.

Note that every fact in `BHV-0142.md` traces back to a `legacy_refs` entry
that resolves into the excerpt nodes below — nothing here was invented
without a citation, which is the property `legacy_refs_resolve` and
`no_unresolved_triage_entries` (see `validators/README.md`) exist to
enforce mechanically on a real application.
