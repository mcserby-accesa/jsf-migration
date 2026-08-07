# Phase A — Inventory

Goal: produce a complete, script-generated, re-runnable graph of the legacy
application's structure — `nodes.jsonl` + `edges.jsonl` — with LLM judgment
used only where a deterministic extractor cannot decide something with
certainty. This document specifies node types, edge types, and extraction
rules precisely enough that a competent engineer who has never seen this
repo can build the extractors and run Phase A to completion without further
guidance.

Phase A requires Phase 0 to have passed (see `docs/phase-0-environment.md`).

## Graph storage

- `nodes.jsonl`: one JSON object per line, one node per line. Append-only per
  extractor run; a re-run either reproduces byte-identical lines for
  unchanged legacy code or produces a diffable delta.
- `edges.jsonl`: one JSON object per line: `{"from": "<node id>", "to":
  "<node id>", "type": "<edge type>", "evidence": "<file:line or excerpt>"}`.
- Both files are the source of truth. They are loaded into whichever engine
  `framework.yaml: graph_store` selects (DuckDB or SQLite) purely for
  querying — the load step must not mutate the source files. Diagram views
  are Mermaid, generated *from* a query against the loaded store, never
  hand-edited, never a second source of truth — see
  `docs/phase-b-behaviors.md`, "Neighborhood diagram," for the one scoped
  place a diagram is actually produced (a whole-inventory diagram is neither
  legible nor reliably renderable at real application scale).
