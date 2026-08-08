# The Spec Pack

The spec pack is what this framework produces. Everything else — the phases,
the steps, the validators — exists to build it.

It is a directory of files describing one legacy application completely
enough that a team (or an agent) can rebuild that application without ever
opening the legacy source. Implementing the rebuild is **not** part of this
framework. Handing over a complete, validated, traceable description of what
to rebuild is.

## Who reads it

| Reader | Uses |
|---|---|
| The implementer (team or agent) | All of it — this is the brief |
| A business reviewer | `behaviors/` — the specs, in observable-behavior language |
| An auditor | The traceability chain: every claim links to a legacy `file:line` |

## The one structural rule

Some files in the pack are **originals**: the only place their content
exists. Others are **projections**: convenient re-shapings of content that
lives in an original.

A projection is never edited. It is regenerated from its source, and the
completeness gate proves it regenerates byte-identically. This is the same
discipline `c3`'s rendered tests already follow (`rendering_idempotent`,
`validators/README.md`) — applied to the whole pack.

The reason: a pack with two editable copies of the same fact will eventually
hold two different facts, and nothing will say which is right.

Two files are originals the pipeline writes and the implementer then appends
to: `behaviors/progress.jsonl` (seeded empty) and
`triage/open-questions.jsonl` (seeded with what the pipeline could not
answer). Both are append-only, and the manifest records them as
`mutable_seed` and `seeded_append_only` respectively — hashed at handover
where there is anything to hash, and excluded from the regeneration check,
because divergence after handover is what they are for.

Two further manifest kinds sit outside the original/projection pair because
they are neither. `reference` (the screenshots) is a captured artifact
nothing derives from: hashed for tamper-evidence, excluded from the
regeneration check because re-photographing a page does not reproduce its
bytes and never needed to. `carried_input` (`handover/target-conventions.yaml`)
is a human-authored file copied in verbatim for the implementer. Neither can
contradict an original, because neither is a source of any fact the pack
asserts.

## Layout

```
spec-pack/
  README.md                      generated index — start here
  manifest.json                  every file, its kind, its source, its hash

  behaviors/
    order.json                   dependency order and waves           [projection]
    order.mmd                    the same, drawn — cycles visible     [projection]
    ownership.json               who owns each shared node            [projection]
    step-index.json              shared step text and its owner       [projection]
    scenario-bindings.json       where each scenario is observable    [projection]
    progress.jsonl               implementation progress  [mutable — yours, starts empty]
    BHV-0142/
      BHV-0142.md                the spec (carries its own diagram)   [original]
      bundle.json                everything BHV-0142 covers, inlined  [projection]
      flow.mmd                   this behavior's screen flow          [projection]
      tests/                     rendered Gherkin / JUnit / Playwright [projection]

  inventory/
    nodes.jsonl                  the legacy graph    [original]
    edges.jsonl                                      [original]

  views/
    pages.json                   page skeletons + layout trees        [projection]
    services.json                bean/service method surfaces         [projection]
    templates.json               page frames, fragments, the menu     [projection]
    menu.mmd                     the shell, drawn — who reaches what  [projection]
    wireframes/
      SCR-####.txt               each screen, drawn                   [projection]
      TPL-####.txt               each template frame, drawn           [projection]

  reference/
    screenshots/
      index.json                 what was captured, and what wasn't   [projection]
      SCR-####--<state>.png      the legacy screen, as it rendered    [reference]

  handover/
    target-conventions.yaml      api, identity, process, ui     [carried input]

  api/
    openapi.yaml                 the target REST contract, merged     [derived]
    fragments/                   one fragment per source surface      [derived]

  process/
    *.bpmn                       byte-identical copies of the legacy files
    bindings.json                what each task/gateway references    [projection]

  data/
    schema.json                  tables, columns, keys, triggers      [projection]
    erd.mmd                      the data model, drawn                [projection]
    fixture-order.json           safe seed/teardown order             [projection]

  auth/
    constraints.json             who may reach what                   [projection]
    identity.json                who exists, and where they live      [projection]

  triage/
    triage-log.jsonl             every uncovered branch's verdict     [original]
    open-questions.jsonl         every unanswered spec question       [original, append-only]

  validation/
    rule-outcomes.jsonl          did the legacy app agree with each lift  [original]
```

