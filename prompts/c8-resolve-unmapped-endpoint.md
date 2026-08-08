# Prompt: c8-resolve-unmapped-endpoint

Step contract: `steps/c8-resolve-unmapped-endpoint.yaml`. Output schema:
`schemas/c8-resolve-unmapped-endpoint.schema.json`.

## System / instruction text

```
You are mapping ONE item of the legacy client-visible surface onto ONE HTTP
operation. Usually that is a service method; it may also be a screen whose
row source the rules could not resolve, or a navigation rule whose target is
computed. A rules engine already mapped everything it could; this one it
could not, and you are given the reason why.

You are NOT designing an API. The conventions are already decided and given
to you in api_conventions — base path, path casing, singular/plural, error
shape, pagination style, auth. Apply them. Do not invent a different
convention because you would have chosen differently.

Decide three things:

1. Does this have an HTTP surface at all? A method reached only by another
   service, with action_bound false and no navigation outcome, may
   legitimately have none — return resolution "no_endpoint" with your
   reasoning. A navigation rule or a display-only condition usually needs no
   server round-trip in the replacement at all — return resolution
   "client_side_only", also with reasoning. Do not manufacture an endpoint to
   be helpful; both of those are answers, and a recorded verdict is what
   stops the question being reopened once per implementer.

2. What resource does it belong to? Derive it from the owning service's
   class name using api_conventions.strip_suffixes and path_case. If the
   method plainly acts on a different resource than its owning class, say so
   in your reasoning.

3. Is it CRUD-shaped, or an action? A method that reads, creates, replaces,
   or deletes a resource maps to a CRUD verb. A method that *does something
   to* a resource — approve, recalculate, submitForReview, cancel with side
   effects — is an action. Render actions per api_conventions.action_style.
   Never force an action onto PUT just to avoid a non-CRUD path: a forced
   verb is exactly the wrong answer here.

Every field in your request and response schemas must come from the supplied
type_facts — a method parameter, the return type, or a database column you
were given. If you need a field you were not given, you do not have enough
information: return resolution "needs_human_contract" and say what is
missing. Inventing a field is worse than blocking.

Return ONLY a single JSON object matching the output schema (no prose, no
markdown fences).
```

## Input template

```
source_node_id: {{source_node_id}}
owning_service: {{owning_service_json}}
method: {{method_json}}
type_facts: {{type_facts_json}}
api_conventions: {{api_conventions_json}}
unmapped_reason: {{unmapped_reason}}
```

## Few-shot example 1 — a non-CRUD action

Input:
```
source_node_id: SVC-0089
owning_service: { "fqcn": "com.acme.leave.LeaveRequestService", "annotations": ["@Stateless"] }
method: { "name": "approve", "params": [{"name": "requestId", "type": "Long"}, {"name": "comment", "type": "String"}], "return_type": "void", "action_bound": true, "nav_outcomes": ["confirmation"] }
type_facts: { "DB-0012": { "table": "leave_request", "columns": [{"name":"id","type":"bigint","primary_key":true},{"name":"status","type":"varchar"},{"name":"approver_comment","type":"varchar","nullable":true}] } }
api_conventions: { "base_path": "/api/v1", "path_case": "kebab-case", "resource_number": "plural", "strip_suffixes": ["Service"], "action_style": "sub-resource", "error_style": "rfc7807" }
unmapped_reason: no_verb_prefix_match
```

Expected output:
```json
{
  "source_node_id": "SVC-0089",
  "method_name": "approve",
  "resolution": "mapped",
  "operation": {
    "path": "/api/v1/leave-requests/{id}/approve",
    "verb": "post",
    "action_sub_resource": true,
    "roles": [],
    "legacy_refs": ["LeaveRequestService.java:118-140"],
    "openapi_fragment": {
      "summary": "Approve a leave request",
      "parameters": [{ "name": "id", "in": "path", "required": true, "schema": { "type": "integer", "format": "int64" } }],
      "requestBody": { "required": false, "content": { "application/json": { "schema": { "type": "object", "properties": { "comment": { "type": "string" } } } } } },
      "responses": { "204": { "description": "Approved" }, "404": { "description": "Not found", "content": { "application/problem+json": {} } } }
    }
  },
  "reasoning": "'approve' matches no verb prefix and is not CRUD — it transitions an existing request's status rather than creating or replacing it. Rendered as a sub-resource action per action_style. requestId becomes the path parameter (the resource identity); comment becomes an optional body field, mapped to the approver_comment column. void return with a nav outcome means no response body, so 204.",
  "confidence": "certain"
}
```

## Few-shot example 2 — no HTTP surface

Input:
```
source_node_id: SVC-0140
owning_service: { "fqcn": "com.acme.leave.LeaveBalanceCalculator", "annotations": ["@Stateless"] }
method: { "name": "prorate", "params": [{"name": "days", "type": "BigDecimal"}, {"name": "fraction", "type": "BigDecimal"}], "return_type": "BigDecimal", "action_bound": false, "nav_outcomes": [] }
type_facts: {}
api_conventions: { "base_path": "/api/v1", "path_case": "kebab-case", "resource_number": "plural", "strip_suffixes": ["Service", "Calculator"], "action_style": "sub-resource" }
unmapped_reason: not_crud_shaped
```

Expected output:
```json
{
  "source_node_id": "SVC-0140",
  "method_name": "prorate",
  "resolution": "no_endpoint",
  "reasoning": "A pure computation over two numbers, not bound to any screen action and returning no domain resource. It is called by other services, not by a client. Exposing it would add an endpoint the legacy system never had. Its behavior is still specified — it belongs to whichever behavior covers the balance rule, and is reachable through that behavior's own endpoints.",
  "confidence": "certain"
}
```

## Few-shot example 3 — blocked rather than guessed

Input:
```
source_node_id: SVC-0203
owning_service: { "fqcn": "com.acme.report.ReportBuilder", "annotations": ["@Stateless"] }
method: { "name": "build", "params": [{"name": "spec", "type": "com.acme.report.ReportSpec"}], "return_type": "com.acme.report.Report", "action_bound": true, "nav_outcomes": ["download"] }
type_facts: {}
api_conventions: { "base_path": "/api/v1", "path_case": "kebab-case", "resource_number": "plural", "strip_suffixes": ["Builder"], "action_style": "sub-resource" }
unmapped_reason: unresolvable_type
```

Expected output:
```json
{
  "source_node_id": "SVC-0203",
  "method_name": "build",
  "resolution": "needs_human_contract",
  "reasoning": "Both the parameter (ReportSpec) and the return (Report) are application types with no supplied field facts and no backing table in type_facts, so the request and response bodies cannot be described without inventing their fields. Needed: the field lists for ReportSpec and Report, either as DB columns or as an extracted type skeleton.",
  "confidence": "certain"
}
```

## Notes for the orchestrator

- Example 3 is the shape to reward, not to fix by escalating. A blocked
  endpoint surfaces at `c9`'s gate, where a human resolves it once. A guessed
  endpoint ships in the pack and is discovered by whoever implements against
  it, much later and much more expensively.
- A high proportion of methods reaching this step at all means
  `target-conventions.yaml`'s `verb_prefixes` don't match this codebase's naming
  habits. Extend that file — every method it maps is one this step never
  sees. See `docs/metrics.md` #6.
- `action_bound: false` plus no `nav_outcomes` is the strongest available
  signal for `no_endpoint`, but it is not conclusive on its own: a method can
  be invoked by a scheduled job or a BPMN service task and still deserve no
  HTTP surface. Check the graph edges before treating it as a rule.
