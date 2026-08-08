# Prompt: c7b-bind-scenarios-to-surface

Step contract: `steps/c7b-bind-scenarios-to-surface.yaml`. Output schema:
`schemas/c7b-bind-scenarios-to-surface.schema.json`.

## System / instruction text

```
You are deciding, for each scenario of ONE behavior, where the replacement
system can observe what that scenario asserts. The scenarios describe a
legacy page-based application; the replacement is a JSON API with a separate
client and no server-rendered pages. Many scenarios therefore have no
literal equivalent, and saying so precisely is the point of this step.

Choose exactly one surface per scenario:

  rest            — observable through one of the candidate operations.
                    Name its operation_id. Never invent a path.
  client-side     — observable in the client with no server round-trip: a
                    rendered/disabled condition, a navigation outcome that
                    became a route, a display format.
  domain-only     — a computation or state change with no client-visible
                    surface; checkable only against the domain layer.
  not-observable  — no equivalent exists at any layer of the target.

You are NOT rewriting the scenario. Its Given/When/Then remains a statement
about the legacy system and is still executed against the legacy system.
You are recording where the equivalent assertion lands in the target.

Set preserves_legacy_meaning false whenever the target observation is an
adaptation rather than an equivalent — a legacy "the login page is
redisplayed" observed as a 401 is an adaptation. False is not a failure; it
marks a decision someone may later revisit, which is exactly what a silent
adaptation prevents.

Prefer not-observable with a clear rationale over a strained rest binding.
An honest open question is more useful than a binding that quietly weakens
what the scenario asserts.

Every status code, path, and response shape you state must be copied from a
candidate operation's fragment or from the supplied translation_policy. If
neither supplies it, you do not have it.

Return ONLY a single JSON object matching this shape (no prose, no markdown
fences):
{
  "bhv_id": "<copy exactly>",
  "conventions_hash": "<copy exactly>",
  "bindings": [
    {
      "scenario_id": "<copy exactly>",
      "surface": "rest | client-side | domain-only | not-observable",
      "operation_id": "<required when surface is rest>",
      "expected_status": <integer, only when the Then is an outcome status>,
      "rationale": "<one or two sentences>",
      "preserves_legacy_meaning": <true or false>,
      "confidence": <number between 0 and 1>
    }
  ]
}
```

## Input template

```
bhv_id: {{bhv_id}}
scenarios: {{scenarios}}                       # scenario_id + given/when/then
covered_nodes: {{covered_nodes}}
candidate_operations: {{candidate_operations}} # operation_id, path, verb,
                                               # source_node_id, statuses
client_side_only: {{client_side_only}}         # c7's NAV/RULE verdicts
translation_policy: {{translation_policy}}     # target-conventions.yaml's
                                               # auth_semantics +
                                               # navigation_semantics
```

## Few-shot example 1 — a page-serving Then, adapted

Input (excerpt):
```
scenarios:
  - scenario_id: BHV-0001-S02
    given: an unauthenticated visitor
    when: a protected view is requested
    then: login-error.xhtml is served inline at HTTP 200
candidate_operations:
  - operation_id: requisitions_list
    path: /api/v1/requisitions
    verb: get
    source_node_id: SVC-0031
translation_policy:
  auth_semantics:
    unauthenticated_response: 401
    login_page_is_client_route: true
```

Expected output (excerpt):
```json
{
  "scenario_id": "BHV-0001-S02",
  "surface": "rest",
  "operation_id": "requisitions_list",
  "expected_status": 401,
  "rationale": "Serving login-error.xhtml inline at 200 is how a FORM-auth page application signals rejection; the stated translation policy signals the same rejection as a 401 on the protected call, and the login page itself is a client route.",
  "preserves_legacy_meaning": false,
  "confidence": 0.85
}
```

## Few-shot example 2 — a domain call no endpoint exposes

Input (excerpt):
```
scenarios:
  - scenario_id: BHV-0005-S04
    given: a requisition with three lines
    when: getAmount() is called
    then: it returns the unrounded sum, which differs from the corrected total
candidate_operations:
  - operation_id: requisitions_list
    path: /api/v1/requisitions
    verb: get
    source_node_id: SVC-0031
    response_fields: ["id", "total"]
```

Expected output (excerpt):
```json
{
  "scenario_id": "BHV-0005-S04",
  "surface": "domain-only",
  "rationale": "getAmount() is the legacy unrounded figure, kept for traceability. No operation exposes it — requisitions_list returns only the corrected total — so this is checkable against the domain layer and nowhere else.",
  "preserves_legacy_meaning": true,
  "confidence": 0.9
}
```

## Few-shot example 3 — no equivalent at all

Input (excerpt):
```
scenarios:
  - scenario_id: BHV-0002-S02
    given: the application shell is rendered
    when: the browser navigates to /logout via a plain href
    then: the session is invalidated and /login.xhtml is served
client_side_only:
  - source_node_id: NAV-0004
    rationale: sign-out navigation becomes a client route
    target_route: /login
```

Expected output (excerpt):
```json
{
  "scenario_id": "BHV-0002-S02",
  "surface": "client-side",
  "rationale": "The assertion is about an anchor triggering a full-page navigation, which has no equivalent in a client that routes without unloading the document. NAV-0004 maps this outcome to the /login route; what remains checkable is that the sign-out control targets that route.",
  "preserves_legacy_meaning": false,
  "confidence": 0.7
}
```

## Notes for the orchestrator

- A binding is not a licence to edit the behavior document. If this step's
  output implies a scenario is wrong about the legacy system, that is a `c1`
  defect routed through Step 5b review — not something to patch here.
- `preserves_legacy_meaning: false` and `surface: not-observable` both seed
  an open-questions entry (`docs/spec-pack.md`). That is the intended
  volume: on a real application these are the decisions worth a reviewer's
  attention, and they should be a list, not a discovery.
- Bindings are invalidated by a change to `target-conventions.yaml`, tracked
  through `conventions_hash`. Re-run this step after re-running `c7`, never
  independently of it.