## What each part is

**`behaviors/`** — One directory per `BHV-####`. The `.md` is the canonical
spec (`templates/BHV-template.md`): scenarios, decision tables, coverage
triage summary. `bundle.json` inlines everything that behavior's `COVERS`
edges point at — its screens' page skeletons, its services' method surfaces,
its rules, its tables — so an implementer working one behavior does not have
to query the graph to assemble its context. Only behaviors that passed `c6`
appear here.

**`behaviors/order.json`** — What depends on what, and therefore what can be
built in parallel. See "Working the pack" below.

**`behaviors/progress.jsonl`** — Where implementation progress is recorded.
Ships empty. See "Working the pack" below.

**`inventory/`** — The full node/edge graph from Phase A. This is the
traceability index: it is how any claim in any spec is proven to correspond
to real legacy code. It is not a decomposition of the work — behaviors are
(`DECISIONS.md`, principle 1).

**`views/pages.json`** — For each screen: its field groups, its fields
(each with an abstracted `component_kind`, never a JSF tag name), its data
tables with columns and pagination, its ajax wiring, its converters and
validators, and its **layout tree** — the container nesting, in document
order, with column counts, tabs, accordions, collapse state, declared widths,
and the rule that conditions each container's rendering. This is what
replaces "go read the `.xhtml`."

**`views/services.json`** — For each backing bean and service class: its
public method signatures, parameter and return types, scope, which methods
are bound to a screen action, and what navigation outcomes each can return.
This is what replaces "go read the bean."

**`views/templates.json`** — The page frames. A JSF view is rarely a whole
page: it composes into a template that owns the banner, the menu, and the
footer, and pulls in fragments and composite components. This file projects
every `TPL` node — each template's own layout tree, the regions it defines,
the parameters a composite component accepts, and the application's
navigation menu with each item's destination, its guard, and the roles it is
visible to. Without it the pack describes fifty fragments while reading as a
description of fifty pages.

**`views/wireframes/`** — Each screen and template drawn as fixed-width text
from its layout tree, by the deterministic mapping in
`templates/renderers/wireframe.md`. A projection in the strict sense: it
holds no fact `pages.json` doesn't, and anything true in a wireframe and
absent from the tree is a renderer bug.

It exists because the tree carries the layout correctly and buries it. A
reviewer checking the extraction against the running legacy screen, and an
implementer or agent reading text rather than images, both need it arranged
so the page can be seen at a glance rather than reassembled mentally from
nesting.

**`reference/screenshots/`** — Each screen as it actually rendered in the
booted Phase-0 application, captured by `a8`, one image per significant
state, with an index recording what was captured and — as importantly — which
screens were not and why.

These are **non-normative**. No gate parses an image, no projection derives
from one, nothing in the pack is checked against one, and a consumer that
cannot read images loses nothing the pack asserts. That property is
deliberate: if dropping the screenshots left an implementer unable to build
a page, the defect would be in the layout tree, not here. What they carry is
what the framework does not extract and does not claim — density,
proportion, visual weight — as a reference a human implements against, plus
the only practical way for a reviewer to catch a layout tree that resolved a
dynamic composition wrongly.

**`handover/target-conventions.yaml`** — The application's target decisions,
carried in verbatim and hashed. Its `api:` and `identity:` sections are what
the API contract was derived from, so the pack could not exist without them.
Its `process:` (which engine runs the carried-over `.bpmn` files) and `ui:`
(how the extracted layout maps onto the component library) sections are read
by nothing: the framework can carry those decisions and cannot apply them,
because applying them is implementation. They ship anyway, because each is
otherwise made fifty times by whoever reaches each process and each screen
first. `manifest.json` records per-section which were authored, so an empty
one is a statement rather than a silence.