- IDs are global and stable across re-runs: `<PREFIX>-####`, zero-padded to
  at least 4 digits, assigned once and never reused even if a node is later
  deleted (deletion is a `status: removed` field, not a line removal, so
  historical `legacy_refs` in behavior specs don't silently dangle).

## Node types

| Prefix | Node kind | What it represents | Extracted by |
|---|---|---|---|
| `SCR` | Screen | One JSF view (`.xhtml`) + its backing managed bean | View/bean pair scanner |
| `SVC` | Service | A session bean, service class, DAO, or other non-view business-logic class | Java AST scanner |
| `RULE` | Rule | A business rule unit: either lifted from an `EL` node, or confirmed from a code-clone cluster (Phase B) | Never extracted directly in Phase A — created only via the `EL`-lift step (`a3`) or in Phase B; Phase A only creates the raw `EL` nodes it lifts from |
| `PROC` | BPMN process | One BPMN process definition | BPMN XML parser |
| `TASK` | BPMN task/gateway | One user task, service task, or gateway within a `PROC` | BPMN XML parser (child of a `PROC`) |
| `JOB` | Scheduled job | A Quartz job, `@Scheduled` method, or container-managed timer | Job/scheduler config scanner |
| `NAV` | Navigation rule | One `faces-config.xml` `<navigation-rule>`/`<navigation-case>` | `faces-config.xml` parser |
| `DB` | Database object | A table, trigger, or stored procedure (`kind` field distinguishes them) | DB catalog introspection |
| `EL` | Raw EL expression | One `rendered`/`disabled`/`required`/`value` (or other conditional) EL attribute on one JSF component, pre-interpretation | View DOM scanner |
| `CFG` | Config declaration | A `faces-config.xml` managed-bean declaration, or a `web.xml` filter/servlet relevant to reaching a screen | Config scanner |
| `AUTHZ` | Authorization constraint | One `web.xml` `<security-constraint>`, or one class/method-level `@RolesAllowed`/equivalent annotation | Auth scanner (D14, REVIEW.md — closed) |

Custom converters and validators (`@FacesConverter`/`@FacesValidator` classes, or
equivalent) are **not** a new node kind — they are ordinary Java classes the
existing `SVC` extraction rule already picks up (see "Extraction rules" below).
Unlike EL, their logic runs as normal JVM bytecode and is visible to JaCoCo,
so they need graph *edges* for traceability, not an EL-style lift.

### Node schema (common fields, all node types)

```json
{
  "id": "SCR-0142",
  "kind": "screen",
  "label": "Leave Request Detail",
  "legacy_refs": ["src/main/webapp/leave/detail.xhtml:1-220", "src/main/java/.../LeaveDetailBean.java:1-340"],
  "extracted_by": "a1-extract-inventory",
  "extraction_confidence": "certain",
  "status": "active",
  "raw_facts": { "...": "kind-specific fields, see below" }
}
```

- `extraction_confidence` is either `"certain"` (script decided outright) or
  `"ambiguous"` (script flagged for `a2`/`a3` LLM confirmation — see below).
  A node is never written with confidence `"ambiguous"` as its *final* state;
  `a2`/`a3` resolve it to `"certain"` (with a `classification_source: "llm"`
  field added) or `"rejected"` before the graph is considered valid.
- `status` is `"active"` or `"removed"` — see ID stability note above.

### Kind-specific `raw_facts`

- `SCR`: `view_path`, `backing_bean_class`, `managed_bean_name`,
  `form_fields` (list of component id + bound property + presentation facts
  — see "Structural skeletons" below), plus, at the same screen level:
  `field_groups`, `data_tables`, `ajax_bindings`, `converters_validators`
  (also detailed below). All of these are extracted unconditionally by the
  same DOM walk that already produces `form_fields` — there is no reason to
  gate mechanical extraction on anything; see "Structural skeletons" for
  what gates *enforcement* of some of this content downstream.
- `SVC`: `fqcn`, `annotations` (e.g. `@Stateless`, `@Service`, scope
  annotations like `@RequestScoped`/`@ViewScoped`/`@SessionScoped`/
  `@ConversationScoped`), `public_methods` (list of `{name, params: [{name,
  type}], return_type, action_bound: bool, nav_outcomes: [string]}` —
  `action_bound` is true when some `SCR`'s `action=`/ajax `listener=`
  references this method; `nav_outcomes` lists the literal outcome strings
  the method can return, when it returns a JSF navigation outcome),
  `injected_deps` (list of other `SVC`/`DB` refs found by static analysis,
  used to seed candidate edges before `a4` confirms them). Custom
  `@FacesConverter`/`@FacesValidator` classes are extracted as `SVC` nodes
  via this same rule — nothing converter/validator-specific about the
  extraction, only about the edges pointing at them (see Edge types).
- `PROC` / `TASK`: `bpmn_id`, `process_key` (for `PROC`), `task_type` (for
  `TASK`: `userTask`/`serviceTask`/`exclusiveGateway`/etc.), `condition_expr`
  (for gateways — raw expression, lifted into a `RULE` the same way `EL` is).
- `JOB`: `schedule_expr` (cron or fixed-rate), `invoked_method`.
- `NAV`: `from_view`, `to_view`, `from_outcome`, `condition` (if a
  `<if>`/EL-guarded navigation case — raw expression, also lifted).
- `DB`: `kind` (`"table"`/`"trigger"`/`"stored_procedure"`), `name`, and for
  triggers/procs the `body_ref` (a `legacy_refs` pointer into the DDL/SQL
  source since it usually isn't in the app's own repo); for `kind: "table"`,
  `columns` (list of `{name, type, nullable, primary_key, foreign_key:
  <DB table node id or null>}`), mechanically read from the same catalog
  introspection pass — this is what the spec pack's data model ships, and
  what an implementer derives target entities from without ever reading DDL
  by hand.
- `EL`: `attribute` (`rendered`/`disabled`/`required`/`value`/other),
  `raw_expression` (verbatim EL string), `attached_component_id`,
  `attached_screen` (the `SCR` id).
- `CFG`: `declaration_type`, `scope` (request/session/application/view),
  `raw_xml_excerpt`.
- `AUTHZ`: `constraint_type` (`web.xml`/`annotation`), `url_pattern` (if
  `web.xml`-sourced), `roles` (list of role names), `raw_excerpt`.

## Edge types

| Type | From → To | Meaning |
|---|---|---|
| `RENDERS` | `SCR` → `SVC` | The screen's backing bean is this service/bean |
| `INVOKES` | `SVC`/`SCR` → `SVC` | Method call, statically resolved |
| `NAVIGATES_TO` | `SCR`/`NAV` → `SCR` | A navigation outcome leads to this screen |
| `TRIGGERS` | `DB`(trigger) → `DB`(table), or `SVC` → `DB`(proc) | A DB trigger fires on a table; a service calls a stored proc |
| `READS` / `WRITES` | `SVC` → `DB`(table) | Data access, statically resolved from DAO/query code |
| `STARTS` | `SCR`/`SVC` → `PROC` | Something starts a BPMN process instance |
| `CONTAINS` | `PROC` → `TASK` | A task/gateway belongs to a process |
| `SCHEDULES` | `JOB` → `SVC` | A job invokes a service method |
| `GUARDS` | `RULE` → `SCR`(component)/`NAV`/`TASK` | A lifted rule governs whether this element renders/is enabled/is taken |
| `DERIVED_FROM` | `RULE` → `EL`/`TASK`/`DB` | Traceability from a lifted rule back to its raw source expression or DB trigger/procedure body (`a6`, see below) |
| `VALIDATED_BY` | `SCR`(component) → `SVC` | A component is checked by this custom `@FacesValidator` class |
| `CONVERTED_BY` | `SCR`(component) → `SVC` | A component's value is converted by this custom `@FacesConverter` class |
| `RESTRICTS` | `AUTHZ` → `SCR`/`SVC` | An authorization constraint gates access to this screen or method (D14, closed) |
| `COVERS` | `BHV` → any node | Phase B only: a behavior claims this inventory node as part of its scope |

Every edge's `evidence` field must be a `file:line` or an EL/SQL excerpt — an
edge without evidence cannot pass `a5` validation.

## Extraction rules

Extractors are deterministic tools; this section specifies what each must do,
not how to implement it.

1. **Java AST scan** (`SVC` nodes, `INVOKES`/`READS`/`WRITES` candidate
   edges): walk compiled or source AST for classes annotated as
   session beans/services/DAOs (framework-specific annotations are an
   application-level config, not hardcoded here) **and for
   `@FacesConverter`/`@FacesValidator` classes**, which this same rule
   extracts as ordinary `SVC` nodes (D14 — closed: their logic runs as
   normal JVM bytecode, visible to JaCoCo like any other service class, so
   they need graph edges for traceability, not an EL-style lift). Record
   every method call to another such class as a candidate `INVOKES` edge and
   every JDBC/JPA/query-builder call touching a named table as a candidate
   `READS`/`WRITES` edge. Candidate edges from static analysis (which cannot
   always resolve dynamic dispatch, reflection, or dependency-injected
   interfaces to a concrete implementation) are marked
   `extraction_confidence: "ambiguous"` whenever the target cannot be
   resolved to exactly one node; `a4` resolves these.
2. **View/bean pair scan** (`SCR` nodes): for every `.xhtml` under the web
   root, resolve its backing managed bean via `faces-config.xml` or bean
   annotations (`@ManagedBean`/`@Named` + `@ViewScoped` etc.), and record
   every input/output component's `id` and bound property as `form_fields`.
   A view with no resolvable backing bean is still recorded as a `SCR` node
   with `extraction_confidence: "ambiguous"` and an empty `backing_bean_class`
   — do not drop it silently. This same pass also produces the page's
   structural skeleton (see "Structural skeletons" below): `field_groups`
   (container nesting, abstracted to a group label + ordered field-id list —
   never the raw `h:panelGrid`/`p:panel` tag), `data_tables` (one entry per
   `h:dataTable`/`p:dataTable`, with `columns: [{header, bound_property,
   sortable, filterable}]` in document order and `pagination: {enabled,
   page_size, style: "client-side"|"server-side"}`), `ajax_bindings` (one
   entry per `f:ajax`/`p:ajax`, `{trigger_field_id, listener_method: <SVC
   method ref, or null>, update_target_field_ids: [...]}`), and
   `converters_validators` (one entry per `f:converter`/`f:validator`
   reference, `{field_id, kind: "converter"|"validator", ref: <built-in id
   or custom class FQCN>, legacy_refs}` — for a custom `ref`, this pass also
   emits the corresponding `VALIDATED_BY`/`CONVERTED_BY` edge to the `SVC`
   node the Java AST scan produced for that class). For every field or
   column, `component_kind` is an abstracted widget kind from a closed
   vocabulary (`text`, `multiline-text`, `single-select`, `multi-select`,
   `date`, `boolean-toggle`, `numeric`, ...), never the literal JSF/PrimeFaces
   tag name — the tag itself is retained only as a `legacy_component`
   trace-back field, never something a downstream consumer reads
   semantically. For a `single-select`/`multi-select` field, `options_source`
   is `"static"` or `"dynamic:<node id>"` pointing at the `EL`/`RULE` node
   already produced by the EL scan below for that `f:selectItems value=`
   binding — this is not a new mechanism, just a type tag on an existing one.
   Not every component maps cleanly onto the closed vocabulary — a custom
   composite component or an unusual third-party widget won't. For those,
   `component_kind` is `"custom"`, with `legacy_component` still recording
   the concrete tag for a human to classify at review time. This is a script
   fallback, not an escalation to `a2`: `a2` resolves node-level ambiguity
   (is this bean a screen or a utility), not widget-kind classification, and
   folding "what kind of widget is this" into its prompt would dilute that
   step's bounded, single-judgment shape for a question it wasn't scoped to
   answer. An unmapped widget is a known gap flagged for a human, not a
   guess an LLM should be asked to make.
3. **Auth scan** (`AUTHZ` nodes, `RESTRICTS` candidate edges, D14 — closed):
   parse `web.xml` `<security-constraint>` blocks and scan for
   `@RolesAllowed`/equivalent method- and class-level annotations. Each
   becomes one `AUTHZ` node with a `RESTRICTS` edge to the `SCR`/`SVC` it
   protects.
4. **EL expression scan** (`EL` nodes): parse every JSF component's
   `rendered`, `disabled`, `required`, and `value` attributes (plus any
   other attribute containing an EL expression `#{...}`) across every `SCR`.
   Record one `EL` node per distinct expression-attribute occurrence, even if
   the same expression string appears on multiple components (each
   occurrence has its own `attached_component_id`). This is the mechanism
   that guarantees JSF view-layer logic — invisible to JaCoCo — is captured
   before Phase B/C even start; see `docs/metrics.md` on why this can't be
   skipped.
5. **`faces-config.xml` parse** (`NAV`, `CFG` nodes): every
   `<navigation-rule>`/`<navigation-case>` becomes one `NAV` node; every
   `<managed-bean>` declaration becomes one `CFG` node, cross-linked to the
   `SCR`/`SVC` node it configures if resolvable.
6. **BPMN XML parse** (`PROC`, `TASK` nodes, `CONTAINS`/`GUARDS` candidate
   edges): every `<process>` becomes one `PROC`; every task/gateway element
   inside it becomes one `TASK` with a `CONTAINS` edge from its parent
   `PROC`. Gateway `condition_expr` attributes are extracted verbatim, same
   treatment as `EL` — flagged for lifting.
7. **DB catalog introspection** (`DB` nodes): connect to the booted Phase-0
   database (or its schema/DDL export) and enumerate tables, triggers, and
   stored procedures, including column definitions, types, nullability,
   primary/foreign keys for each table (`raw_facts.columns` — see above).
   Trigger and procedure bodies are recorded via `body_ref` since their
   source often isn't in the app's own version control — flag this
   explicitly if the DDL source can't be resolved to a `legacy_refs`
   file:line; an unresolvable body_ref fails `a5`. Trigger/procedure bodies
   are flagged for lifting the same way `EL` is — see `a6` below.
8. **Scheduler config scan** (`JOB` nodes): enumerate Quartz job
   definitions/triggers, `@Scheduled` annotated methods, or equivalent
   container timer config, producing one `JOB` node and one candidate
   `SCHEDULES` edge to the invoked `SVC` method's owning class per job.

## LLM steps in Phase A

Four judgment points exist in Phase A. Each is one bounded call over one
item (`DECISIONS.md`, principle 4):

- `a2-classify-ambiguous-node`: resolves a node the script couldn't classify
  with certainty (e.g. a `SCR` with no resolvable backing bean, or a
  candidate `SVC` that might actually be a cross-cutting utility rather than
  a screen-scoped service).
- `a3-lift-el-expression`: turns one raw `EL`/`condition_expr` node into a
  plain-language rule description and a candidate `RULE` node stub, with a
  `DERIVED_FROM` edge back to the source.
- `a4-confirm-edge-inference`: resolves one candidate edge that static
  analysis couldn't pin to exactly one target (dynamic dispatch, DI
  interfaces, reflection).
