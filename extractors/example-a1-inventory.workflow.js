export const meta = {
  name: 'jsf-a1-inventory',
  description: 'Run step a1-extract-inventory of the jsf-migration framework against acme-procurement',
  phases: [
    { title: 'Extract' },
    { title: 'Assemble' },
  ],
}

const KEY_CONVENTION = `
Key convention (use exactly this so cross-references resolve later):
  SCR key  = "SCR:<path from src/main/webapp/, e.g. pages/requisition/edit.xhtml>"
  TPL key  = "TPL:<same path convention, e.g. templates/main.xhtml or pages/requisition/lines.xhtml>"
  SVC key  = "SVC:<fully-qualified Java class name, e.g. com.acme.procurement.service.BudgetService>"
  PROC key = "PROC:<the BPMN <process> element's id attribute>"
  TASK key = "TASK:<the BPMN element's own id attribute>"
  DB key   = "DB:<table name, upper- or lower-case exactly as the entity/schema declares it>"
  NAV key  = "NAV:<from-view-id>-><to-outcome-or-view>"
  AUTHZ key= "AUTHZ:<url-pattern or class#method the constraint protects>"
  AUTHN key= "AUTHN:app"   (there is exactly one AUTHN node for the whole application)
  EL key   = "EL:<screen-or-template path>#<component id or best-effort locator>-<attribute>"
  CFG key  = "CFG:<managed-bean name or filter/servlet name>"
Every node you emit needs a "key" field (temporary — a later merge step assigns the
final global "PREFIX-0001"-style id, so do NOT invent a final id yourself). Every edge
references "from_key"/"to_key" using this same convention, even pointing at a key you
did not yourself define (another pass owns that node) — the merge step resolves or
flags it, so guess the correct key rather than skipping the edge.`

const PREAMBLE = `You are standing in for step "a1-extract-inventory" of the jsf-migration
framework (a legacy JSF -> Spring Boot/Angular migration spec-extraction method),
applied to the legacy app "acme-procurement". a1 is normally a deterministic script
(AST/DOM/XML parsers); you are doing that extraction by hand, so be mechanical and
literal — record only what the source literally states, never invent or infer beyond
the documented extraction rules, and mark anything you cannot decide with certainty as
extraction_confidence: "ambiguous" rather than guessing (a later step, a2/a3/a4, RESOLVES
ambiguity — you must NOT resolve it here, just flag it honestly).

Read these framework references first:
  - /home/serby/projects/wksh/jsf-migration/docs/phase-a-inventory.md  (full extraction rules, node/edge types, "Layout" and "Value facts" sections)
  - /home/serby/projects/wksh/jsf-migration/schemas/a1-extract-inventory.schema.json
  - /home/serby/projects/wksh/jsf-migration/schemas/layout-tree.schema.json  (if you are extracting any SCR or TPL node)

Never emit a RULE node — a1 never creates them; only the later a3-lift-rule step does,
from the raw EL / db-body / computation facts you flag here. Where a required raw_facts
field genuinely isn't knowable from the source, say so explicitly (e.g. value_domain: null)
rather than omitting the key or inventing a value.
${KEY_CONVENTION}

Return your findings via the structured output tool. Put any caveat, judgment call, or
thing you could not resolve into "notes" — be specific, this is read by a merge step
with no other context on your reasoning.`

const NODE_EDGE_SCHEMA = {
  type: 'object',
  required: ['nodes', 'edges', 'notes'],
  properties: {
    nodes: {
      type: 'array',
      items: {
        type: 'object',
        required: ['key', 'kind', 'label', 'legacy_refs', 'extraction_confidence', 'status', 'raw_facts'],
        properties: {
          key: { type: 'string' },
          kind: { type: 'string', enum: ['screen','service','process','task','job','navigation','db','el','config','authz','authn','template'] },
          label: { type: 'string' },
          legacy_refs: { type: 'array', items: { type: 'string' } },
          extraction_confidence: { type: 'string', enum: ['certain','ambiguous','rejected'] },
          status: { type: 'string', enum: ['active','removed'] },
          raw_facts: { type: 'object' }
        }
      }
    },
    edges: {
      type: 'array',
      items: {
        type: 'object',
        required: ['from_key', 'to_key', 'type', 'evidence'],
        properties: {
          from_key: { type: 'string' },
          to_key: { type: 'string' },
          type: { type: 'string', enum: ['RENDERS','INVOKES','NAVIGATES_TO','TRIGGERS','READS','WRITES','STARTS','CONTAINS','SCHEDULES','GUARDS','DERIVED_FROM','VALIDATED_BY','CONVERTED_BY','RESTRICTS','COMPOSES_INTO','INCLUDES'] },
          evidence: { type: 'string' },
          extraction_confidence: { type: 'string', enum: ['certain','ambiguous','rejected'] }
        }
      }
    },
    notes: { type: 'string' }
  }
}

