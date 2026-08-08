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
| `TPL` | Template / fragment | One layout template, included fragment, or composite component — a `.xhtml` that is composed *into* rather than navigated *to* | View/bean pair scanner (same DOM walk; see "Layout" below) |
| `SVC` | Service | A session bean, service class, DAO, or other non-view business-logic class | Java AST scanner |
| `RULE` | Rule | A business rule unit: either lifted from an `EL` node, or confirmed from a code-clone cluster (Phase B) | Never extracted directly in Phase A — created only via the `EL`-lift step (`a3`) or in Phase B; Phase A only creates the raw `EL` nodes it lifts from |
| `PROC` | BPMN process | One BPMN process definition | BPMN XML parser |
| `TASK` | BPMN task/gateway | One user task, service task, or gateway within a `PROC` | BPMN XML parser (child of a `PROC`) |
| `JOB` | Scheduled job | A Quartz job, `@Scheduled` method, or container-managed timer | Job/scheduler config scanner |
| `NAV` | Navigation rule | One `faces-config.xml` `<navigation-rule>`/`<navigation-case>` | `faces-config.xml` parser |
| `DB` | Database object | A table, trigger, or stored procedure (`kind` field distinguishes them) | DB catalog introspection |
| `EL` | Raw EL expression | One `rendered`/`disabled`/`required`/`value` (or other conditional) EL attribute on one JSF component, pre-interpretation | View DOM scanner |
| `CFG` | Config declaration | A `faces-config.xml` managed-bean declaration, or a `web.xml` filter/servlet relevant to reaching a screen | Config scanner |
| `AUTHZ` | Authorization constraint | One `web.xml` `<security-constraint>`, or one class/method-level `@RolesAllowed`/equivalent annotation | Auth scanner |
| `AUTHN` | Authentication configuration | The application's `<login-config>` (auth method, realm, form login/error pages) plus its declared `<security-role>` vocabulary — exactly one node per application | Auth scanner (see "The identity model" below) |

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
  `field_groups`, `data_tables`, `ajax_bindings`, `converters_validators`,
  `labels`, `messages` (also detailed below), and `layout_tree` +
  `layout_template` (see "Layout" below,
  `schemas/layout-tree.schema.json`). All of these are extracted
  unconditionally by the same DOM walk that already produces `form_fields` —
  there is no reason to gate mechanical extraction on anything; see
  "Structural skeletons" for what gates *enforcement* of some of this content
  downstream.
- `TPL`: `template_path`, `template_role` (`page-template` /
  `fragment` / `composite-component`), `defines_regions` (the named insertion
  points a composing view can fill), `declared_params` (for a composite
  component: each attribute it accepts, `{name, required, default}`),
  `layout_tree` (the template's own container tree, with its insertion points
  appearing as `region` containers), and `nav_menu` where the template renders
  one — see "The application shell" below.