**`api/`** — The target REST contract. See the next section; this is the one
part of the pack that describes the *new* system rather than the old one.

**`process/`** — The BPMN process definitions, copied byte-for-byte from the
legacy repository. Not regenerated, not reformatted, not normalized: the
manifest records a hash of each, and the completeness gate checks it still
matches the source file. `bindings.json` is the work list that a verbatim
copy hides — for each service task, listener, and gateway condition, which
legacy class or expression it references, and which inventory node that
resolves to. Carrying the file over is easy; rewiring what it points at is
the actual work, and it needs to be enumerated rather than discovered late.

Shipping the files byte-identically rests on a premise: that something in the
target can execute them. **The framework does not decide what, and its
silence on the point has been expensive.** The first pilot's implementing
agent removed the process engine outright and reimplemented the orchestration
by hand — which is a legitimate option, arrived at by deletion rather than by
decision, leaving the carried-over `.bpmn` files as decoration and the lifted
gateway conditions to be rediscovered.

So every active `PROC` node now seeds a **blocking** open question, answered
in `target-conventions.yaml`'s `process:` section: which engine runs these
(the framework recommends an embedded Camunda-7-compatible engine for a
Camunda 7 legacy app, since that is the only choice under which the
byte-identical files stay runnable — but it recommends, it does not decide),
and what happens to the files (`run-as-shipped`, `port`, or `reimplement`).
Choosing `reimplement` is fine and changes what `bindings.json` is: no longer
a rewiring list, but the enumeration of everything you must now write and
test yourself.

**`data/schema.json`** — Tables with columns, types, nullability, primary and
foreign keys, and the value facts an implementer cannot derive from observing
behavior: numeric precision and scale, string length, defaults, check
constraints, and each column's enumerated value domain where one is knowable
(`docs/phase-a-inventory.md`, "Value facts"). Also triggers and stored
procedures with pointers to their source. Trigger and procedure *logic* is
not here — it was lifted into `RULE` nodes by `a3-lift-rule` and appears in whichever
behavior covers it, because it is business logic that happens to live in the
database.

**The Mermaid diagrams** — `data/erd.mmd`, `views/menu.mmd`,
`behaviors/order.mmd`, and one `flow.mmd` per behavior, plus the
`neighborhood_diagram` already embedded in every `BHV-####.md`. All are
projections rendered by `templates/renderers/mermaid.md`; each holds no fact its
source doesn't, and anything true in a diagram and absent from the source JSON
is a renderer bug.

Each answers a question the text answers less well:

| Diagram | Question |
|---|---|
| `data/erd.mmd` | what is the data model — with precision, scale and value domains on the attributes, since those are exactly what an ORM's default silently overrides |
| `views/menu.mmd` | how does a user reach a screen, and **who is allowed to** — dotted, role-labelled edges. `auth/constraints.json` says it in text; this is the only place it is visible at a glance |
| `behaviors/order.mmd` | what can be built in parallel, and **where the cycles are**. `order.json` reports cycles and never breaks them; a cycle is hard to see in JSON and immediate in a picture |
| `behaviors/BHV-####/flow.mmd` | where this behavior's screens lead, including one hop into screens other behaviors own |

Two things they deliberately are not. There is **no whole-inventory diagram**
— at thousands of nodes it is illegible and past Mermaid's practical rendering
size, and a whole-graph question is a query against `graph_store`. And the
screen flow is scoped **per behavior** rather than application-wide, for the
same reason: a 200-screen hairball answers nothing. Every family declares its
node cap and, when a cap truncates, says so in the diagram and in the manifest
— a diagram that silently dropped half its graph is worse than none, because it
reads as complete.