const WEBAPP = '/home/serby/projects/wksh/acme-procurement/legacy-app/src/main/webapp'
const JAVA = '/home/serby/projects/wksh/acme-procurement/legacy-app/src/main/java/com/acme/procurement'
const RES = '/home/serby/projects/wksh/acme-procurement/legacy-app/src/main/resources'

phase('Extract')

const groups = [
{
  key: 'requisition-screens',
  prompt: `${PREAMBLE}

Scope: the requisition screens and their shared backing beans (view/bean pair scan,
rule 2, plus the EL scan, rule 4, plus the layout/template scan, rule 9 — same DOM walk).

Files to read fully:
  ${WEBAPP}/pages/requisition/edit.xhtml
  ${WEBAPP}/pages/requisition/list.xhtml
  ${WEBAPP}/pages/requisition/review.xhtml
  ${WEBAPP}/pages/requisition/summary.xhtml
  ${WEBAPP}/pages/requisition/confirm.xhtml
  ${WEBAPP}/pages/requisition/board-notice.xhtml
  ${WEBAPP}/pages/requisition/lines.xhtml
  ${JAVA}/bean/RequisitionEditBean.java
  ${JAVA}/bean/RequisitionListBean.java
  ${JAVA}/bean/RequisitionReviewBean.java

Context worth knowing before you extract (from the app's own environment README —
these are real facts about the source, not hints to take on faith; verify each against
the actual file):
  - lines.xhtml is a fragment ui:include'd by review/summary/confirm/board-notice, not
    navigated to directly — it is a TPL (template_role: "fragment"), not a SCR.
  - review.xhtml's bean is @ViewScoped RequisitionReviewBean, but both "confirm" and
    "reject" navigation-cases in faces-config.xml use <redirect/>, which starts a new
    request and destroys that @ViewScoped bean. confirm.xhtml and board-notice.xhtml
    are reached this way and rebuild their state from <f:viewParam> (id, decision,
    comment) in RequisitionReviewBean.init() rather than from the bean instance that
    made the decision — record this as it affects NAV/CFG scope: the "condition" or
    outcome on those navigation-cases matters, and any EL in confirm/board-notice.xhtml
    that reads requisitionReviewBean.* is reading a freshly-reconstructed bean, not the
    one that decided.
  - summary.xhtml is opened via ?id=; review.xhtml is opened via a Camunda ?taskId=.
  - edit.xhtml's supplier dropdown uses converter="omnifaces.SelectItemsConverter" —
    that is a built-in-ish OmniFaces converter, not a custom @FacesConverter class in
    this app's own source, so treat its "ref" as a built-in id, not a SVC key, per the
    converters_validators extraction rule. Confirm this is the only converter/validator
    reference in this file group, or find others.

For each of the 7 xhtml files: decide SCR vs TPL per the rule above (lines.xhtml is TPL;
the rest are SCR), extract form_fields, field_groups, data_tables, ajax_bindings,
converters_validators, labels, messages, layout_tree, layout_template (COMPOSES_INTO
edge to the shell template — you don't need to read templates/main.xhtml yourself, just
use TPL key "TPL:templates/main.xhtml" per the convention), and every EL node (rendered/
disabled/required/value attributes) with attached_screen set correctly.

For each of the 3 bean files: also emit an SVC node for the bean class itself (public_methods
with action_bound/nav_outcomes, injected_deps candidates as INVOKES/READS/WRITES edges to
other SVC/DB keys you can infer — e.g. calls into RequisitionDao, BudgetService,
RuntimeService — and constants/derivation_methods per the value-facts rule). Emit a RENDERS
edge from each SCR to its bean's SVC key. If a bean method starts a Camunda process
instance (look for runtimeService.startProcessInstanceByKey / similar), emit a STARTS edge
from that bean's SVC key to "PROC:<the literal process key string used in that call>".`
},
{
  key: 'other-screens',
  prompt: `${PREAMBLE}

Scope: the supplier, task, report and admin screens and their backing beans (view/bean
pair scan, rule 2, plus EL scan, rule 4, plus layout/template scan, rule 9).

Files to read fully:
  ${WEBAPP}/pages/supplier/list.xhtml
  ${WEBAPP}/pages/supplier/edit.xhtml
  ${WEBAPP}/pages/task/list.xhtml
  ${WEBAPP}/pages/report/spend.xhtml
  ${WEBAPP}/pages/admin/budget.xhtml
  ${JAVA}/bean/SupplierListBean.java
  ${JAVA}/bean/SupplierEditBean.java
  ${JAVA}/bean/TaskListBean.java

report/spend.xhtml and admin/budget.xhtml may or may not have a resolvable backing bean
among the files above or via faces-config.xml/@Named annotations elsewhere — if you
cannot resolve one with certainty, still emit the SCR node with extraction_confidence:
"ambiguous" and an empty backing_bean_class, per the framework's explicit rule (never
drop a view silently for lacking a bean).

For each xhtml: extract form_fields, field_groups, data_tables, ajax_bindings,
converters_validators, labels, messages, layout_tree, layout_template (COMPOSES_INTO to
"TPL:templates/main.xhtml"), and every EL node. For SupplierEditBean's IBAN field, check
whether it uses a custom validator (there is a SupplierIbanValidator class elsewhere in
the source — you don't need to read it, just reference it as
"SVC:com.acme.procurement.validator.SupplierIbanValidator" in a VALIDATED_BY edge if
edit.xhtml actually references it).

For the 3 bean files: emit an SVC node each (public_methods, action_bound, injected_deps
as INVOKES/READS/WRITES edges to other SVC/DB keys, constants/derivation_methods) and a
RENDERS edge from each SCR to its bean's SVC key.`
},
{
  key: 'shell-screens',
  prompt: `${PREAMBLE}

Scope: the application shell template and the unauthenticated entry screens (view/bean
pair scan rule 2, layout/template scan rule 9 — this is the ONE group that produces the
nav_menu, since only the shell template renders it).

Files to read fully:
  ${WEBAPP}/templates/main.xhtml
  ${WEBAPP}/login.xhtml
  ${WEBAPP}/login-error.xhtml
  ${WEBAPP}/index.xhtml
  ${WEBAPP}/WEB-INF/web.xml   (read only to see how index.xhtml/login.xhtml/login-error.xhtml are wired — form-login-page/form-error-page/welcome-file; do NOT extract AUTHZ/AUTHN nodes yourself, another pass owns those)

templates/main.xhtml is a TPL (template_role: "page-template"). Extract its layout_tree,
its defines_regions (named insertion points other views fill), and its nav_menu (one
entry per menu item, nested, with label, bundle key if any, target view id, the SCR node
it resolves to — use the SCR key convention even though you haven't read those screens
yourself — its render_guard if conditional, the roles it's visible to if stated, and
legacy_refs).

login.xhtml and login-error.xhtml: per the app's own README, these are plain HTML forms
posting to j_security_check (added because an <h:form> would post back into the JSF
view and never authenticate) — NOT JSF views with a backing bean. Still emit them as SCR
nodes (screens a user reaches) with extraction_confidence reflecting that (backing_bean_class
empty; this is a known, explainable case, not an extractor failure — say so in raw_facts
or notes). index.xhtml: read it and record what it actually does (redirect stub, or a
real page) rather than assuming.`
},
{
  key: 'java-services',
  prompt: `${PREAMBLE}

Scope: the Java AST scan (rule 1) over every non-view business-logic class — services,
DAOs, delegates, converters, validators. (Backing beans are handled by the screen-scanning
passes, which already read those files for the view/bean pairing — do not re-scan
${JAVA}/bean/*.java yourself, to avoid two passes emitting conflicting SVC nodes for the
same class.)

Files to read fully:
  ${JAVA}/service/SupplierService.java
  ${JAVA}/service/BudgetService.java
  ${JAVA}/service/RequisitionTotalCalculator.java
  ${JAVA}/dao/EmployeeDao.java
  ${JAVA}/dao/RequisitionDao.java
  ${JAVA}/dao/SupplierDao.java
  ${JAVA}/delegate/ValidateBudgetDelegate.java
  ${JAVA}/delegate/CreatePurchaseOrdersDelegate.java
  ${JAVA}/converter/AmountConverter.java
  ${JAVA}/validator/SupplierIbanValidator.java
  ${JAVA}/web/LogoutServlet.java
  ${JAVA}/domain/Requisition.java
  ${JAVA}/domain/RequisitionLine.java
  ${JAVA}/domain/Supplier.java
  ${JAVA}/domain/Employee.java

For each class in service/dao/delegate/converter/validator/web: emit an SVC node —
fqcn, annotations, public_methods ({name, params, return_type, action_bound: false (these
aren't view-bound), nav_outcomes}), injected_deps (as candidate INVOKES/READS/WRITES
edges — mark extraction_confidence "ambiguous" wherever static resolution can't pin a
dependency-injected interface to exactly one concrete class), constants (every literal
used in a comparison/field-initializer/constructor, with legacy_refs), and
derivation_methods (methods that compute a value from domain fields with no I/O — flag
these, do not lift them; that is a3's job). ValidateBudgetDelegate and
CreatePurchaseOrdersDelegate are Camunda JavaDelegate service-task implementations —
note in "notes" which BPMN service task(s) you believe reference each (by class name or
delegateExpression), so the BPMN pass's TASK nodes can be cross-checked, but you do not
need to read the .bpmn file yourself.

The 4 domain/*.java files are JPA entities (another pass extracts their DB table/column
facts) — read them ONLY to check for derivation/computation methods (a method that
computes a value from the entity's own fields with no I/O, e.g. a total/amount getter
that sums lines) per the same rule. If you find one, emit an SVC node for that domain
class too (kind: service is fine even though it's also a DB entity — note the dual role
explicitly) carrying just that derivation_methods fact, so the formula isn't lost. Do not
duplicate the DB table extraction itself.

Also grep the whole source tree (you may use a shell search) for @Scheduled, Quartz, or
TimerService usage (rule 8, scheduler config scan) — record in "notes" whether you found
any (expect none) rather than silently omitting the check.`
},
{
  key: 'config-and-auth',
  prompt: `${PREAMBLE}

Scope: faces-config.xml parse (rule 5 — NAV, CFG nodes) and the auth scan (rule 3 —
AUTHZ, exactly one AUTHN node).

Files to read fully:
  ${WEBAPP}/WEB-INF/faces-config.xml
  ${WEBAPP}/WEB-INF/web.xml

Also grep the Java source tree (you may use a shell search) for @RolesAllowed,
@DeclareRoles, @PermitAll, @DenyAll or equivalent method/class-level security
annotations, in addition to web.xml's <security-constraint> blocks — both are AUTHZ
sources per the rule.

Every <navigation-rule>/<navigation-case> becomes one NAV node (from_view, to_view,
from_outcome, condition if EL-guarded — raw expression, do not lift it). Every
<managed-bean> XML declaration becomes one CFG node; if this app declares its beans via
annotations instead (@ManagedBean/@Named) rather than XML, say so explicitly and emit
CFG nodes only for whatever actually appears in the XML (web.xml filters/servlets
relevant to reaching a screen count too, e.g. the LogoutServlet mapping).

For AUTHZ: emit one node per <security-constraint> and per annotation found, each with a
RESTRICTS edge to the SCR/SVC key it protects — resolve url-pattern wildcards against
this actual screen file list (use the SCR key convention against these paths):
  pages/requisition/{edit,list,review,summary,confirm,board-notice,lines}.xhtml,
  pages/supplier/{list,edit}.xhtml, pages/task/list.xhtml, pages/report/spend.xhtml,
  pages/admin/budget.xhtml, login.xhtml, login-error.xhtml, index.xhtml.
If a pattern matches several, emit one RESTRICTS edge per matched screen and say so in
notes.

For AUTHN: emit exactly one node (key "AUTHN:app") from <login-config> (auth_method,
realm_name, form_login_page, form_error_page) and the full <security-role> vocabulary
(declared_roles). Determine credential_store: "in_repo" if a table/config file inside
this repository holds credentials, "external" if it names a container realm/LDAP/SSO the
repo doesn't contain (this app's README says demo accounts are created in WildFly's
ApplicationRealm via add-user.sh at image build time — a properties-file realm outside
this repo — verify and reflect that), or "unknown". Also record logout_mechanism (there
is a LogoutServlet at /logout per the java-services pass, and a "Sign out" link in the
shell template).`
},
{
  key: 'bpmn',
  prompt: `${PREAMBLE}

Scope: BPMN XML parse (rule 6) — PROC, TASK nodes, CONTAINS edges, gateway
condition_expr captured raw (not lifted — that's a3's job).

File to read fully: ${RES}/purchase-requisition-approval.bpmn

Emit one PROC node for the <process> element (bpmn_id, process_key = its id attribute —
use that exact string in your PROC key per the convention, since Java code starts it by
that literal key). Emit one TASK node per userTask/serviceTask/gateway inside it, each
with a CONTAINS edge from the PROC. For each userTask, record its camunda:candidateGroups
(this drives who can claim it — teamLeads/financeDirectors/requesters per the app's
README — worth noting even though role-mapping itself isn't a TASK field, put it in
raw_facts or notes). For each serviceTask, record what it invokes (camunda:class or
camunda:delegateExpression) and emit an INVOKES-style edge... actually per the edge type
table there's no TASK->SVC edge type defined; instead just record the invoked
class/expression as a raw_facts field on the TASK (e.g. "delegate_ref") so the merge step
or a human can cross-check it against the java-services pass's SVC nodes for
ValidateBudgetDelegate / CreatePurchaseOrdersDelegate — do not invent an edge type that
isn't in the schema. For each exclusiveGateway, record condition_expr verbatim on the
outgoing sequence flows (or the gateway's own default/condition attribute, whichever
this BPMN file actually uses) — flag it in notes as a lift candidate for a3, source_kind
"el" per the framework's treatment of gateway conditions (same handling as EL).`
},
{
  key: 'db',
  prompt: `${PREAMBLE}

Scope: DB catalog introspection (rule 7). This app's schema is Hibernate-generated
(hibernate.hbm2ddl.auto=create against H2 in local dev; production uses Oracle with
hibernate.hbm2ddl.auto=validate against a schema this repo does not contain DDL for) —
so read the JPA entity annotations as the source of truth for column facts, and the seed
data for actual value domains, rather than looking for a DDL/SQL schema file that doesn't
exist for the columns themselves.

Files to read fully:
  ${JAVA}/domain/Requisition.java
  ${JAVA}/domain/RequisitionLine.java
  ${JAVA}/domain/Supplier.java
  ${JAVA}/domain/Employee.java
  ${JAVA}/domain/RequisitionStatus.java
  ${JAVA}/domain/SupplierType.java
  ${RES}/META-INF/seed-data.sql
  ${RES}/META-INF/persistence.xml   (context only — dialect/config, not columns)

Emit one DB node (kind: "table") per @Entity, with columns: [{name, type, nullable,
primary_key, foreign_key: <DB key of the referenced table, or null>, precision, scale,
length, default, check_constraints, value_domain}] read from the JPA column/enum
annotations (@Column precision/scale/length/nullable, @Enumerated for enum-backed
columns, @ManyToOne/@JoinColumn for foreign keys). For an enum-backed column
(RequisitionStatus, SupplierType), value_domain is the enum's members. Where no
constraint/enum/lookup-table evidence exists for a column's legal values, value_domain
is null — an honest "not knowable mechanically," per the framework's rule; do not guess
from seed-data alone unless seed-data is the ONLY evidence for a genuinely enumerated
column (state which source you used for each value_domain in raw_facts or notes).

This app has no database triggers or stored procedures (Hibernate generates the schema;
there is no DDL source in this repository) — do not fabricate DB nodes of kind
"trigger"/"stored_procedure"; state this absence explicitly in "notes" rather than
omitting the check silently, per the framework's "not knowable is a recorded state, not
a blank" principle.

Also emit READS/WRITES-style facts only insofar as they belong on SVC nodes (which you
are not producing here) — you only need to emit the DB table nodes themselves and their
FK-derived relationships between tables if any exist (there is no dedicated edge type for
table-to-table FK in the schema's edge list, so just record foreign_key inside the column
fact, per the schema).`
}
]

