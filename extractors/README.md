# Extractors

This is a contract specification only — no extractor here is implemented.
`a1-extract-inventory` is the one implementation surface this framework leaves
unwritten by design (`steps/a1-extract-inventory.yaml`, notes): view scanners
are stack-specific, and a JSF 1.x application and a JSF 2.x/PrimeFaces
application need different ones.

What is not stack-specific is how the extraction is *packaged*. The extraction
**rules** — what each scanner must record — are in
`docs/phase-a-inventory.md`, "Extraction rules", which remains the authority
on the rules themselves. This file is the authority on the packaging: how
those rules divide into passes that can run independently, the temporary key
grammar that lets one pass emit an edge into a node another pass owns, and the
merge pass that turns those keys into the ids `a5` validates.

Two implementations satisfy the same contract:

- **Deterministic parsers** — AST/DOM/XML walkers. What `a1` specifies, and
  what `known_file_types_scanned` assumes ran.
- **Bounded model passes standing in for them** — one agent per pass, each
  given a fixed file list, the extraction rules, and an output schema narrow
  enough that it records rather than reasons. Slower, and not byte-identical
  across runs. Portable across stacks in a way a tag-library scanner is not,
  which is what gets a pilot to Phase B without first writing a parser per
  view technology. `example-a1-inventory.workflow.js` is one, as actually run.

  Adopt this route with one acceptance criterion knowingly waived: `a1`
  requires that re-running against an unchanged snapshot produce a
  byte-identical `nodes.jsonl`/`edges.jsonl`, and model passes do not. Step 2
  of the merge pass recovers the part that matters — stable *ids* for an
  unchanged source — but a re-run may still word a `label` or an `evidence`
  excerpt differently. Anything downstream that diffs the graph across runs
  is comparing ids, not bytes.

The invariants below hold either way. A model pass that breaks one has not
"used judgment" — it has produced an inventory `a5` should reject.

---

## The partition rule

Passes must own **disjoint slices of the source**, not disjoint node kinds. A
file is read fully by exactly one pass; two passes reading the same file
produce two conflicting nodes for the same thing, and the merge pass can only
guess which is more complete.

The consequence worth stating: the view/bean pair scan reads backing beans
(it must, to resolve the pairing), so the Java scan must **exclude** them,
even though a backing bean is a `SVC` node and `SVC` is otherwise the Java
scan's kind to produce.

Within a slice, a pass may be split further for size — the worked example
splits the view walk three ways by screen family. Splitting is free except
for facts that are properties of the *whole* application rather than of a
file; each of those is owned by exactly one named pass:

| Whole-application fact | Owned by |
|---|---|
| `nav_menu` | the view pass that reads the shell template |
| `AUTHN` (exactly one node) | the auth pass |
| the scheduler check (rule 8) | one named pass, even when the answer is "none" |

## The key grammar

No pass assigns a final id — ids are global, and a pass sees one slice. Each
pass emits a temporary `key` per node, and every edge references
`from_key`/`to_key` in the same grammar. A pass **guesses the key of a node it
does not own** rather than dropping the edge; the merge pass resolves it or
flags it.

| Kind | Key |
|---|---|
| `SCR` | `SCR:<path from the web root>` |
| `TPL` | `TPL:<same path convention>` |
| `SVC` | `SVC:<fully-qualified class name>` |
| `PROC` | `PROC:<the BPMN process element's own id attribute>` |
| `TASK` | `TASK:<the BPMN element's own id attribute>` |
| `JOB` | `JOB:<class#method, or the job's declared name>` |
| `DB` | `DB:<table name, cased exactly as the entity or schema declares it>` |
| `NAV` | `NAV:<from-view-id>-><to-outcome-or-view>` |
| `AUTHZ` | `AUTHZ:<url-pattern or class#method the constraint protects>` |
| `AUTHN` | `AUTHN:app` — there is exactly one, application-wide |
| `EL` | `EL:<screen-or-template path>#<component id or best-effort locator>-<attribute>` |
| `CFG` | `CFG:<managed-bean name, or filter/servlet name>` |

`JOB` is the one row the worked example never exercised — that application has
no scheduler config, so the grammar for it is stated here rather than proven.

The `PROC` key must be the process's own id attribute and nothing else,
because application code starts the process by that literal string — a `STARTS`
edge from a bean resolves only if both sides spell it the same way.

## The pass output contract

