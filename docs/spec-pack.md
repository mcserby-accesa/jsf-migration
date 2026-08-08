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
    ownership.json               who owns each shared node            [projection]
    step-index.json              shared step text and its owner       [projection]
    scenario-bindings.json       where each scenario is observable    [projection]
    progress.jsonl               implementation progress  [mutable — yours, starts empty]
    BHV-0142/
      BHV-0142.md                the spec            [original]
      bundle.json                everything BHV-0142 covers, inlined  [projection]
      tests/                     rendered Gherkin and/or JUnit        [projection]

  inventory/
    nodes.jsonl                  the legacy graph    [original]
    edges.jsonl                                      [original]

  views/
    pages.json                   page skeletons + layout trees        [projection]
    services.json                bean/service method surfaces         [projection]
    templates.json               page frames, fragments, the menu     [projection]
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
    fixture-order.json           safe seed/teardown order             [projection]

  auth/
    constraints.json             who may reach what                   [projection]
    identity.json                who exists, and where they live      [projection]

  triage/
    triage-log.jsonl             every uncovered branch's verdict     [original]
    open-questions.jsonl         every unanswered spec question       [original, append-only]
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

**`handover/ui-conventions.yaml`** — Optional, and unlike
`target-conventions.yaml` nothing derives from it. It records how the extracted
layout maps onto the target UI stack: which component a `tabs` container
becomes, whether a legacy fixed width survives, what happens to the shell.
The framework can carry that decision but cannot apply it, because applying
it is implementation. Recorded once here, it stops being made fifty times by
whoever reaches each screen first. A pack without it passes every gate; the
manifest records that the mapping was not stated.

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
not here — it was lifted into `RULE` nodes by `a6` and appears in whichever
behavior covers it, because it is business logic that happens to live in the
database.

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

- **Legacy source.** Not as an appendix, not as a fallback, not "alongside."
  Everything an implementer needs is extracted into an artifact first. A pack
  that ships the `.xhtml` files has quietly reopened the unaudited channel
  the whole method exists to close (`DECISIONS.md`, principle 5).
- **Target architecture.** Module boundaries, framework choices, persistence
  strategy, component library, styling. The API contract's *conventions* are
  an input to the pack, not an output of it, and so are the UI conventions.
- **Migrated data.** Moving legacy rows into the new schema is real work and
  a real risk, but it is an ETL runbook, not a specification.
- **Visual fidelity.** The pack states a screen's containment, order, widget
  kinds, and conditionality, and ships a photograph of what that looked like.
  It does not state spacing, colour, typography, or density as *facts*, does
  not extract them, and asserts nothing about them — in a component-library
  application most of them are not in the application's source to extract.
  Layout is not on this list; it used to be, and that was the mistake
  `DECISIONS.md`'s layout entry records.
- **Any check that a rebuild matched.** The pack says what the legacy screen
  was. Nothing here verifies that what gets built resembles it — the
  framework has no standing to (`DECISIONS.md`, "Structural fidelity is the
  implementer's call") and ships no validator that tries.

## Completeness gate — `spec_pack_complete`

The pack is not handed over until a deterministic check passes:

1. Every active inventory node is covered by at least one behavior, or is
   recorded in the out-of-scope log with a written reason.
2. Every behavior in `behaviors/` passed `c6`.
3. Every projection regenerates byte-identically from its source.
4. Every `.bpmn` file hashes equal to its legacy source file.
5. Every ID referenced anywhere in the pack resolves within the pack.
6. `manifest.json` lists every file present, and every file it lists exists.
7. Every fragment merged without collision, and every `SVC` public method,
   every active `SCR`, and every active `NAV` node either has an endpoint,
   a `client_side_only` verdict, or a recorded reason it has neither.
8. No legacy source file was copied in (`.bpmn` excepted — it is a carried
   artifact, not source standing in for a spec).
9. Every rendered artifact parses under a real parser for its format, with
   unique scenario titles and test-method names across the pack, and no
   Markdown markup left in step text (`c3b`).
10. Every scenario in the pack has exactly one surface binding, every
    binding of surface `rest` names an operation that resolves within
    `api/openapi.yaml`, and the bindings' `conventions_hash` matches the
    API contract's.
11. Every open-questions entry the pipeline seeded is well-formed and
    resolvable: its `subject` ids exist in the pack, its status is set, and
    every `assumed` entry states its assumption. Answering them is not a
    gate — the pack ships with open questions by design. Shipping them
    *unstated* is what the gate prevents.
12. Every value fact the extractors are required to capture is present on
    every node that must carry it, and the pack contains exactly one
    identity model (`a5` checks this at Phase A; `c9` re-checks that what
    passed then is what the pack actually ships).
13. Every screen and template has a layout tree in which every field appears
    exactly once, every guard, template reference and filled region resolves,
    and a wireframe renders from it. Every screen has a captured reference
    image or a recorded reason it has none.
14. `handover/ui-conventions.yaml` is present and hashed, or recorded absent.
    The file is optional and nothing derives from it; what the gate requires
    is that the manifest says which, so "no UI mapping was decided" is a
    statement rather than a silence.

The steps that produce and check all this are `a8` (screen reference
capture), `c3b` (rendered-artifact verification), `c7` (mechanical endpoint
derivation), `c7b` (scenario surface binding), `c8` (resolve what the rules
couldn't map), and `c9` (assemble, render wireframes, and gate). Validator
contracts: `validators/README.md`.

A pack failing any of these is incomplete, not "mostly done." The value of
the whole method rests on the claim that this description is complete; a
partial pack shipped as a complete one is the one failure that discredits
everything upstream of it.
