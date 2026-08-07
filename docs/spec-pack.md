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

## Layout

```
spec-pack/
  README.md                      generated index — start here
  manifest.json                  every file, its kind, its source, its hash

  behaviors/
    order.json                   dependency order and waves           [projection]
    progress.jsonl               implementation progress  [mutable — yours, starts empty]
    BHV-0142/
      BHV-0142.md                the spec            [original]
      bundle.json                everything BHV-0142 covers, inlined  [projection]
      tests/                     rendered Gherkin and/or JUnit        [projection]

  inventory/
    nodes.jsonl                  the legacy graph    [original]
    edges.jsonl                                      [original]

  views/
    pages.json                   page skeletons, per screen           [projection]
    services.json                bean/service method surfaces         [projection]

  api/
    openapi.yaml                 the target REST contract, merged     [derived]
    fragments/                   one fragment per source method       [derived]

  process/
    *.bpmn                       byte-identical copies of the legacy files
    bindings.json                what each task/gateway references    [projection]

  data/
    schema.json                  tables, columns, keys, triggers      [projection]

  auth/
    constraints.json             who may reach what                   [projection]

  triage/
    triage-log.jsonl             every uncovered branch's verdict     [original]
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
validators. This is what replaces "go read the `.xhtml`."

**`views/services.json`** — For each backing bean and service class: its
public method signatures, parameter and return types, scope, which methods
are bound to a screen action, and what navigation outcomes each can return.
This is what replaces "go read the bean."

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

**`data/schema.json`** — Tables with columns, types, nullability, primary and
foreign keys; triggers and stored procedures with pointers to their source.
Trigger and procedure *logic* is not here — it was lifted into `RULE` nodes
by `a6` and appears in whichever behavior covers it, because it is business
logic that happens to live in the database.

**`auth/constraints.json`** — Every `web.xml` security constraint and every
`@RolesAllowed`-style annotation, with what it restricts.

**`triage/triage-log.jsonl`** — Every branch the derived tests did not cover,
and its verdict: needs a scenario, dead code (do not migrate), or defensive
and justified. This is the evidence that the specs are complete rather than
merely self-consistent. It is a deliverable, not a work artifact — a reviewer
reads it whole, because the patterns across entries are what expose a spec
that rationalized away its own gaps.

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
human-authored `api-conventions.yaml`, written once per application — the
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
  an input to the pack, not an output of it.
- **Migrated data.** Moving legacy rows into the new schema is real work and
  a real risk, but it is an ETL runbook, not a specification.
- **Visual fidelity.** The pack says a screen has these fields in this
  grouping with this widget kind. It does not say what it looks like.

## Completeness gate — `spec_pack_complete`

The pack is not handed over until a deterministic check passes:

1. Every active inventory node is covered by at least one behavior, or is
   recorded in the out-of-scope log with a written reason.
2. Every behavior in `behaviors/` passed `c6`.
3. Every projection regenerates byte-identically from its source.
4. Every `.bpmn` file hashes equal to its legacy source file.
5. Every ID referenced anywhere in the pack resolves within the pack.
6. `manifest.json` lists every file present, and every file it lists exists.
7. Every fragment merged without collision, and every `SVC` public method
   either has an endpoint or a recorded reason it has none.
8. No legacy source file was copied in (`.bpmn` excepted — it is a carried
   artifact, not source standing in for a spec).

The steps that produce and check all this are `c7` (mechanical endpoint
derivation), `c8` (resolve the methods the rules couldn't map), and `c9`
(assemble and gate). Validator contracts: `validators/README.md`.

A pack failing any of these is incomplete, not "mostly done." The value of
the whole method rests on the claim that this description is complete; a
partial pack shipped as a complete one is the one failure that discredits
everything upstream of it.