- `SVC`: `fqcn`, `annotations` (e.g. `@Stateless`, `@Service`, scope
  annotations like `@RequestScoped`/`@ViewScoped`/`@SessionScoped`/
  `@ConversationScoped`), `public_methods` (list of `{name, params: [{name,
  type}], return_type, action_bound: bool, nav_outcomes: [string]}` —
  `action_bound` is true when some `SCR`'s `action=`/ajax `listener=`
  references this method; `nav_outcomes` lists the literal outcome strings
  the method can return, when it returns a JSF navigation outcome),
  `injected_deps` (list of other `SVC`/`DB` refs found by static analysis,
  used to seed candidate edges before `a4` confirms them), `constants` and
  `derivation_methods` (see "Value facts" below). Custom
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
  <DB table node id or null>, precision, scale, length, default,
  check_constraints, value_domain}`), mechanically read from the same catalog
  introspection pass — this is what the spec pack's data model ships, and
  what an implementer derives target entities from without ever reading DDL
  by hand. See "Value facts" below for why the last six fields are not
  optional detail.
- `EL`: `attribute` (`rendered`/`disabled`/`required`/`value`/other),
  `raw_expression` (verbatim EL string), `attached_component_id`,
  `attached_screen` (the `SCR` id — or the `TPL` id, for an expression in a
  template or composite component, which is where the shell's own
  role-conditional logic lives).
- `CFG`: `declaration_type`, `scope` (request/session/application/view),
  `raw_xml_excerpt`.
- `AUTHZ`: `constraint_type` (`web.xml`/`annotation`), `url_pattern` (if
  `web.xml`-sourced), `roles` (list of role names), `raw_excerpt`.
- `AUTHN`: `auth_method` (`FORM`/`BASIC`/`DIGEST`/`CLIENT-CERT`/`none`/
  `custom`), `realm_name`, `form_login_page`, `form_error_page`,
  `declared_roles` (every `<security-role>` name, which is the application's
  authoritative role vocabulary), `logout_mechanism` (the view or bean method
  that invalidates the session, when one is resolvable), and
  `credential_store` — one of `in_repo` (a table or config file inside the
  application, with a `legacy_refs` pointer to it), `external` (a container
  realm, LDAP, or SSO provider the repository does not contain), or `unknown`.
  See "The identity model" below.

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
| `DERIVED_FROM` | `RULE` → `EL`/`TASK`/`DB`/`SVC` | Traceability from a lifted rule back to its raw source expression, DB trigger/procedure body (`a6`), or derivation method (`a7`) — see below |
| `VALIDATED_BY` | `SCR`(component) → `SVC` | A component is checked by this custom `@FacesValidator` class |
| `CONVERTED_BY` | `SCR`(component) → `SVC` | A component's value is converted by this custom `@FacesConverter` class |
| `RESTRICTS` | `AUTHZ` → `SCR`/`SVC` | An authorization constraint gates access to this screen or method |
| `COMPOSES_INTO` | `SCR`/`TPL` → `TPL` | This view (or nested template) renders inside that template's frame |
| `INCLUDES` | `SCR`/`TPL` → `TPL` | This view pulls that fragment/composite component in at a position in its layout tree |
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
   extracts as ordinary `SVC` nodes (their logic runs as
   normal JVM bytecode, visible to JaCoCo like any other service class, so
   they need graph edges for traceability, not an EL-style lift). Record
   every method call to another such class as a candidate `INVOKES` edge and
   every JDBC/JPA/query-builder call touching a named table as a candidate
   `READS`/`WRITES` edge. This same walk records two value facts per class
   (see "Value facts" below): `constants` — every literal used in a
   comparison, a field initializer, or a constructor assignment, as
   `{name: <constant or field name, or null>, value, type, used_in: <method
   name>, legacy_refs}` — and `derivation_methods`, the list of methods that
   compute a value from domain fields without performing I/O, flagged for
   `a7` to lift. Both are mechanical: "is this an integer literal in a
   comparison" and "does this method body contain arithmetic and no call to
   a `READS`/`WRITES` target" are syntactic questions, not judgments.
   Candidate edges from static analysis (which cannot
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
   or custom class FQCN>, attributes, legacy_refs}` — for a custom `ref`,
   this pass also emits the corresponding `VALIDATED_BY`/`CONVERTED_BY` edge
   to the `SVC` node the Java AST scan produced for that class).
   `attributes` records every configured attribute on the tag verbatim
   (`pattern`, `locale`, `type`, `maxFractionDigits`, `minimum`/`maximum`,
   …): a built-in converter's behavior is determined entirely by these, so an
   entry recording only `ref` states that a field is formatted without
   stating how. This pass also produces `labels` — one entry per rendered
   static text, `{field_id: <the component it labels, or null for standalone
   text>, bundle_key: <message-bundle key, or null for an inline literal>,
   text: <the literal resolved for the application's default locale>,
   legacy_refs}` — and `messages`, the same shape for validation and feedback
   text (`h:message`/`h:messages` templates, and the `FacesMessage`
   summary/detail strings the backing bean adds). See "Value facts" below for
   why on-screen wording is extracted rather than left to be paraphrased. For
   every field or
   column, `component_kind` is an abstracted widget kind from a closed
   vocabulary (`text`, `multiline-text`, `single-select`, `multi-select`,
   `date`, `boolean-toggle`, `numeric`, `action`, `link`, `file-upload`,
   `display-only`), never the literal JSF/PrimeFaces
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

   Every `form_fields` and `data_tables` column entry additionally carries
   two placement facts, read from the source's own declarations:
   `label_position` (`top`/`left`/`right`/`none`/`unspecified`) and
   `width_class` (`full`/`half`/`third`/`quarter`/`fixed`/`unspecified`,
   with `declared_width` holding the verbatim source value when `fixed`).
   `unspecified` means the source declared nothing and the component
   library's default applies — an honest reading, not a guess at what that
   default was. These two facts plus container kind account for most of
   whether a rebuilt screen is recognizable as the same screen, and both are
   syntactic reads rather than judgments.