Each pass returns `{nodes, edges, notes}`. `nodes` and `edges` are
`schemas/a1-extract-inventory.schema.json` **narrowed in three ways**:

- `node.id` is replaced by `node.key`; `edge.from`/`edge.to` by
  `from_key`/`to_key`.
- `node.kind` drops `rule`, and `edge.type` drops `COVERS`. Neither is
  reachable from `a1` — `rule` is `a3`'s to create, `COVERS` is Phase B's —
  so the schema is where that is enforced, not a reviewer's attention.
- `classification_source` is absent. `a1` never sets it; only `a2`'s
  resolution does.

`notes` is required and is not decoration: it carries every judgment call,
every check performed whose answer was "none found", and every fact the pass
observed but was not the owner of. It is read by the merge pass, which has no
other view of the pass's reasoning.

## The passes

### `views` — rules 2, 4, 9

- **Owns:** every `.xhtml` under the web root, and the backing beans those
  views resolve to.
- **Emits:** `SCR`, `TPL`, `EL`; `RENDERS`, `COMPOSES_INTO`, `INCLUDES`,
  `VALIDATED_BY`, `CONVERTED_BY`; `SVC` for the backing bean classes it read.
- **One walk, three rules:** the pair scan, the EL scan, and the
  layout/template scan are the same DOM traversal. Splitting them across
  passes means walking each file three times and reconciling three
  layout trees.
- **`SCR` vs `TPL`** is the decision most often gotten wrong: composed *into*
  is `TPL` (a fragment `ui:include`d by four screens is a `TPL` with
  `template_role: "fragment"`), navigated *to* is `SCR`. A pass that
  mislabels this corrupts the menu graph and every wireframe downstream.
- **Must not:** drop a view for having no resolvable backing bean — it is
  still a `SCR`, with `extraction_confidence: "ambiguous"` and an empty
  `backing_bean_class`. Screens outside the view technology (a plain HTML
  form posting to a container login) are `SCR` too, with the reason recorded.

### `java` — rule 1 (and the rule 8 check)

- **Owns:** every non-view business-logic class — services, DAOs, delegates,
  `@FacesConverter`/`@FacesValidator` classes, servlets. **Excludes** backing
  beans, per the partition rule.
- **Emits:** `SVC`; candidate `INVOKES`/`READS`/`WRITES`; `JOB` and
  `SCHEDULES` if the scheduler check finds anything.
- **Confidence:** a dependency-injected interface that static analysis cannot
  pin to exactly one implementation is `ambiguous`. That is `a4`'s input, not
  a defect.
- **Value facts:** `constants` and `derivation_methods` are recorded, never
  lifted — a derivation method is *flagged* for `a3`. A pass that writes the
  formula has done `a3`'s work without `a3`'s validators.
- **Domain entities** are read by this pass for derivation methods only; the
  data pass owns their table facts. Where an entity has both, it appears in
  both passes' output with disjoint `raw_facts` and the dual role stated.

### `config-and-auth` — rules 3, 5

- **Owns:** `faces-config.xml`, `web.xml`, and every security annotation in
  the source tree.
- **Emits:** `NAV`, `CFG`, `AUTHZ`, exactly one `AUTHN`; `RESTRICTS`.
- **Wildcards resolve against the real screen list:** one `url-pattern`
  matching six screens becomes six `RESTRICTS` edges, and the fan-out is
  stated in `notes`.
- **`credential_store`** is `in_repo`, `external`, or `unknown`, decided from
  evidence — a container realm the repository does not contain is `external`,
  and saying so is a finding (see `identity_model_present`).
- **Must not:** lift an EL-guarded navigation condition. The raw expression
  is the fact.

### `process` — rule 6

- **Owns:** the BPMN definitions.
- **Emits:** `PROC`, `TASK`, `CONTAINS`; gateway `condition_expr` verbatim,
  flagged for `a3` as source kind `el`.
- **Must not:** invent an edge type. There is no `TASK`→`SVC` type in the
  edge table, so a service task's `camunda:class`/`delegateExpression` is a
  `raw_facts` field (`delegate_ref`) the merge pass cross-checks against the
  Java pass's `SVC` nodes — not a new edge type the schema will reject.

### `data` — rule 7

- **Owns:** the schema. Where the DDL is generated rather than committed, the
  ORM mappings are the source of truth for column facts, and the pass says
  which source each `value_domain` came from.