- `a6-lift-db-logic`: turns one DB trigger/stored-procedure body into a
  plain-language rule description and a candidate `RULE` node stub, with a
  `DERIVED_FROM` edge back to the `DB` node — the same mechanism as `a3`,
  applied to the other place JaCoCo can't see (D10, closed: trigger/procedure
  logic executes inside the DB engine, not the JVM, so it's exactly as
  coverage-invisible as EL and needs the identical lift + no-`c4`-coverage
  bookkeeping).

See `steps/a2-*.yaml`, `steps/a3-*.yaml`, `steps/a4-*.yaml`, `steps/a6-*.yaml`
for exact contracts, `schemas/` for their output shapes, and `prompts/` for
the prompt templates with few-shot examples.

Everything else new in this document — `AUTHZ` nodes, `VALIDATED_BY`/
`CONVERTED_BY`/`RESTRICTS` edges, the page/service structural skeletons — is
produced by extractors alone. No new LLM judgment was needed for any of it;
that was the point of routing D14 and the skeleton work through mechanical
extraction rather than an implementation-time model reading raw source (see
"Structural skeletons" below and `DECISIONS.md`).

## Structural skeletons: page & service

Whoever implements the replacement must never read legacy source directly:
`.xhtml` and `SVC` class bodies contain exactly the kind of unaudited,
untraceable content principle 2 already forbids handing to an LLM without
going through an extractor first. Applied to UI/API structure rather than
business logic,
that means the skeletons extracted above — `SCR.form_fields`/`field_groups`/
`data_tables`/`ajax_bindings`/`converters_validators`, and `SVC.public_methods`
with its param/return/scope facts — are not optional convenience data; they
are the *only* thing standing between "spec-driven" and quietly reopening a
side channel to raw source.