3. **Auth scan** (`AUTHZ` + `AUTHN` nodes, `RESTRICTS` candidate edges): parse `web.xml` `<security-constraint>` blocks and scan for
   `@RolesAllowed`/equivalent method- and class-level annotations. Each
   becomes one `AUTHZ` node with a `RESTRICTS` edge to the `SCR`/`SVC` it
   protects. The same pass emits exactly one `AUTHN` node for the
   application, from `<login-config>` and the `<security-role>` declarations
   — including `credential_store`, which the scanner decides mechanically: a
   resolvable table or config file inside the repository is `in_repo` (with
   the `legacy_refs` pointer to it), a container realm/LDAP/SSO reference
   naming nothing inside the repository is `external`, and anything else is
   `unknown`. An application with no `<login-config>` at all still gets an
   `AUTHN` node, with `auth_method: none` — "this application does not
   authenticate" is a fact the pack must state, not an absence a reader has
   to infer. See "The identity model" below.
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
   Read the catalog's *full* type descriptor, not its type name: `precision`,
   `scale`, and `length` are separate catalog fields, and a column recorded
   as `"BigDecimal"` with no scale is a column whose defining fact was
   dropped. Also record each column's `default`, its `check_constraints`
   verbatim, and its `value_domain` — the enumerated set of values the column
   may hold, where one is knowable: from a `CHECK ... IN (...)` constraint, an
   enum column type, a foreign key into a lookup table (in which case
   `value_domain` cites that table's rows as read from the booted database),
   or the constant set the Java scan found assigned to the property bound to
   this column. When no such evidence exists, `value_domain` is `null` — an
   honest "not knowable mechanically", which routes to the open-questions
   register (see "Value facts") rather than being left for a reader to
   assume.
   Trigger and procedure bodies are recorded via `body_ref` since their
   source often isn't in the app's own version control — flag this
   explicitly if the DDL source can't be resolved to a `legacy_refs`
   file:line; an unresolvable body_ref fails `a5`. Trigger/procedure bodies
   are flagged for lifting the same way `EL` is — see `a6` below.
8. **Scheduler config scan** (`JOB` nodes): enumerate Quartz job
   definitions/triggers, `@Scheduled` annotated methods, or equivalent
   container timer config, producing one `JOB` node and one candidate
   `SCHEDULES` edge to the invoked `SVC` method's owning class per job.
9. **Layout and template scan** (`SCR.layout_tree`,
   `SCR.layout_template`, `TPL` nodes, `COMPOSES_INTO`/`INCLUDES` edges):
   the same DOM walk that produces `form_fields` also records *where* each
   of them sits, and resolves the template composition every JSF view sits
   inside. See "Layout" below for the vocabulary, the composition rules, and
   the application shell.
10. **Screen reference capture** (`a8-capture-screen-references`, a separate
    step because it needs the *booted* application rather than the source
    tree): one screenshot per active `SCR` per significant state, plus an
    index. Non-normative and load-bearing on nothing — see "Visual
    reference" below.

## LLM steps in Phase A

Five judgment points exist in Phase A. Each is one bounded call over one
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
  applied to the other place JaCoCo can't see (trigger/procedure
  logic executes inside the DB engine, not the JVM, so it's exactly as
  coverage-invisible as EL and needs the identical lift + no-`c4`-coverage
  bookkeeping).
- `a7-lift-computation`: turns one derivation method flagged by the Java AST
  scan into an explicit formula and a candidate `RULE` node stub, with a
  `DERIVED_FROM` edge back to the `SVC` node. Same mechanism as `a3`/`a6`,
  applied to the place where logic *is* visible to JaCoCo but is not
  recoverable from observing outcomes — see "Value facts" below.

See `steps/a2-*.yaml`, `steps/a3-*.yaml`, `steps/a4-*.yaml`,
`steps/a6-*.yaml`, `steps/a7-*.yaml` for exact contracts, `schemas/` for
their output shapes, and `prompts/` for the prompt templates with few-shot
examples.