**`data/fixture-order.json`** — A topological ordering of the tables by
foreign key, with the insert order and the reverse delete order. Derived
entirely from `schema.json`'s keys; it seeds nothing and contains no data.
It exists because every implementer of every behavior writes fixtures
against the same graph, and a delete-and-reseed in the wrong order fails on
referential integrity in a way that presents as an unrelated flaky test.
The pack already holds the facts that answer it.

**`auth/constraints.json`** — Every `web.xml` security constraint and every
`@RolesAllowed`-style annotation, with what it restricts.

**`auth/identity.json`** — The application's authentication mechanism, its
realm, its form login/error/logout pages, its declared role vocabulary, and
where its credentials live — including, in the common case, the positive
statement that they live outside the repository entirely. Projected from the
`AUTHN` node. `constraints.json` says who may reach what; without this, the
pack never says who *exists*, and a container-managed application's identity
model reads as an absence rather than as a finding. See
`docs/phase-a-inventory.md`, "The identity model."

**`triage/triage-log.jsonl`** — Every branch the derived tests did not cover,
and its verdict: needs a scenario, dead code (do not migrate), or defensive
and justified. This is the evidence that the specs are complete rather than
merely self-consistent. It is a deliverable, not a work artifact — a reviewer
reads it whole, because the patterns across entries are what expose a spec
that rationalized away its own gaps.

**`triage/open-questions.jsonl`** — See "The open-questions register" below.

**`validation/rule-outcomes.jsonl`** — For every lifted `RULE` in the pack,
whether Phase D drove the legacy application through a browser and found that
it actually behaves as the lift says: `validated`, `contradicted`,
`not_exercised`, or `out_of_scope`.

This is the only file in the pack that says any part of the spec is *true*
rather than complete. Everything else here proves coverage; a lifted EL rule
has no coverage path at all — at `legacy_test_seam: service` no page is
rendered, so the rule is extracted, lifted, turned into acceptance criteria,
rendered into a test, and executed by nothing. This file is where that stops
being invisible.

A pack may legitimately ship with every outcome `out_of_scope`
(`spec_validation_scope: none`) — validating the spec is an investment
decision the framework does not make. What it may not do is ship without the
file, because `rules_total` against `out_of_scope` is the number that says how
much of the framework's central claim went unchecked. A `contradicted` outcome
cannot ship at all: it means the legacy application disagreed with the spec,
and the pack would be stating a falsehood. See
`docs/phase-d-spec-validation.md`.

## The API contract

This is the only derived design in the pack, and it earns its place for a
reason the other parts don't share: **it is consumed by two sides that must
agree.** If the Angular client and the Spring backend each derive their own
idea of the endpoint from the same specs, they will differ, and the
difference will surface at integration time. Deriving it once, here, and
generating both sides from it removes that failure mode entirely.

It is derivable rather than invented because the inputs already exist:

| Input | Supplies |
|---|---|
| `views/services.json` | Operation names, parameters, return shapes |
| `data/schema.json` | Request/response object fields and types |
| `views/pages.json` | Pagination defaults, which fields a screen actually needs |
| `auth/constraints.json` | Which endpoints require which roles |

What it cannot derive is **convention**: whether a resource is
`/api/v1/leave-requests` or `/leaveRequest`, what an error body looks like,
how pagination is expressed, how versioning works. Those are decisions about
your target system, and this framework does not make them. They come from a
human-authored `target-conventions.yaml`, written once per application — the
same status as `framework.yaml`. No conventions file, no API contract; the
step refuses rather than guessing.

The output form is OpenAPI: one fragment per source method, merged by script
into `api/openapi.yaml`. That form is chosen because standard codegen turns
it into Spring controller interfaces and an Angular HTTP client. The
implementer writes logic behind an interface generated independently of
them, so a mismatch is a compile error rather than a runtime surprise. That
is the closest thing the implementation side has to the role `c4`'s coverage
oracle plays for behavior.