Two rules keep this from degrading into "hand it the file, but call the
file an artifact":

1. **Semantic structure, not markup.** Every extracted fact uses an
   abstracted vocabulary (`component_kind`, `field_groups`'s group labels),
   never the source library's tag names or attributes. The raw tag is kept
   only as a `legacy_component` trace-back field for auditability — an
   implementer keying off it instead of `component_kind` has bypassed the
   abstraction the same way reading the raw file would. This is what keeps
   the target stack from inheriting the source stack's shape by accident.
2. **Structural facts that cross the frontend/backend seam must be shared,
   not independently re-derived.** A `data_tables` entry's `pagination.
   page_size` is both an Angular table config and a query-parameter default
   on the REST API contract Phase C derives for that table's `row_source`
   method (see `docs/spec-pack.md`). Extracting it once, here, and threading
   it through both derivations is what prevents a page that paginates at 10
   from hitting an endpoint that doesn't.

What this framework does **not** attempt: pixel/visual fidelity — spacing,
component-library choice, styling — is deliberately not extracted. That is a
target-architecture decision belonging to whoever builds the replacement, not
a per-page structural fact about the legacy app. Nor does the framework check
whether a rebuild preserves the extracted structure; it has no standing to
(`DECISIONS.md`, "Structural fidelity is the implementer's call"). Extraction
here is unconditional either way, since it is mechanical and cheap regardless
of what anyone later does with it.

## Phase A exit gate — `a5-validate-inventory`

A deterministic validator, run after every extraction pass, checks:

1. Every edge's `from`/`to` resolve to a node with `status: "active"` in
   `nodes.jsonl`.
2. Every `legacy_refs` entry resolves to a real `file:line` (or, for `DB`
   trigger/proc `body_ref`, a real DDL/SQL source location).
3. No duplicate IDs.
4. No node remains with `extraction_confidence: "ambiguous"` — every
   ambiguous node has been routed through `a2`/`a3`/`a4` to a final
   `"certain"` or `"rejected"` state.
5. Every file type this application is known to contain (per Phase 0's
   inventory of its own repo layout) was scanned at least once — e.g. if the
   app has a `faces-config.xml`, at least one `NAV` or `CFG` node exists; if
   it has a `web.xml` with `<security-constraint>` blocks, at least one
   `AUTHZ` node exists.
6. Every active `SCR` node's `raw_facts` includes `form_fields`,
   `field_groups`, `data_tables` (possibly empty), `ajax_bindings` (possibly
   empty), and `converters_validators` (possibly empty) — not merely
   `form_fields` alone. Every active `SVC` node's `public_methods` entries
   include `params`, `return_type`, `action_bound`, and `nav_outcomes` (the
   last possibly empty). A node missing these is an incomplete skeleton
   extraction, not a node with nothing to report.

A graph that fails any of these does not proceed to Phase B. See
`validators/README.md` for the full validator contract.