`a1`, `a5` and `a8` are script steps and appear here only for ordering: `a1`
first, `a8` after it (it needs the `SCR` list), `a5` last (it needs `a8`'s
report). The five judgment points above are per-item and order-free among
themselves.

Each of `a3`, `a6`, and `a7` may return `open_value_domain: true` on the
rule it lifts, meaning the rule references a set the expression does not
enumerate ("a SEPA country", "a supported currency"). That is not a lift
failure — the lift is correct and the set genuinely is not in the source. It
routes to the open-questions register (see "Value facts").

Everything else new in this document — `AUTHZ` and `TPL` nodes,
`VALIDATED_BY`/`CONVERTED_BY`/`RESTRICTS`/`COMPOSES_INTO`/`INCLUDES` edges,
the page/service structural skeletons, the layout tree, the application
shell, and the captured visual reference — is produced by extractors alone.
No new LLM judgment was needed for any of it; that was the point of routing
the auth scan, the skeleton work, and the layout work through mechanical
extraction
rather than an implementation-time model reading raw source (see "Structural
skeletons" and "Layout" below, and `DECISIONS.md`). `a8` is a script step for
the same reason: it captures what the application rendered, it does not
interpret it.

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

What this framework does **not** attempt: pixel/visual fidelity — spacing
values, colour, typography, component-library choice, theme — is deliberately
not extracted, and in a component-library application most of it is not in
the application's source to extract. Nor does the framework check whether a
rebuild preserves the extracted structure; it has no standing to
(`DECISIONS.md`, "Structural fidelity is the implementer's call"). Extraction
here is unconditional either way, since it is mechanical and cheap regardless
of what anyone later does with it.

**Layout is not on that list.** Whether a screen is a three-tab wizard or one
long scroll, whether eighteen fields sit in two columns or stack, which panel
disappears when a status changes — these are structural facts about the
legacy application, mechanically readable, and no more a target-architecture
decision than a data table's page size is. An earlier version of this
document folded them into "visual fidelity" and dropped them, and the first
pilot's rebuild consequently had no layout at all. See "Layout" next.

## Layout

`field_groups` states which fields belong together. It does not state how the
page is arranged, and the two are not the same fact: a flat list of groups
describes an eighteen-field form identically whether the original was a
three-tab wizard or a single scroll. `layout_tree` closes that, under exactly
the discipline the rest of this section already imposes — abstracted
vocabulary, raw tag as trace-back only, mechanical extraction, no LLM.

**The tree.** One `layout_tree` per active `SCR` and per `TPL`. Every node is
a container with a `container_kind` from a closed vocabulary (`grid`, `tabs`,
`accordion`, `wizard-steps`, `split`, `region`, …), carrying its label, its
column count and declared column widths, its colspan/rowspan, whether it is
collapsible and initially collapsed, which pane is initially selected, and its
children **in document order**.

**`schemas/layout-tree.schema.json` is the authority on the shape and on the
closed vocabulary** — the enum lives there and nowhere else, so adding a
container kind is one edit rather than three. Order is
the layout fact; a generator that sorts children has destroyed the thing it
was extracting. Leaves do not duplicate substance: a field leaf is a
`field_id` pointing into the same screen's `form_fields`, a table leaf points
into `data_tables`, a static-text leaf points into `labels`. The tree states
position; those arrays state what is positioned.

`custom` is the same honest fallback as `component_kind: "custom"`, and for
the same reason: an unclassifiable third-party container is a known gap
flagged for a human, not a question to route to `a2`, whose bounded shape is
node classification and not widget taxonomy.

**Conditional layout.** A container carries `render_guard`: the `EL` node —
or the `RULE` `a3` lifted from it — that decides whether it renders at all.
This is the fact the current extraction loses most quietly. A `rendered=`
attribute on a panel is already captured as an `EL` node with an
`attached_component_id`, and nothing anywhere states that what disappears
with it is an entire region of the page. `GUARDS` edges already point from
the `RULE` at the screen; `render_guard` is what says *at which part of it*.

**Composition.** A JSF view is rarely a whole page. It declares a template,
fills that template's named insertion points, and pulls in fragments and
composite components — and the application's actual frame, its banner, its
menu, its footer, lives in the template rather than in any view. A screen
skeleton with no composition facts describes a fragment while reading as a
description of a page.

So every `.xhtml` that is composed into rather than navigated to becomes a
`TPL` node — with `template_role` distinguishing a page template from an
included fragment from a composite component — and:

- `SCR.layout_template` records the template the view composes into and which
  region each part of its own tree fills, with a `COMPOSES_INTO` edge.
  `template_ref: null` is a finding, not a default: it states that this
  screen renders its own frame.
- An `include` leaf marks the *position* a fragment or composite component is
  pulled in at, with an `INCLUDES` edge and the parameters the including view
  passed. The included content is never inlined — it lives once, on the `TPL`
  node. Inlining would put one fact in two places, which is the one rule the
  spec pack is built on.
- A composite component's `declared_params` are extracted, because a
  component whose entire behavior is determined by its attributes states
  nothing without them.

**The application shell.** Where a `TPL` renders a navigation menu, that menu
is extracted into `nav_menu`: one entry per item, nested, each with its label
and bundle key, its target view id, the `SCR` node that resolves to (or
`null`), its `render_guard`, the roles it is visible to where an `AUTHZ`
constraint or an EL role test says so, and `legacy_refs`. The menu is how
every screen in the application is actually reached, it exists in exactly one
place in the source, and nothing else in the graph records it — `NAV` nodes
cover outcome-driven navigation from `faces-config.xml`, which is a different
mechanism and does not include the menu.

**Where the facts are read from.** From the view sources, with template
composition resolved statically — not from the rendered DOM of the booted
application. The rendered DOM is in one respect better evidence: it is what
actually appeared, with every composition and conditional already resolved.
It is rejected anyway, because a screen renders differently per user, per
role, and per row of seed data, so a DOM-sourced tree would be one
observation presented as the structure, and because `a1` must stay runnable
against a source tree alone. The cost is real and is paid deliberately: a
statically-resolved tree can be wrong about a dynamic composition, which is
what the visual reference below exists for a reviewer to catch.

**`field_groups` becomes a flattening of the tree.** It is kept — downstream
consumers already read it, and a coarse "which fields belong together" list
is genuinely easier to query than a tree — but it is now *defined as* the
flattening: one entry per labelled container in `layout_tree`, in document
order, holding the field ids beneath it. It states nothing the tree doesn't,
and `layout_tree_complete` checks the two agree. Two independently-authored
representations of one fact is what the spec pack's structural rule exists to
prevent, and the rule applies inside a node as much as across the pack.

**One producer.** `layout_tree` is written by `a1` and by nothing else. A
second step refining it from runtime observation would give the pack two
copies of one fact and no way to say which is authoritative — the failure the
original/projection rule exists to prevent.

## Visual reference

`a8-capture-screen-references` drives the booted Phase-0 application and
captures one screenshot per active `SCR`, plus one per significant state a
screen has (a validation-failure state, a role-dependent variant), writing
`reference/screenshots/` and an index into the pack.

It is **non-normative and load-bearing on nothing**: no gate reads a
screenshot, no projection derives from one, and a consumer that ignores them
loses nothing the pack asserts. That is the point of the layering — if
dropping the screenshots left an implementer unable to build the page, the
defect would be in `layout_tree`, not in the screenshots.

What they are for is the two things a JSON tree cannot do. A reviewer can
check a captured screen against the legacy application in seconds and catch a
`layout_tree` that resolved a dynamic composition wrongly. And an implementer
gets the density, proportion, and visual weight that the framework
deliberately does not extract — as a reference a human implements against,
never as something the pack claims.

Two constraints. A screen the seeded environment cannot reach is recorded
with a reason rather than silently missing, the same bookkeeping discipline
as `not_sampled` in the triage log. And screenshots of a sanitized production
snapshot carry whatever that snapshot carries: capture against synthetic
fixtures, or scrub, before a pack leaves the environment its data is allowed
in.

## Value facts

The structural skeletons above answer "what is on this page" and "what
methods does this class expose." They do not answer "what values are legal
here," "what exactly does this compute," or "what does this screen actually
say" — and an implementer cannot derive any of those from observing
behavior alone. A scenario asserting that a total is `1234.56` does not
reveal whether the underlying column has scale 2 or scale 6, nor whether the
rounding is HALF_UP or FLOOR. It constrains the answer; it does not state
it.

So the extractors capture five classes of value fact, all mechanically, all
unconditionally:

| Fact | Where | Without it, the implementer must |
|---|---|---|
| `precision` / `scale` / `length` / `default` | `DB.columns` | guess a numeric type's exactness — and an ORM's silent default will differ from the legacy column |
| `check_constraints` / `value_domain` | `DB.columns` | infer a status/type enum's members from whichever ones the scenarios happen to exercise |
| `constants` | `SVC` | re-invent thresholds, limits, and seeded figures that appear only as literals in a constructor or comparison |
| converter/validator `attributes` | `SCR.converters_validators` | pick a format pattern and locale, and be wrong in a way no scenario catches until a user in another locale sees it |
| `labels` / `messages` | `SCR` | transcribe on-screen wording from a paraphrase, or invent it |

And one class of fact needs a lift rather than an extraction:

**Formulas** (`a7-lift-computation`). A method that computes a value from
domain fields — a line total, a VAT-inclusive gross, a proration, a due date
— is ordinary JVM bytecode, so `c4`'s coverage oracle sees it and the
framework's completeness argument holds. But completeness is not the same as
*recoverability*: knowing every branch was exercised does not tell an
implementer the arithmetic, the operand order, the rounding mode, or where
an unrounded intermediate is used deliberately. Acceptance criteria pin down
sample points; the formula is what the implementer actually has to rebuild.
So each flagged derivation method is lifted into a `RULE` stating the formula
explicitly, exactly as an EL condition or a trigger body is.

This is the one place the framework lifts something JaCoCo *can* see, and
that exception is deliberate: the reason for the other lifts is coverage
invisibility, and the reason for this one is that a formula is not
observable at the resolution the scenarios sample it at.

**Not knowable is a recorded state, not a blank.** A `value_domain` of
`null`, a lift returning `open_value_domain: true`, and a `credential_store`
of `external` are all real findings. Each is seeded into the pack's
open-questions register (`docs/spec-pack.md`, `triage/open-questions.jsonl`)
so it reaches the implementer as a stated question with a place to record
the answer — rather than as silence the implementer discovers by hitting it.

## The identity model

`AUTHZ` nodes state who may reach what. They do not state who *exists*: the
role vocabulary, how a user authenticates, or whether the application's
credentials live inside the repository at all. In a container-managed JSF
application they usually do not — the realm is WildFly's, or the corporate
LDAP's — and the extractors will correctly find nothing, because there is
nothing in the source to find.

The failure mode is that "the extractors found nothing" and "there is
nothing to find" are indistinguishable to whoever reads the pack, which is
the same confusion Phase 0 exists to prevent for the application as a whole.
So the `AUTHN` node states the absence positively: `credential_store:
external` with the realm name, plus the `declared_roles` vocabulary, plus
the form login/error/logout pages that a page-based application encodes its
authentication flow in and a JSON API has no equivalent for.

An implementer still has to build an identity store — that work is real and
this framework does not do it. What changes is that they are answering a
question the pack asked, against a stated role vocabulary and a stated
authentication mechanism, rather than discovering mid-build that the subject
was never covered.

## Phase A exit gate — `a5-validate-inventory`

A deterministic validator, run after every extraction pass. It runs these
checks, and a graph failing any of them does not proceed to Phase B:

| Check | Answers |
|---|---|
| `edge_endpoints_resolve` | does every edge point at two live nodes |
| `legacy_refs_resolve` | does every citation resolve to real source |
| `no_duplicate_ids` | is every id unique among active nodes |
| `no_remaining_ambiguous_nodes` | did every ambiguous node reach `a2`/`a3`/`a4` |
| `known_file_types_scanned` | did any extractor silently no-op |
| `structural_skeleton_complete` | is every screen and service skeleton whole |
| `value_facts_complete` | is every value fact present, and every flagged formula lifted |
| `layout_tree_complete` | does every screen have a layout, with every field placed once |
| `screen_reference_captured` | is every screen photographed or accounted for |
| `identity_model_present` | does the application state exactly one identity model |

**`validators/README.md` is the authority on what each check means** — what it
reads, exactly what it asserts, its output shape, and what to do when it
fails. This table is a pointer, deliberately: an earlier version of this
document restated all ten in full, and the restatement drifted out of sync
with both the validator contracts and `a5`'s own schema, which listed five
checks against a nine-item list. One fact, one place, is the rule the spec
pack is built on; it applies to this repository's own documentation too.

`steps/a5-validate-inventory.yaml` is the authority on *when* the checks run.