Scope line: this specifies the **surface** — paths, verbs, request and
response shapes, status codes. Not the logic behind it. The logic is what
the behavior specs are for.

The surface is the whole client-visible surface, not the subset shaped like
a service method. A legacy JSF screen that renders from bean properties, a
navigation menu, a converter that formats a value for display — none is a
public service method, and each is something the replacement's client must
get from somewhere. `c7` therefore derives from `SCR` and `NAV` nodes as
well as `SVC` methods, and records a verdict for every one of them: an
operation, or `client_side_only` (the replacement needs no round-trip for
this), or unmapped-with-a-reason routed to `c8`. A verdict of
`client_side_only` is an answer. Silence is what produces two implementers
inventing two different endpoints for the same screen.

## Where each scenario is observable

`behaviors/scenario-bindings.json` records, for every scenario in the pack,
where the target system can observe what that scenario asserts: through a
named operation, in the client with no round-trip, only against the domain
layer, or — honestly — nowhere.

This exists because a behavior spec describes a page-based application and
the replacement has no pages. "The login page is served inline at HTTP 200,"
"the browser navigates via a plain href," "`getAmount()` returns the
unrounded figure" are all true, well-evidenced statements about the legacy
system, and none of them can be checked against a JSON API without a
decision first. Made at implementation time, those decisions are made once
per behavior by whoever arrives first, in a repository this framework never
sees. Made here, they are made once, against the derived contract and the
application's own translation policy.

Two rules keep it honest. A binding never rewrites a scenario — the scenario
remains a statement about the legacy system, and `c4` still runs it against
the legacy system. And a binding that adapts rather than preserves the
legacy meaning says so (`preserves_legacy_meaning: false`), which seeds an
open-questions entry, because an adaptation nobody recorded is
indistinguishable from an equivalence.

The bindings live outside the `BHV-####.md` documents on purpose. A behavior
document describes the legacy application; a binding is a target-side fact
derived from `target-conventions.yaml` and invalidated when it changes.
Re-deriving the API contract must not rewrite fifty canonical specs.

## The open-questions register

`triage/open-questions.jsonl` is the pack's record of what the legacy
application does not answer. Same discipline as the triage log — ids
assigned once and never renumbered, entries appended and never rewritten —
and a different subject: the triage log registers uncovered legacy
*branches*, this registers unanswered *specification questions*. Neither
substitutes for the other.

The pipeline seeds it at assembly from states its own steps already record:

| Seeded from | Reads as |
|---|---|
| A column whose `value_domain` is `null` | which values are legal here is not knowable from the catalog |
| A lift with `open_value_domain: true` | this rule tests membership of a set the source never enumerates |
| An `AUTHN` node with `credential_store: external` | the credentials are not in this repository, and something must replace them |
| A `web.xml` `AUTHZ` constraint with no operation to land on | this URL pattern protected a page the target does not have |
| An active `PROC` node with no chosen target engine | **blocking** — the pack ships these `.bpmn` files to be run, and nothing says what runs them |
| A lifted `RULE` Phase D left unvalidated | this rule is a claim no step in the pipeline checked |
| A scenario bound `not-observable`, or `preserves_legacy_meaning: false` | this assertion has no target equivalent, or has an adapted one |
| A `c8` resolution — an endpoint decided by judgment rather than by rule | this part of the contract was a call, not a derivation |
| A `dead_code` verdict overturned in Step 5b review | the pipeline classified this wrongly once |

None of these is a defect. Each is a place where a competent implementer
will otherwise stop, decide something reasonable, and continue — and the
deciding is fine. What is not fine is that the decision leaves no trace, so
the next behavior decides it again, differently, and nobody can later answer
which decisions the delivered system actually rests on.