- **Emits:** `DB` (table, trigger, stored procedure); table-to-table
  relationships live in each column's `foreign_key` field, as there is no
  table-to-table edge type.
- **`value_domain: null` is an answer** — "not knowable mechanically" — and
  the key is present. Seed data alone is not a value domain unless it is the
  only evidence for a genuinely enumerated column, and then the pass states
  that it was.
- **Must not:** fabricate `trigger`/`stored_procedure` nodes, or omit the
  check. An application with no triggers gets that absence recorded.

## The merge pass

Deterministic, and the only pass that sees everything. Its output is `a1`'s
output.

1. **Map kind to prefix** — `screen`→`SCR`, `template`→`TPL`,
   `service`→`SVC`, `process`→`PROC`, `task`→`TASK`, `job`→`JOB`,
   `navigation`→`NAV`, `db`→`DB`, `el`→`EL`, `config`→`CFG`,
   `authz`→`AUTHZ`, `authn`→`AUTHN`. A `rule` node reaching this point is
   dropped *and reported* — it is a bug in the pass that emitted it.
2. **Assign ids** — within each prefix, sort by `key` ascending and number
   sequentially, `PREFIX-0001`, zero-padded to four digits. Sorting by key,
   not by arrival order, is what makes a re-run of an unchanged source
   produce the same ids.
3. **Merge true duplicates** — two passes describing the same thing become
   one node: union `legacy_refs` and `raw_facts`, prefer the more complete,
   and report the merge.
4. **Rewrite nodes** — drop `key`, add `id` and
   `extracted_by: "a1-extract-inventory"`, leave `classification_source`
   unset. Final fields exactly as the schema allows; it is
   `additionalProperties: false`.
5. **Resolve edges** — `from_key`/`to_key` to ids. An unresolvable key
   **keeps** its edge, downgrades it to `extraction_confidence: "ambiguous"`,
   and appears in a reported `unresolved_edges` list. A silently dropped edge
   is a missing dependency no later validator can detect, because nothing
   downstream knows it was ever claimed.
6. **Validate before writing** — id pattern and prefix; no `RULE` node;
   exactly one `AUTHN` node; every edge's `evidence` non-empty. These are
   `a5`'s own checks run early, where the fix is cheap.
7. **Write JSONL** — `nodes.jsonl` ordered by id, `edges.jsonl` by
   `(from, to, type)`. One object per line, no wrapping array.
8. **Report, don't dump** — counts per kind and per type, the unresolved
   edges, the merges, the validator issues, and **every kind with zero
   instances, each marked expected or not**. "No `JOB` nodes, no scheduler
   config in the source" is a result; a missing `JOB` count is an unasked
   question.

## Invariants no extractor may break

- **Never emit a `RULE` node.** `a3` creates rules, from the raw `EL`,
  trigger/procedure bodies, and derivation methods flagged here.
- **Never resolve an ambiguity.** Flagging it is the job; `a2`/`a3`/`a4`
  resolve. A pass that quietly picks the likely answer removes the escalation
  that would have produced the right one.
- **Never omit a check silently.** An absence is a recorded state, not a
  blank — the principle `docs/phase-a-inventory.md` applies to value facts,
  applied to the extraction itself.
- **Never invent schema.** Not an edge type, not a node kind, not a field
  outside `raw_facts`.
- **Never assign a final id in a pass.** Only the merge pass does.
- **Never write the pack from a pass.** `a1` writes `nodes.jsonl` and
  `edges.jsonl` and nothing else; the graph load does not mutate them.

## The worked example

`example-a1-inventory.workflow.js` is the script that ran `a1` against a
JSF 1.2/Camunda demo application (`acme-procurement`) as seven parallel
model passes plus a merge, producing 138 nodes and 103 edges that loaded and
passed into Phase B. It is copied here **as run**, so the parts that are
specific to that application are visible rather than smoothed away:

- the three path constants, and the framework doc paths in its preamble;
- the per-pass file lists;
- the per-pass "context worth knowing" notes — real facts about that source
  (a `@ViewScoped` bean destroyed by a `<redirect/>`, an OmniFaces converter
  that is not a class in the application's own tree), each stated with an
  instruction to verify it against the file rather than take it on faith.

That last category is the one to copy deliberately. Those notes are what kept
seven independent passes from each making the same wrong inference — but a
note asserting a fact that has since changed is worse than no note, which is
why each is framed as a claim to check.