const extracted = await parallel(groups.map(g => () => agent(g.prompt, { label: g.key, phase: 'Extract', schema: NODE_EDGE_SCHEMA })))

log(`Extraction done: ${extracted.filter(Boolean).length}/${groups.length} groups returned results`)

phase('Assemble')

const bundle = groups.map((g, i) => ({ group: g.key, result: extracted[i] })).filter(x => x.result)

const ASSEMBLER_PROMPT = `You are the merge/assembler step that finishes "a1-extract-inventory"
for the jsf-migration framework, applied to acme-procurement. Seven independent extraction
passes each scanned a disjoint slice of the legacy source and returned nodes/edges keyed by
a temporary string "key" instead of a final id. Your job is the deterministic part of a1:
assign final global stable ids, resolve every edge's from_key/to_key into those ids, validate
the result against a1's own contract, and write the two output files.

Read these two framework files for the exact target shape before you write anything:
  - /home/serby/projects/wksh/jsf-migration/schemas/a1-extract-inventory.schema.json
  - /home/serby/projects/wksh/jsf-migration/steps/a1-extract-inventory.yaml  (see its own "validators" list — that is your acceptance bar)

Here is the raw output of all 7 extraction passes, as JSON (group name -> {nodes, edges, notes}):

${JSON.stringify(bundle, null, 0)}

Do this:

1. Merge all "nodes" arrays. Map each node's "kind" to its id prefix: screen->SCR,
   template->TPL, service->SVC, process->PROC, task->TASK, job->JOB, navigation->NAV,
   db->DB, el->EL, config->CFG, authz->AUTHZ, authn->AUTHN. (rule->RULE must never appear —
   if one slipped through, drop it and flag it loudly in your summary, it is a bug in the
   extraction pass that produced it.)
2. Within each prefix, sort nodes by their "key" string ascending, and assign sequential ids
   "PREFIX-0001", "PREFIX-0002", ... (zero-padded to 4 digits). Build a full key -> id map.
   If two nodes in the same prefix have keys that are semantically the same thing extracted
   twice by two different passes (e.g. the same SVC class described by two groups), merge
   them into one node (union their legacy_refs and raw_facts, prefer the more complete
   raw_facts, note the merge in your summary) rather than emitting a duplicate.
3. Rewrite every node: drop the temporary "key" field, add "id" (the assigned id),
   "extracted_by": "a1-extract-inventory", and keep classification_source unset (these are
   all script-extracted, not llm-resolved — this step never sets classification_source).
   The final node object's fields must be exactly: id, kind, label, legacy_refs, extracted_by,
   extraction_confidence, status, raw_facts (classification_source omitted) — matching
   a1-extract-inventory.schema.json's node definition exactly (additionalProperties: false).
4. Rewrite every edge: resolve from_key/to_key to final ids via the map. If a key does not
   resolve to any known node, KEEP the edge, set its extraction_confidence to "ambiguous",
   and add one entry to an "unresolved_edges" list in your summary (do not silently drop it).
   Final edge object fields: from, to, type, evidence, extraction_confidence
   (candidate_targets omitted) — matching the schema's edge definition exactly.
5. Validate before writing: every node id matches ^[A-Z]+-[0-9]{4,}$ and its prefix is one of
   SCR/SVC/PROC/TASK/JOB/NAV/DB/EL/CFG/AUTHZ/AUTHN/TPL; no RULE-prefixed node exists; exactly
   one AUTHN node exists in the whole merged set (this is one of a1's own listed validators —
   if it's not exactly one, say so prominently in your summary, don't just proceed silently);
   every edge's evidence is non-empty; every edge's "from"/"to" is a real node id (post-resolution,
   the ones you couldn't resolve are already flagged per step 4, that's expected and fine).
6. Write the results with the Write tool, one JSON object per line (JSONL — no wrapping array,
   no trailing comma), to:
     /home/serby/projects/wksh/acme-procurement/spec-pack/inventory/nodes.jsonl
     /home/serby/projects/wksh/acme-procurement/spec-pack/inventory/edges.jsonl
   Order nodes.jsonl by id (grouped by prefix in the order listed in step 1); order
   edges.jsonl by (from, to, type).

Return, via the structured output tool, a CONCISE summary only (do not repeat the full node/edge
dump — the files on disk are the record): counts of nodes per kind, counts of edges per type,
the unresolved_edges list from step 4, any nodes you merged as duplicates, any validator issue
from step 5, any node kind that has zero instances (say whether that's expected, e.g. "no JOB
nodes — the extraction passes found no scheduler config" is expected; "no AUTHZ nodes" would not
be), and the two file paths with their final line counts.`

const SUMMARY_SCHEMA = {
  type: 'object',
  required: ['node_counts', 'edge_counts', 'unresolved_edges', 'merged_duplicates', 'validator_issues', 'zero_count_kinds', 'files_written'],
  properties: {
    node_counts: { type: 'object' },
    edge_counts: { type: 'object' },
    unresolved_edges: { type: 'array', items: { type: 'object' } },
    merged_duplicates: { type: 'array', items: { type: 'string' } },
    validator_issues: { type: 'array', items: { type: 'string' } },
    zero_count_kinds: { type: 'array', items: { type: 'object' } },
    files_written: { type: 'array', items: { type: 'object' } }
  }
}

const summary = await agent(ASSEMBLER_PROMPT, { label: 'assemble', phase: 'Assemble', schema: SUMMARY_SCHEMA, effort: 'high' })

return summary
