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
   after `a2`/`a3`/`a4` resolved the ambiguous cases — see
   `docs/phase-a-inventory.md`).
2. `BHV-0142.md` — the canonical behavior document (`b3`+`b4` drafted the
   boundary and scenario stubs; `c1` derived the final AC list; `c2` added
   the decision table for the one compound condition; `c5`'s triage
   findings added scenario S03 after the fact). Structure follows
   `templates/BHV-template.md`.
3. `triage-log-excerpt.jsonl` — two entries from `c5-triage-uncovered-branch`
   showing one `missing_scenario` (which fed back into `BHV-0142.md` as
   scenario S03) and one `unreachable_defensive` (accepted, with its
   justification).
4. `BHV-0142.feature` — the Gherkin rendering of `BHV-0142.md`, produced
   mechanically by `c3-render-tests` per `templates/renderers/gherkin.md`.
5. `BHV0142LeaveRequestDetailSubmissionTest.java` — the JUnit rendering of
   the same document, per `templates/renderers/junit.md`, with
   `legacy_test_seam: service`.

Note that every fact in `BHV-0142.md` traces back to a `legacy_refs` entry
that resolves into the excerpt nodes below — nothing here was invented
without a citation, which is the property `legacy_refs_resolve` and
`no_unresolved_triage_entries` (see `validators/README.md`) exist to
enforce mechanically on a real application.