An entry states the question so it can be answered without re-deriving the
context, cites the evidence that the gap is real, and records the assumption
the pipeline proceeded under, if it proceeded. `blocks: true` marks the ones
that must be answered before the affected behavior can be built at all —
those are what a handover conversation is actually about; the rest are
recorded so they are not rediscovered one at a time.

After handover the implementer appends resolutions. The pipeline never
writes `resolution`, and the completeness gate checks only the entries the
pipeline seeded — the same posture as `progress.jsonl`, for the same reason:
this framework defines the file's shape and does not own its contents.

## Working the pack

The pack ships two files for coordinating the rebuild. Together they answer
"what can I start now?" without this framework saying anything about how your
team or your agents should work.

**`behaviors/order.json` — what depends on what.** Derived from the inventory
graph: behavior X depends on behavior Y when a node X covers has an edge to a
node Y covers. Every dependency cites the inventory edges that produced it, so
it is auditable rather than asserted. Each behavior gets a `wave` — everything
in one wave can be built concurrently once the waves below it are done — and a
`dependents_count`, which is how you order work *within* a wave, since the
graph itself doesn't.

Cycles are reported, never broken. A legacy application will have them, and
choosing where to cut one is a design decision this framework has no business
making. Cycle members share a `cycle_group` and are handled as a unit.

This file is a projection: regenerate it and you get the same bytes. It holds
no state.

**`behaviors/ownership.json` — who builds each shared thing.** `order.json`
answers what can be started; it does not answer who owns a node that three
behaviors all cover. Left unanswered, each of the three implements it, and
the duplication surfaces when two of the implementations disagree — a
formula recomputed slightly differently, a validation rule with a different
edge case. This file names one owner per shared node, chosen mechanically
(earliest wave, ties by lowest id) and recorded with the rule that chose it,
plus the lifted formula or rule statement where there is one, so a reusing
behavior can tell whether what it needs already exists without reading the
owner's code. Nodes covered by exactly one behavior are omitted — their
ownership was never in question.

**`behaviors/step-index.json` — who owns each shared step definition.** The
same problem one layer down, and one the rendered tests create themselves.
Cucumber-family harnesses match step text globally rather than per feature
file, so two behaviors whose scenarios both begin "a signed-in user" resolve
to one definition. That is the mechanism working correctly — it is why
rendered step text is not namespaced per behavior. What goes wrong is that
the sharing is invisible until someone writes the second definition and the
glue registry throws, at which point both behaviors are finished and one has
to be unpicked. This index lists every distinct rendered step text, every
behavior that renders it, and the one behavior whose implementer defines it.

Both are projections, holding no state, regenerable byte-identically.

**`behaviors/progress.jsonl` — what has actually been done.** Ships empty. It
is the only mutable file in the pack: excluded from hashing, from the
regeneration check, and from the completeness gate. This framework defines its
shape and writes nothing into it.

It is an append-only log rather than a mutable record for one reason: several
agents appending is safe, while several agents rewriting a shared JSON file
silently loses claims. Current state is derived by replaying entries in order
— the same discipline `nodes.jsonl` already follows.

For multiple implementers working in parallel, the primitives are:

| Need | Mechanism |
|---|---|
| Two agents must not take the same behavior | `claimed` entry carrying `actor` |
| A crashed agent must not block a behavior forever | `lease_expires`; an expired claim replays as released |
| Know what is workable right now | Behaviors whose `depends_on` are all `done`, minus those holding a live claim |
| Nothing disappears quietly | `abandoned` and `blocked` both require a `reason` |

**Deliberately not here:** CI configuration, branching model, review gates,
sprint structure, task templates, agent prompts. Those are decisions about
your team and your stack. The pack gives you the work items, their real
dependencies, and a safe place to record state; the process on top is yours.

## What the pack deliberately does not contain

Legacy source, target architecture, migrated data, visual fidelity as stated
fact, and any check that a rebuild matched its source.

**`DECISIONS.md`, "explicitly out of scope," is the authority on each and on
why.** It is not restated here: an earlier version of this section restated
all five, and the two copies were edited separately in the same session and
came out worded differently — which is precisely the failure the pack's own
one-fact-one-place rule exists to prevent, occurring in the document that
states the rule.

Two points specific to the pack rather than to scope: the API and UI
*conventions* are an input to the pack rather than an output of it, and
layout is **not** covered by the visual-fidelity exclusion — it used to be,
and that was the mistake `DECISIONS.md`'s layout entry records.

## Completeness gate — `spec_pack_complete`

The pack is not handed over until every one of these passes:

| Check | Answers |
|---|---|
| `inventory_coverage_complete` | is every active node covered by a behavior, or recorded out of scope with a reason |
| `projection_regenerates_identically` | does every projection reproduce byte-for-byte from its original |
| `bpmn_copied_verbatim` | is every `.bpmn` still identical to its legacy source |
| `no_legacy_source_in_pack` | did any legacy source file get carried in |
| `endpoint_contract_complete` | does every service method, screen and navigation rule have an endpoint, a `client_side_only` verdict, or a stated reason for neither |
| `openapi_merge_consistent` | did the fragments merge without collision or dangling `$ref` |
| `rendered_artifacts_parse` | does every rendered test actually load under a real parser |
| `rendered_scenario_titles_unique` | can two scenarios collide in a harness's report |
| `step_text_is_plain_text` | did Markdown emphasis survive into a step a harness compiles as a regex |
| `step_index_complete` | is every shared step definition attributed to one owner |
| `scenario_surface_bound` | does every scenario say where the target observes it |
| `value_facts_complete` | is every value fact present on every node that must carry it |
| `layout_tree_complete` | does every screen have a layout with every field placed once |
| `wireframe_renders_for_every_screen` | is there a readable wireframe per screen and template |
| `mermaid_diagrams_render` | does every diagram parse, resolve its ids, and declare any cap that truncated it |
| `screen_reference_captured` | is every screen photographed or accounted for |
| `identity_model_present` | does the pack state exactly one identity model |
| `open_questions_well_formed` | is every seeded question resolvable, with its subjects present |
| `dependency_order_derivable` | does the build order follow from real edges, with cycles reported |
| `spec_validation_recorded` | does every lifted rule have an outcome, and did none of them contradict the legacy application |
| `spec_pack_complete` | did every behavior pass `c6`; does every id resolve within the pack; does the manifest match what is on disk; is `handover/target-conventions.yaml` present with its required sections and its recorded sections accounted for; and do the manifest's `spec_validation` counts match `validation/rule-outcomes.jsonl` |

**`validators/README.md` is the authority on what each check means** — what it
reads, exactly what it asserts, and what to do when it fails. This table is a
pointer, deliberately: an earlier version restated all of it in prose, and the
prose drifted from the contracts it was restating. The pack's own rule is one
fact in one place; it applies to this repository's documentation too.

Three things the gate deliberately does **not** require. Open questions do not
have to be *answered* — a pack ships with them by design, and what the gate
prevents is shipping one nobody wrote down. A `process:` or `ui:` section of
`target-conventions.yaml` may be empty; the gate requires only that the
manifest records which, so "nobody decided what runs these processes" is a
statement rather than a silence. And the spec does not have to have been
*validated*: a pack may ship with every rule `out_of_scope`. What it may not do
is ship without saying so, or ship a rule the legacy application contradicted.

The steps that produce and check all this: `a8` (screen reference capture),
`c3b` (rendered-artifact verification), `c7` (endpoint derivation), `c7b`
(scenario surface binding), `c8` (resolve what the rules couldn't map), `d1`
(spec validation against the running legacy app), and `c9` (assemble, render
wireframes, seed the register, gate).

A pack failing any of these is incomplete, not "mostly done." The value of
the whole method rests on the claim that this description is complete; a
partial pack shipped as a complete one is the one failure that discredits
everything upstream of it.
