---
id: kms-strategy-evaluation
title: "KMS Strategy — Target Design and Governance Standard"
audience: [dev, operations, product]
type: spec
status: review
version: "2.0.0"
updated: 2026-09-22
visibility: internal
summary: "The target architecture, documentation standard and governance model for the platform Knowledge Management System — audiences, taxonomy, metadata, source-of-truth, deployment documentation, runbooks, CI governance and SDD integration, with current-state facts separated from design intent."
tags: [kms, strategy, documentation, architecture, governance]
related: [kms-pilot-orders-fulfilment-plan, sdd-workflow, architecture, adr-001-hosting]
---

# KMS Strategy — Target Design and Governance Standard

## 0. Strategy vs implementation boundary

> **This document defines the target KMS architecture, documentation standards and governance
> model. It does not itself prove that any example technology, deployment model, infrastructure
> component or operational procedure is currently supported by the platform. Current-state
> capabilities must be verified against authoritative project sources before implementation or
> publication as factual guidance.**

This boundary is enforced throughout by an explicit basis marker on every substantive claim:

| Marker | Meaning | Rule |
| :--- | :--- | :--- |
| **Design** | How the KMS *should* operate once this strategy is implemented. | Not yet true. Nothing here may be cited as current behaviour. |
| **Verified** | Confirmed against this repository at the commit this document was written. Every Verified claim names its evidence. | May be cited. Re-verify before relying on it after substantial change. |
| **Example** | Included only to demonstrate the proposed model. | **Never** a statement that the platform does this. Must not be converted into a Verified fact without evidence. |

A table with a **Basis** column uses `D` / `V` / `E` for the same three values.

**This task is strategy and design only.** It deliberately does **not** restructure, move, rename,
delete or migrate any existing documentation. Section 24 defines the follow-on implementation
sequence that does that work, under a separate SDD slice, against this document once approved.

---

## 1. Purpose, scope and non-goals

### 1.1 Purpose

To answer, in one internally consistent place:

1. Who uses the KMS?
2. Where does each audience start?
3. How is information organised and discovered?
4. What document types exist and what is each for?
5. Which source is authoritative for each kind of information?
6. How is documentation owned and maintained?
7. How are current and historical knowledge distinguished?
8. How are deployment options and operational procedures documented?
9. How does someone onboard into their role?
10. How will a future change determine which documentation must change?
11. How will the SDD process enforce this standard?
12. How can humans and AI agents find the *minimum* authoritative information they need?

### 1.2 Naming

**Verified** — this repository is the multi-tenant grocery platform whose first and longest-live
tenant is **Aheed Food Centre**; **SriMart** is a *second tenant* on the same platform, live on its
own host (`specs/decisions/ADR-004-multi-tenancy.md` — "the two live vendors sit on distinct hosts —
Aheed at the apex … SriMart on its own `srimart.nocaped.com`"). SriMart is therefore **not** the
name of the platform or of this KMS.

The commissioning request for this document referred throughout to "the SRIMART KMS". This document
uses the neutral term **the platform** and does not adopt either tenant name for the KMS. Resolving
what the KMS and the platform are actually called is **unresolved decision U1** (section 25).

### 1.3 Scope

In scope: the target state of the KMS — audiences, visibility, information architecture, document
taxonomy, metadata, source-of-truth, ownership, lifecycle, navigation, deployment documentation,
runbook standard, CI governance, documentation impact assessment, SDD integration, AI readiness, and
the sequence by which the current KMS is migrated onto this standard.

### 1.4 Non-goals for this document

- No restructuring, moving, renaming or deleting of existing documentation.
- No migration of front-matter on existing documents.
- No modification of the SDD workflow, its slash commands, or `.github/workflows/`.
- No KMS site UI implementation.
- No inventory or gap analysis of the current KMS — that is step 2 of section 24.

---

## 2. Verified current state

This section exists so that the rest of the document can be read as *design* without ambiguity. It
is the measured baseline the strategy corrects. Every figure was taken from this repository at the
commit this document was written; re-measure before acting on any of it.

### 2.1 What exists and works

| Fact | Evidence | Basis |
| :--- | :--- | :--- |
| A single-source KMS: docs live once in `specs/`, `docs/`, `CLAUDE.md` and are *copied* into site content by a build step; bodies are never hand-duplicated. | `kms/scripts/assemble.ts` | V |
| Front-matter schema in zod, with `id`, `title`, `audience`, `type`, `status`, `version`, `updated`, `visibility`, `summary`, `tags` required and `owner`, `related` optional. | `kms/schema/frontmatter.ts` | V |
| `track` is **derived** from `audience`, not declared, so it cannot disagree with audience. | `trackFor()`, `kms/schema/frontmatter.ts` | V |
| Three tracks exist: `internal-eng`, `staff-ops`, `customer-help`. | `kms/schema/frontmatter.ts` | V |
| `ARTIFACT_INDEX.md` and `app/(admin)/staff/runbook/docs.ts` are generated from front-matter, deterministically, and diffed in CI. | `kms/scripts/build-index.ts`, `GENERATED_ARTIFACTS` | V |
| CI runs `kms:validate` and `kms:check-generated` in `quality.yml`, so all three callers get the same checks. | `.github/workflows/quality.yml` lines 41–60 | V |
| The internal docs site is live on Cloudflare Workers behind a Cloudflare Access application (One-time PIN, allow-list) at `docs.internal.aheedfoodcentre.nocaped.com`; `workers_dev = false`. | `kms/site-internal/wrangler.toml`; `.github/workflows/deploy-docs-internal.yml` | V |
| Assembled content is grouped into per-`DocType` folders, producing a categorised sidebar. | `assemble.ts` `targetDir`; `#853` | V |
| A restructuring pilot has been run on one domain (orders / fulfilment / payment exceptions) with a source-to-destination ledger and a working register. | `specs/2026-09-22-kms-pilot-orders-fulfilment/requirements.md` | V |

### 2.2 What the measurements show

| Measurement | Value | Evidence | Basis |
| :--- | :--- | :--- | :--- |
| Markdown files scanned by `kms:validate` | 1,254 | `npm run kms:validate` | V |
| Files carrying valid KMS front-matter | **212** | same | V |
| Files carrying **no** front-matter (warned, non-blocking) | **1,042** | same | V |
| Of those, files under `specs/` | **403** | same, bucketed by path | V |
| Files with invalid front-matter (blocking) | 0 | same | V |
| Indexed artifacts by track | `internal-eng` 197 · `staff-ops` 12 · `customer-help` 3 | `ARTIFACT_INDEX.md` | V |
| Indexed artifacts by type | `spec` 165 · `doc` 28 · `guide` 7 · `runbook` 6 · `adr` 6 | `ARTIFACT_INDEX.md` | V |
| Declared types never used | `sop`, `faq`, `prompt` (0 each) | `ARTIFACT_INDEX.md` vs `DocType` enum | V |
| Indexed artifacts by status | `draft` 117 · `approved` 95 · `review` 0 · `deprecated` 0 | `ARTIFACT_INDEX.md` | V |
| Indexed artifacts by visibility | `internal` 211 · `public` **1** | `ARTIFACT_INDEX.md` | V |
| Documents carrying an `owner` | **1 of 212** | `grep -rl '^owner:' specs/ docs/` | V |
| Documents carrying `related` | 119 | same method | V |
| Documents carrying `tags` | 191 | same method | V |

### 2.3 What this baseline tells us

These are the eight problems the target design must solve. They are findings, not blame — most are
the predictable result of a schema that was designed before there was enough content to test it.

1. **The KMS sees 17% of the repository's Markdown.** 403 files under `specs/` — every slice's
   `requirements.md`, `validation.md` and `build-notes.md` — carry no front-matter and are invisible
   to validation, the index, search and AI retrieval. `kms:validate` reports them as a warning and
   passes. *A skip line is not a pass.*
2. **The taxonomy is not discriminating.** 165 of 212 documents are `spec` and 28 are the catch-all
   `doc`; three declared types have never been used. Type therefore carries almost no navigational or
   governance signal.
3. **`status` does not track reality.** 117 documents sit at `draft` and none at `review` or
   `deprecated`, on a platform where M0–P9 are in production. `draft` has become the default value
   rather than a lifecycle state.
4. **Ownership is declared but not practised.** 1 document in 212 names an owner, so no staleness or
   escalation mechanism can route to anyone.
5. **Visibility is doing two jobs.** `visibility` selects the *deploy target*; `audience` describes
   *who it is for*; and `track` is derived from audience. A `platform-admin`-only document currently
   derives to `internal-eng` because `trackFor()`'s cascade does not mention `platform-admin` — the
   cascade is not exhaustive over its own enum.
6. **The audience enum overlaps itself.** `customer` and `shopper` are synonyms; `admin`,
   `store-admin` and `platform-admin` are three overlapping values; and several real audiences
   (client, support, QA, DevOps, security) have no value at all.
7. **There is no public help centre.** `kms/site-public/` contains a single assembled content file
   and **no application, no build and no deploy workflow**; `kms:assemble:public` exists but nothing
   consumes it. Exactly one document repo-wide is `visibility: public`. The customer track is a
   design, not a deployment.
8. **KMS checks are non-blocking on both deploy paths.** `deploy-staging.yml` and
   `deploy-production.yml` both call `quality.yml` with `kms_blocking: false`. This is deliberate and
   correctly reasoned — by then the content has merged and failing the deploy cannot un-merge it —
   but it means the *only* blocking KMS enforcement is on the pull request.

### 2.4 What is explicitly not verified

The following appear nowhere in this repository and must not be described as platform capabilities:
a container image or Docker build (no `Dockerfile`); ephemeral per-PR preview environments (no
workflow creates one); a self-hosted or on-premises deployment; a multi-region disaster-recovery
failover; a third-party observability product; an issue tracker other than GitHub; a chat platform.
Version 1.0.0 of this document referenced several of these; section 26 records each conversion.

---

## 3. Principles

**Design.** Nine principles, in priority order. Where two conflict, the earlier wins.

1. **Single source, many surfaces.** A fact is authored once, in the place that owns it, and copied
   into every surface that needs it by a build step. Never by hand.
2. **Authority is per knowledge type, not global.** There is no single document, and no single
   system, that outranks all others. Section 11 assigns authority explicitly.
3. **Intent and implementation are different facts.** An approved requirement states intent; running
   code states behaviour. When they disagree the KMS records a *contradiction*, and the default
   reading is that the code has a defect — not that the requirement has silently changed.
4. **Audience before structure.** Navigation answers "who are you and what are you trying to do",
   never "where does this file live in the repository".
5. **Progressive disclosure.** Each audience sees a small, complete surface. Depth is reachable, not
   imposed.
6. **Everything has an owner.** An unowned document is a defect, not a document.
7. **Current, superseded and historical are distinct and always visible.** A reader must never have
   to guess which they are looking at.
8. **Generate, do not maintain.** Navigation, indexes and cross-references are derived from
   metadata. A hand-maintained second index will drift; two have already.
9. **Enforceable or advisory, declared.** Every rule in this standard states whether CI enforces it.
   A rule nothing enforces is a convention, and is labelled as one.

---

## 4. Audience model

**Design.** *Audience* answers **who is this written for**. It is independent of *visibility*, which
answers **who is permitted to read it** (section 5).

### 4.1 Recommended audience vocabulary

| Audience value | Who they are | Status vs today |
| :--- | :--- | :--- |
| `customer` | Shoppers using a storefront. | Keep. **Retire `shopper` as a synonym.** |
| `client` | The tenant business and its stakeholders — commercial, not operational. | **New.** |
| `store-admin` | Manages one tenant's catalogue, pricing, delivery rules, staff. | Keep. |
| `platform-admin` | Operates the multi-tenant platform: onboarding tenants, global settings. | Keep. |
| `staff` | Fulfilment and shop-floor operators. | Keep. |
| `support` | Handles customer contacts, refunds, escalations. | **New.** |
| `product` | Product owners and business analysts. | Keep. |
| `delivery` | Project / delivery management: sequencing, phases, the board. | **New.** |
| `design` | UX and UI. | Keep. |
| `dev` | Engineers building the platform. | Keep (do **not** rename to `developer` — 187 documents use `dev`). |
| `qa` | Testers and validation authors. | **New.** |
| `devops` | Build, deploy, infrastructure. | **New.** |
| `operations` | Running the live service: monitoring, incidents, business operations. | Keep. |
| `security` | Security, compliance and audit. | **New.** |
| `architect` | Architectural authority. | Keep. |
| `marketing` | Campaigns and analytics. | Keep. |
| — | `admin` | **Retire** — ambiguous between store and platform admin. |

**Recommendation: do not add an `ai-agent` audience.** An AI agent reads on behalf of a role; the
value would end up on nearly every document and would therefore discriminate nothing. AI agents are
served instead by the metadata in section 10 and the retrieval contract in section 22, plus one
`start-here` document addressed to them. This is a deliberate departure from the commissioning
request, offered for approval as **U6**.

### 4.2 Track derivation

**Design.** `track` remains **derived**, never declared — that property is correct today and must be
kept, because a declared track can disagree with audience and a derived one cannot.

Two corrections are required:

1. The derivation must be **exhaustive over the audience enum**, with a compile-time exhaustiveness
   check, so that adding an audience value cannot silently fall through to `internal-eng` — which is
   what happens to `platform-admin` today.
2. Derivation must use **first match against an explicit ordered list**, and that list must be
   stated in the schema file next to the enum, not inferred from the order of `if` statements.

**Design — recommended track set.** Four tracks, one more than today:

| Track | Audiences | Surface |
| :--- | :--- | :--- |
| `customer-help` | `customer` | Public help centre |
| `client` | `client`, `store-admin` | Tenant-facing portal |
| `staff-ops` | `staff`, `support`, `operations`, `platform-admin` | Internal site, staff section |
| `internal-eng` | `dev`, `qa`, `devops`, `design`, `product`, `delivery`, `architect`, `security`, `marketing` | Internal site, engineering section |

A document with audiences spanning tracks resolves to the **most restrictive** track its audience
list touches, and CI warns — because a document that serves both customers and engineers is almost
always two documents.

---

## 5. Visibility and access model

**Design.** *Visibility* answers **who is permitted to access this**. It must map onto a control
that actually exists, or it enforces nothing.

### 5.1 Recommendation: three values now, five later

The commissioning request proposed `public | client | staff | engineering | restricted`. Assessed
against the platform's verified surfaces, that model has five values and **two** enforcement points
(the public internet, and one Cloudflare Access application covering the whole internal site). Three
of the five values would be indistinguishable in practice, which is worse than not having them —
authors would treat visibility as advisory.

**Recommended model — adopt now:**

| Value | Meaning | Enforcement | Basis |
| :--- | :--- | :--- | :--- |
| `public` | Anyone on the internet may read it. | Assembled only into the public site. | D |
| `internal` | Anyone the organisation admits may read it. | Assembled into the internal site, which is gated by Cloudflare Access. | V (gate exists) / D (the rule) |
| `restricted` | Must not be assembled into **any** site. Lives in the repository, read via the repository only. | Build-time exclusion from every assemble target, asserted by a test. | D |

`restricted` earns its place because it is the one new value that is **enforceable today** with no
new infrastructure: a document marked `restricted` is excluded from every site build, and a test
proves no `restricted` document appears in any assembled content directory. That is a real control.

**Recommended model — adopt when, and only when, the trigger is met:**

| Value | Adopt when | Basis |
| :--- | :--- | :--- |
| `client` | A client/tenant-facing site or a distinct Access policy exists to serve it. | D |
| `staff` / `engineering` | Cloudflare Access **groups** gate sections of the internal site differently. | D |

Until a trigger is met, the distinction those values would carry is expressed by **audience**, which
already exists and already drives the sidebar. Splitting visibility ahead of the control is how a
taxonomy becomes decorative.

### 5.2 Rules

**Design.**

- `visibility` has **no default**. Omitting it is a validation failure. It must never default to
  `public`. (This property exists today and must be preserved — `visibility` is also the marker
  `kms:validate` uses to tell a KMS document from a Nextra page.)
- Visibility is **monotonic downward**: a `public` document may not link to an `internal` or
  `restricted` one as a required next step. CI checks this.
- Raising a document's visibility (`internal` → `public`) is a **reviewed change**, flagged in the PR
  by a CI annotation, because it is a disclosure.
- Secrets are never in the KMS at any visibility. `restricted` covers *privileged procedures*, not
  credentials. Credential values live in Cloudflare and GitHub environments
  (`docs/developer-portal/env-setup.md`) — **Verified**.

---

## 6. Audience → documentation map

**Design.** Read access below is expressed in the three-value model of section 5.1.

| Audience | Starts at | Primary track | Reads | Owns / writes |
| :--- | :--- | :--- | :--- | :--- |
| `customer` | `start-here/customer` | customer-help | public | nothing |
| `client` | `start-here/client` | client | public, internal | commercial requirements (via `product`) |
| `store-admin` | `start-here/store-admin` | client | public, internal | tenant configuration records |
| `platform-admin` | `start-here/platform-admin` | staff-ops | public, internal | platform configuration, tenant onboarding |
| `staff` | `start-here/staff` | staff-ops | public, internal | SOPs for their own tasks |
| `support` | `start-here/support` | staff-ops | public, internal | support SOPs, FAQs, troubleshooting |
| `product` | `start-here/product` | internal-eng | public, internal | specs, roadmap input, requirements |
| `delivery` | `start-here/delivery` | internal-eng | public, internal | phase and milestone records |
| `design` | `start-here/design` | internal-eng | public, internal | design system, UX guidance |
| `dev` | `start-here/developer` | internal-eng | public, internal | specs, ADRs, references, runbooks |
| `qa` | `start-here/qa` | internal-eng | public, internal | validation criteria, regression references |
| `devops` | `start-here/devops` | internal-eng | public, internal | deployment guides, runbooks, config references |
| `operations` | `start-here/operations` | staff-ops | public, internal | operational runbooks, incident records |
| `security` | `start-here/security` | internal-eng | public, internal, restricted | security references, privileged procedures |
| `architect` | `start-here/developer` | internal-eng | all | ADRs, architecture |
| AI agents | `start-here/ai-agent` | inherits the role it acts for | filtered by the role's visibility | generated indexes only |

**Design.** An AI agent never has *broader* read access than the human role it is acting for. When an
agent's role is unknown, it is treated as the **most restrictive** role: `public` only.

---

## 7. Start Here pages and the onboarding model

**Design.** Every audience in section 4.1 has exactly one `start-here` document. It is the only
document whose *location* a person needs to know.

### 7.1 The mandatory Start Here template

Every `start-here` document answers these ten questions **in this order**, each under its own
heading, so that the shape is identical across audiences and an AI agent can parse any of them with
one template:

1. **What is the platform?** — two paragraphs, linked to the canonical overview, not restated.
2. **What does my role do here?** — one paragraph, scoped to this KMS.
3. **What access do I need?** — a checklist of accounts, systems and approvals, each naming who
   grants it.
4. **What should I read first?** — at most **five** links, ordered, each with a one-line reason.
5. **What should I learn next?** — the second tier, explicitly not required on day one.
6. **What common tasks will I perform?** — a table of task → procedure, drawn from section 7.3.
7. **Where are the procedures?** — link to the audience's `sop` / `runbook` / `guide` set.
8. **Where do I find troubleshooting?** — link to the audience's `troubleshooting` set.
9. **Who owns and supports this area?** — the owner value, and the escalation path.
10. **How do I know onboarding is complete?** — a **verifiable** completion test, not a feeling.

**Design.** Rule: item 4 is capped at five links and item 10 must be objectively checkable. Both caps
are what stop a Start Here page from becoming another index.

### 7.2 Onboarding is defined for every audience, not just developers

**Design.** Minimum onboarding coverage is required for: customer, client, staff, store-admin,
platform-admin, support, developer, QA, product/BA, devops/operations. The remaining audiences
(design, delivery, security, architect, marketing) require a Start Here page but may defer a full
completion test until their first named owner exists.

Completion tests differ by audience and must be checkable:

| Audience | Completion test shape | Basis |
| :--- | :--- | :--- |
| Customer | Has placed a first order and can find order status unaided. | E |
| Client | Can read their own performance reporting and knows their escalation contact. | E |
| Staff | Has completed one full fulfilment cycle on a training order under supervision. | E |
| Store admin | Has added a product, set a price and configured one delivery rule. | E |
| Platform admin | Has walked a tenant onboarding end to end on staging. | E |
| Developer | Local environment runs, the full test suite passes locally, and one PR has been opened. | E |
| QA | Has executed one slice's `validation.md` and reported the outcome. | E |
| Product / BA | Has written one requirements document that passed spec review. | E |
| DevOps / operations | Has executed one runbook end to end, including its verification step. | E |
| Support | Has resolved one contact of each category in the support taxonomy. | E |

Every row above is an **illustrative example** of the required *shape*. The real completion tests
are written during implementation by each area's owner.

### 7.3 Role → task → procedure mapping

**Design — the required shape.** Every audience's Start Here page carries a table of this form,
populated during implementation from real, existing controls:

```text
Goal / Task  →  Decision guide (if options exist)
             →  Procedure   (sop | runbook | guide)
             →  Verification (how you know it worked)
             →  Troubleshooting
             →  Reference
             →  Owner / escalation
```

**Design.** Rule, carried over from the staff-panel convention in `CLAUDE.md` and generalised: *no
test checks whether a documented capability exists*, so **every task row must be traced to a real
control before it is published**. A row naming a procedure that does not exist is a defect of the
same class as a documented staff capability with no control behind it.

---

## 8. Information architecture

**Design.** The repository keeps its single-source layout. The *rendered* KMS presents four
audience tracks, and no reader is shown the repository's physical structure unless they ask for it.

```text
KMS (single repository, many rendered surfaces)
│
├── Public surface  ── track: customer-help
│   ├── Start Here: Customer
│   ├── Guides · FAQs · Troubleshooting
│   └── Release notes (customer-facing)
│
├── Client surface  ── track: client
│   ├── Start Here: Client · Store Admin
│   ├── Store configuration & administration
│   ├── Deployment decision guide (client-relevant options only)
│   └── Release notes (client-facing)
│
├── Internal surface, Staff & Operations section  ── track: staff-ops
│   ├── Start Here: Staff · Support · Operations · Platform Admin
│   ├── SOPs · Runbooks · Troubleshooting
│   └── Incident and escalation procedures
│
├── Internal surface, Engineering section  ── track: internal-eng
│   ├── Start Here: Developer · QA · DevOps · Product · Design · Delivery · Security · AI agent
│   ├── Architecture · ADRs
│   ├── Specifications (current) · Specifications (historical)
│   ├── References · Configuration references
│   ├── Deployment guides · Runbooks
│   └── Roadmap · Release notes
│
└── Restricted  ── visibility: restricted
    └── Privileged operational procedures (repository only; never assembled)
```

**Design.** Three structural rules:

1. **Physical path is never the navigation path.** The sidebar is generated from `track` → `type` →
   `title`, as it already is for type today (**Verified**, `#853`).
2. **A section is complete or it does not exist.** An empty track renders as "not yet published"
   with a named owner, never as an empty folder. The customer track is in exactly this state today.
3. **Depth is capped at four levels** in any rendered surface: track → section → type → document.

---

## 9. Document taxonomy

**Design.** A document type earns its place only if it changes at least one of: **the template**,
**the review cadence**, or **where it appears in navigation**. Types that fail all three are tags,
not types. Applying that test to the fourteen candidates in the commissioning request yields
**thirteen types**, of which four are new, and three candidates are rejected with reasons.

### 9.1 Recommended taxonomy

| Type | Purpose | Primary audience | Owner | Authoritative or derived | Lifecycle | Review cadence |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `start-here` | The single entry point for one audience. | one audience | that audience's owner | derived | living | 6 months, or on any audience change |
| `guide` | Narrative how-to for using the product. | customer, client, store-admin | area owner | derived | living | 6 months |
| `faq` | Short answers to recurring questions. | customer, client | support | derived | support | 6 months |
| `sop` | Standard operating procedure for a **human** task. | staff, support, operations | operations | authoritative for the procedure | living | 3 months |
| `runbook` | Executable procedure for a **system** operation. | devops, operations | devops | authoritative for the procedure | living | **3 months** |
| `troubleshooting` | Symptom → cause → fix, for a bounded area. | any | area owner | derived | living | 3 months |
| `deployment-guide` | What the options are, what each requires, which to choose. | devops, client, platform-admin | devops | derived (from ADRs + infra) | living | on every infrastructure change |
| `spec` | Requirements, plan and validation for one delivery slice. | dev, product, qa | slice author | authoritative for **intent at approval**, then historical | frozen at ship | none — frozen |
| `adr` | A decision, its context and consequences. | dev, architect | architect | **authoritative** for the decision | immutable; superseded, never edited | on supersession only |
| `reference` | Stable descriptive knowledge: architecture, data model, conventions, domain. | dev, qa, product | area owner | derived from the authoritative source it names | living | 6 months |
| `configuration-reference` | Every setting: name, required, default, where set, who owns, what breaks. | devops, dev | devops | derived from `lib/config` | living | on every config change |
| `release-note` | What changed in one release, per audience. | customer, client, staff, dev | delivery | historical the moment it publishes | immutable | none |
| `roadmap` | Sequenced future intent. | product, delivery, client | product | authoritative for intent; the board is authoritative for status | living | every slice |

### 9.2 Rejected candidates, with reasons

| Candidate | Verdict | Reason |
| :--- | :--- | :--- |
| `security` | **Reject as a type.** | Security is a *topic*, not a document shape. A security document is a `reference`, a `runbook`, an `adr` or a `spec`. Express it as `tags: [security]` plus `audience: [security]`, which also makes every security-relevant document discoverable in one filter regardless of its shape. |
| `historical` | **Reject as a type.** | "Historical" is a *lifecycle state*, not a shape. A superseded ADR is still an ADR. Express it as `status: superseded` / `status: archived` plus `superseded_by` (section 13). Making it a type would mean rewriting a document's `type` as it ages, destroying the ability to ask "show me every ADR". |
| `doc` | **Retire.** | The current catch-all, 28 uses. Every one resolves to `reference`, `guide` or `start-here`. Retiring it is the single highest-value taxonomy change, because `doc` is what currently makes type useless for navigation. |
| `prompt` | **Retire for now.** | Declared in the enum, never used, and its source directory `kms/prompts/` does not exist (**Verified**). Re-add when a prompt library actually exists. |
| `shopper` (audience) | **Retire.** | Synonym of `customer`. |

### 9.3 Type-to-template binding

**Design.** Each type has one template with required sections, stored under `specs/templates/` — a
directory that already exists and is already excluded from validation because its placeholders are
deliberately invalid (**Verified**, `kms/schema/repo.ts`). CI validates that a document of a given
type carries that type's required headings. This is what makes "avoid a generic classification"
mechanically true rather than a convention.

---

## 10. Metadata schema

**Design.** Every field must earn its place by supporting **governance** (who is accountable, is it
current, may it be published) or **discovery** (can the right reader or agent find it). Fields
supporting neither are removed.

### 10.1 Recommended front-matter

| Field | Why it exists | Required? | Allowed values | CI validates? |
| :--- | :--- | :--- | :--- | :--- |
| `id` | Stable identity independent of path; the assembled filename; the link target for `related`. | **Required** | `^[a-z0-9-]+$`, unique repo-wide | **Yes** — format **and uniqueness** |
| `title` | Human label in navigation, index and search. | **Required** | ≥ 3 chars | Yes |
| `summary` | One to two sentences. Doubles as the retrieval description an AI agent reads *instead of* the body. | **Required** | 20–300 chars | Yes |
| `type` | Drives template, navigation placement and review cadence. | **Required** | section 9.1 enum | Yes |
| `audience` | Who it is written for; drives track and filtering. | **Required** | section 4.1 enum, ≥ 1 value | Yes |
| `visibility` | Who may read it; selects the deploy target. **No default, ever.** | **Required** | `public` · `internal` · `restricted` | Yes |
| `status` | Lifecycle state; drives retrieval weight and warning banners. | **Required** | section 13.1 enum | Yes |
| `owner` | The accountable team or role. Routes staleness alerts and escalation. | **Required** *(promoted from optional)* | a value from a checked-in owner registry | **Yes** — including that the owner exists |
| `updated` | Last substantive edit. Freshness signal. | **Required** | ISO `YYYY-MM-DD` | Yes |
| `last_reviewed` | Last time someone **confirmed it is still correct** without necessarily editing it. Distinct from `updated`: this is the only field that makes a staleness check meaningful. | **Required** for `sop`, `runbook`, `troubleshooting`, `configuration-reference`, `deployment-guide`; optional otherwise | ISO `YYYY-MM-DD`, not in the future | Yes, conditionally by type |
| `created` | Historical ordering; age independent of edits. | Optional | ISO `YYYY-MM-DD` | Format only |
| `tags` | Cross-cutting topics that are not types — `security`, `payments`, `multi-tenancy`. | Optional, defaults `[]` | free text, lower-kebab; a checked-in vocabulary warns on unknown tags | Format; unknown tags warn |
| `related` | Builds the knowledge graph; powers "see also" and AI neighbour expansion. | Optional | `id` values | **Yes** — every value must resolve |
| `source_of_truth` | The document's **standing**: does it hold the fact, or repeat it? This is what makes section 11 enforceable per document rather than only as a table. | **Required** | `authoritative` · `derived` · `historical` | Yes |
| `canonical_source` | Where the fact actually lives, when `source_of_truth: derived`. A path, an `id`, or a named system. | **Required when `derived`** | path, `id`, or registry key | Yes, conditionally |
| `supersedes` | Backward supersession link. | Optional | `id` values | Yes — must resolve |
| `superseded_by` | Forward supersession link. **Required when `status: superseded`.** | Conditional | `id` values | Yes — must resolve; must be reciprocal |
| `applies_to` | Which tenants or environments a document is true for, on a multi-tenant platform where a procedure may differ per tenant. | Optional; defaults to "all" | tenant slugs or environment names | Yes, against a known list |

### 10.2 Fields removed or demoted

| Field | Recommendation | Reason |
| :--- | :--- | :--- |
| `version` | **Demote to optional; stop requiring it.** | Currently required. **Verified:** 164 of 212 documents sit at `1.0.0` and the rest are incidental. Nothing consumes the number, `updated` plus git history carry the same information more reliably, and a required field that is copy-pasted trains authors to treat front-matter as ceremony. Keep it optional for `adr` and `release-note`, where an explicit revision is genuinely referenced. Offered as **U3** — it is a schema-narrowing change affecting 212 documents and a rendered index column. |
| `review_interval` | **Do not add.** | Derive the interval from `type` (section 9.1) in one table in the schema, rather than a per-document field that drifts and that nobody updates when a type's cadence changes. |
| `track` | **Never add as a declared field.** | Derived from `audience` today. A declared track can disagree with audience; a derived one cannot. This is an existing correct property to preserve. |

### 10.3 Worked example

**Example** — a runbook under the recommended schema. This is a demonstration of the *shape*; it is
not a claim that this runbook exists.

```yaml
id: rotate-neon-password
title: "Runbook — Rotate the Neon database password"
summary: "Rotate the Neon Postgres password and propagate it to both secret stores, with verification that the Worker picks up the new value."
type: runbook
audience: [devops, dev]
visibility: internal
status: approved
owner: platform-ops
updated: 2026-09-22
last_reviewed: 2026-09-22
source_of_truth: authoritative
tags: [database, secrets, neon]
related: [env-setup, adr-001-hosting]
applies_to: [staging, production]
```

---

## 11. Source-of-truth model

**Design.** Version 1.0.0 of this document said *"The Codebase: the actual database schema and
runtime logic rule supreme."* That is replaced. It is wrong in a way that causes real harm: it makes
every defect self-ratifying, because if code outranks requirements then code that violates an
approved requirement has, by definition, redefined it.

### 11.1 The three roles

Every piece of knowledge has up to three sources, and they are not ranked against each other — they
answer different questions:

| Role | Question it answers |
| :--- | :--- |
| **Authoritative source** | What is *supposed* to be true, or — for facts that only exist in a running system — what *is* true. Exactly one per knowledge type. |
| **Derived documentation** | Where that fact is explained for a human. Must cite the authoritative source. Must not restate a value the authoritative source owns. |
| **Historical evidence** | What was decided, when, and why. Never current. Never cited as current behaviour. |

### 11.2 Intent versus implementation

**Design.** Two distinct questions, never conflated:

- **Intended behaviour** — the approved requirement, specification or ADR.
- **Actual implementation** — the running code, schema and configuration.

When they disagree, the KMS records a **contradiction** with an issue reference, and the default
disposition is **the code has a defect**. Changing the intent requires a decision — a new ADR or an
approved spec — not an observation. Only an explicit, approved decision may retire a requirement.

This is exactly the discipline the orders/fulfilment pilot already applied: contradictions were
classified `Resolved` / `Superseded` / `Unresolved` in a working register rather than silently
reconciled (**Verified**, `specs/2026-09-22-kms-pilot-orders-fulfilment/requirements.md` R4).

### 11.3 The matrix

**Verified** for every path named below — each exists in this repository at the commit of writing.
**Design** for the assignment of role.

| Knowledge type | Authoritative source | Derived documentation | Historical evidence |
| :--- | :--- | :--- | :--- |
| Business requirements | `docs/business-analysis/product-requirements.md`, `specs/mission.md` | client guides, `start-here/client` | superseded requirement revisions |
| Product behaviour — intended | the approved slice `requirements.md` | guides, FAQs, release notes | earlier slices' requirements |
| Product behaviour — actual | the running code and its tests | `reference` documents | git history |
| UX / design | `specs/design-system.md` | `docs/design-ux/ux-guidelines.md` | superseded design specs |
| Architecture | `specs/architecture.md` | `docs/developer-portal/architecture-overview.md` | superseded architecture revisions |
| Architectural decisions | `specs/decisions/ADR-*.md` | architecture overview, `reference` docs | superseded ADRs |
| Technical implementation | the source code | `reference`, `docs/developer-portal/app-conventions.md` | specs, git history |
| Database / schema | `prisma/schema.prisma` + applied migrations | data-model `reference` documents | migration history |
| Configuration | `lib/config.ts` (the validated schema) | `configuration-reference` | superseded config references |
| Configuration **values** | Cloudflare secrets and GitHub environments; `secrets/*.vars` as the reconciliation reference | `docs/developer-portal/env-setup.md` | — (values are never historical evidence) |
| Security requirements | **no authoritative source exists today** — see gap G1, section 25 | — | — |
| Feature specifications | `specs/<date-slug>/requirements.md` | guides, SOPs, release notes | the slice directory, retained |
| Testing / validation | `tests/`, plus the slice's `validation.md` for slice-specific criteria | `docs/developer-portal/regression-tests.md` | prior validation results |
| Deployment | `.github/workflows/*.yml` and `wrangler.toml` | `deployment-guide`, `runbook` | superseded workflows in git |
| Operations | `docs/developer-portal/sdd/operator-runbook.md` | `start-here/operations` | incident records |
| Staff procedures | the `sop` document itself | `docs/staff-playbook/staff-tabs-guide.md` | superseded SOPs |
| Customer instructions | the `guide` document itself | FAQs | superseded guides |
| Client instructions | `docs/store-admin-guide/`, `docs/platform-admin-guide/` | FAQs, release notes | superseded guides |
| Support / troubleshooting | the `troubleshooting` document itself | FAQs | resolved incident records |
| Runtime failure modes | `docs/developer-portal/runtime-pitfalls.md` | `CLAUDE.md` rules (deliberately the rule without the evidence) | the slice that discovered each |
| Roadmap — intent | `specs/roadmap.md` | client-facing roadmap summaries | superseded roadmap revisions |
| Roadmap — delivery status | the GitHub delivery board (Project #2): Status, Priority, Phase | roadmap narrative | closed issues |
| Release information | `CHANGELOG.md` | `release-note` documents per audience | prior CHANGELOG entries |
| Historical decisions | superseded ADRs; `docs/research/milestone-retrospectives.md` | — | git history |
| Delivery process | `specs/sdd-workflow.md` and `.claude/commands/` | `CLAUDE.md` gate summary | superseded process revisions |

**Design.** Two rules follow from the matrix:

1. **Derived documentation cites, it does not copy.** A derived document may summarise and explain;
   it may not restate a value the authoritative source owns (a price, a limit, a variable name, a
   pin). Where a value must appear in a derived document, it is generated, not typed.
2. **`CLAUDE.md` is deliberately an exception and stays one.** It carries *the rule without the
   evidence* and points at the authoritative document for each area (**Verified** — that is its
   stated design). It is `source_of_truth: derived` with many canonical sources, and the one document
   permitted to restate rules, because its job is to be loaded when nothing else is.

---

## 12. Ownership model

**Design.**

- `owner` becomes **required** (section 10.1). Today 1 document in 212 carries one (**Verified**),
  which means no staleness or escalation mechanism can route anywhere.
- Owners are **roles or teams**, never individuals — an individual's departure must not orphan a
  document.
- Valid owners come from a **checked-in owner registry** listing, for each owner: the role, its
  escalation contact, and the areas it covers. CI validates `owner` against that registry, so a
  typo'd or retired owner fails the build rather than silently disabling alerts.
- The owner is accountable for: responding to staleness alerts within the type's review cadence;
  approving changes to documents they own; and re-homing documents when a team dissolves.
- **An unowned area is escalated, not defaulted.** If a registry entry is removed while documents
  still reference it, CI fails and names them. There is no silent fallback owner — a silent fallback
  is how ownership became decorative in the first place.

---

## 13. Lifecycle, supersession and historical knowledge

### 13.1 Status values

**Design.** Six values, extending today's four:

| Status | Meaning | Indexed? | AI retrieval | Rendered banner |
| :--- | :--- | :--- | :--- | :--- |
| `draft` | Being written. Not yet reviewed. | yes, marked | de-prioritised | "Draft — not approved" |
| `review` | Under review; awaiting approval. | yes, marked | de-prioritised | "Under review" |
| `approved` | Current and authoritative for its scope. | yes | normal | none |
| `deprecated` | Still true but being retired; a replacement may not exist yet. | yes, marked | strongly de-prioritised | "Deprecated — do not build on this" |
| `superseded` | Replaced by a specific newer document. `superseded_by` required. | yes, marked | excluded unless explicitly requested | "Superseded by *X*" with a link |
| `archived` | Retained as evidence only. Removed from active navigation. | index only | excluded unless explicitly requested | "Archived — historical evidence" |

**Design.** `draft` must stop being the default. **Verified:** 117 of 212 documents are `draft` and
zero are `review` or `deprecated`, on a platform with M0–P9 in production. The migration must set a
real status per document, and thereafter CI warns when a `draft` document has been unchanged for
longer than its type's review cadence.

### 13.2 The six knowledge categories

**Design.** Section 14 of the commissioning request asks these be distinguished. They map onto the
model above without a new mechanism:

| Category | Expressed as |
| :--- | :--- |
| Current authoritative knowledge | `status: approved` + `source_of_truth: authoritative` |
| Current supporting documentation | `status: approved` + `source_of_truth: derived` + `canonical_source` |
| Derived user-facing documentation | the above, with `visibility: public` and a customer/client audience |
| Superseded documentation | `status: superseded` + `superseded_by` |
| Historical evidence | `source_of_truth: historical` — typically a shipped `spec` or a `release-note` |
| Archived material | `status: archived` |

### 13.3 How supersession works

**Design.**

1. Supersession is **declared on both documents**: the new one carries `supersedes: [old-id]`, the
   old one `superseded_by: [new-id]` and `status: superseded`. CI validates **reciprocity** — a
   one-sided link fails the build.
2. **A superseded document is never edited to say something new** and never deleted. Its content is
   the evidence. Only its front-matter changes.
3. **ADRs are superseded, never rewritten.** ADR-001 already demonstrates this — it revises the
   hosting decision and records what it supersedes (**Verified**).
4. **Shipped specs become historical automatically.** When a slice ships, its `spec` documents move
   to `source_of_truth: historical`. They are not superseded — nothing replaces them — they simply
   stop being a statement about current behaviour. This is the distinction the current KMS lacks, and
   it is why 165 `spec` documents currently read as if they were all current.
5. **Existing specs are never relocated or restructured** to achieve this. Front-matter only. This
   preserves the pilot's constraint (**Verified**, R8) permanently, not just for the pilot.

---

## 14. Navigation and discovery

**Design.** Discovery has four entry modes, and every document is reachable by at least two.

| Mode | Mechanism | Generated from |
| :--- | :--- | :--- |
| **I know who I am** | Track landing page → Start Here | `track` (derived from `audience`) |
| **I know what I want to do** | Task-based index per audience | the Start Here task table |
| **I know what it's called** | Search with facets | `title`, `summary`, `tags`, body |
| **I'm exploring from here** | Related documents, breadcrumbs, tag pages | `related`, `tags`, track/type |

### 14.1 Required on every rendered page

**Design.** Each of these is generated from front-matter; none is hand-maintained.

- Breadcrumb: track → section → type → title.
- **Status banner** when status is not `approved` (section 13.1).
- **Source-of-truth indicator**: "Authoritative for X" or "Derived — canonical source: *Y*" with a
  link. This is the single highest-value addition for both human and AI readers, because it answers
  "can I trust this page" without reading it.
- **Owner and escalation**, from the owner registry.
- **Last reviewed**, with a visual staleness cue once past the type's cadence.
- **Audience chips** and **type chip**, both clickable as filters.
- **Related documents**, resolved from `related`.

### 14.2 Faceted search

**Design.** Filterable by `audience`, `type`, `status`, `track`, `tags`, `owner`, and freshness. A
reader on the public surface can only ever filter within `visibility: public` — the facet index is
built per surface, not filtered at query time, so a restricted title cannot leak through a facet
count.

### 14.3 The Artifact Index is governance, not navigation

**Design.** `ARTIFACT_INDEX.md` stays exactly as it is: generated, deterministic, diffed in CI, and
the complete governance ledger (**Verified**). It is **not** the primary human navigation experience
and must not be linked as one. Its audiences are CI, governance review and AI agents performing a
whole-corpus survey.

**Design.** "Recently changed" is a generated view over `updated`, per surface, so each audience sees
what changed *for them* — not a repository-wide commit list.

---

## 15. Deployment documentation standard

**Design.** Deployment is a first-class KMS domain with its own track section, its own types
(`deployment-guide`, `runbook`, `configuration-reference`), and its own owner.

### 15.1 Deployment models must be discovered, then classified

**Design.** The implementation phase **discovers** which deployment models the platform actually
supports and classifies each. No model may be documented as available on the strength of being
conventional.

| Classification | Meaning | Documentation obligation |
| :--- | :--- | :--- |
| **Supported** | Works, is used, is maintained, has a named owner. | Full set, section 15.2 |
| **Experimental** | Works but is unproven or unsupported in production. | Intended use, prerequisites, known limits, owner — and a prominent warning |
| **Planned** | Decided but not built. | The decision (an ADR) and the intended shape only |
| **Deprecated** | Works, being retired. | Full set, plus the migration path off it and a removal date |
| **Unsupported** | Explicitly not available. | **One line saying so**, and why, so the question stops recurring |

**Design.** Documenting the *unsupported* models is as important as documenting the supported ones.
A reader who cannot find out that on-premises deployment is unavailable will assume it is available
and undocumented.

### 15.2 Required documentation per supported model

**Design.** For each **Supported** deployment model, the KMS must carry, each traced to a real
control:

Intended use · Architecture · Prerequisites · Infrastructure · Dependencies · Installation ·
Configuration · Environment variables · Secrets · Database · Migrations · Seed and reference data ·
Deployment · Verification · Monitoring · Logging · Upgrade · Rollback · Backup · Restore ·
Troubleshooting · Disaster recovery · Security · Ownership and escalation.

**Design.** Where an item does not apply, the document says **"not applicable, because …"**. It is
never silently omitted — an absent heading is indistinguishable from an unwritten one.

### 15.3 The current inventory, classified

**Verified** classification as of this document. It is the *input* to the discovery step in 15.1, not
a substitute for it.

| Model | Classification | Evidence | Basis |
| :--- | :--- | :--- | :--- |
| Local development (`npm run dev`) | **Supported — UI work only** | `package.json`; `CLAUDE.md`: `next dev` cannot load the WASM engine and silently renders an error state | V |
| Local Worker preview (`npm run preview`) | **Supported — required for DB-touching work** | `package.json`: `opennextjs-cloudflare build && … preview` | V |
| Staging Worker | **Supported** | `wrangler.toml` `[env.staging]`; `.github/workflows/deploy-staging.yml` | V |
| Production Worker | **Supported** | `wrangler.toml` `[env.production]`; `.github/workflows/deploy-production.yml` | V |
| Internal KMS docs Worker | **Supported** | `kms/site-internal/wrangler.toml` (route live 2026-08-08, behind Access); `deploy-docs-internal.yml` | V |
| Public KMS help centre | **Planned — not built** | `kms:assemble:public` exists; `kms/site-public/` holds content only — **no application, no build, no deploy workflow** | V |
| Ephemeral per-PR preview environment | **Unsupported** | no workflow creates one. v1.0.0 of this document listed this as "Experimental … triggered via GitHub Actions" — that was an assumption | V (absence) |
| Container / Docker deployment | **Unsupported** | no `Dockerfile`, no compose file | V (absence) |
| Self-hosted / on-premises | **Unsupported** | no artifact; ADR-001 selects Cloudflare Workers + Neon | V (absence) |
| Multi-region DR failover | **Unverified** | no artifact in this repository describes one | V (absence) |

**Design.** Each row above becomes a `deployment-guide` entry in the implementation phase, including
the four unsupported ones — one line each.

---

## 16. Deployment decision guide

**Design.** The KMS must let a reader answer: *how can the platform be deployed, what are my
options, and which applies to me?*

```text
I need to deploy the platform
            ↓
  Choose scenario  ── what am I actually trying to do?
            ↓
  See supported options  ── with unsupported options listed and ruled out
            ↓
  Compare requirements and trade-offs
            ↓
  Select deployment model
            ↓
  Environment requirements
            ↓
  Installation / configuration
            ↓
  Deploy
            ↓
  Verify
            ↓
  Monitor
```

**Design.** The guide must state, at the point of choice, which options are **not** available and
why. Unsupported options are shown and struck through, never omitted.

**Example** — the shape of a scenario table, populated during implementation from whatever section
15.1's discovery actually finds:

| "I need to…" | Then go to | Because |
| :--- | :--- | :--- |
| build UI with no database access | local development | fastest loop |
| verify anything touching the database | local Worker preview | the dev server cannot load the database engine |
| validate a change before release | staging | closest deployed equivalent to production |
| release to customers | production | the live surface |
| host the platform on my own infrastructure | *no supported option* | see the unsupported models list |

---

## 17. The deployment lifecycle

**Design.** Deployment documentation covers the whole lifecycle, not installation. Each stage names
its owner and its verification step.

```text
Choose → Provision → Install → Configure → Deploy → Verify → Monitor
       → Maintain → Upgrade → Migrate → Rollback → Backup → Restore
       → Disaster Recovery → Decommission
```

**Design.** Per-stage requirements:

| Stage | Must document | Must be verifiable |
| :--- | :--- | :--- |
| Choose | the decision guide (section 16) | the chosen model is in the Supported list |
| Provision | every resource that must exist first, and who creates it | the resource exists |
| Install | build and dependency steps | the build succeeds |
| Configure | every setting, its source, and its owner | configuration validates |
| Deploy | the exact command or trigger, and its ordering constraints | the deploy reports success |
| Verify | a positive check that proves the *right* thing is live | an observable signal, not the absence of an error |
| Monitor | what is watched, what the thresholds are, who is paged | the signal is visible |
| Maintain | routine tasks and their cadence | the task's own verification |
| Upgrade | version-to-version steps and breaking changes | post-upgrade verification |
| Migrate | data and schema migration, including ordering against deploy | migration state is queryable |
| Rollback | how to get back, and what is *not* reversible | the previous state is live |
| Backup | what is backed up, how often, where, retention | a backup exists and is recent |
| Restore | the restore procedure, **and when it was last rehearsed** | a rehearsal record |
| Disaster recovery | RTO/RPO if defined, the decision to invoke, the procedure | a rehearsal record |
| Decommission | tear-down order, data retention, DNS and secret cleanup | resources are gone and secrets revoked |

**Design.** Two rules that exist because this platform has already been bitten by their absence:

- **Verification must be positive.** "No error" is not verification. A verification step names an
  observable that proves the intended state — the pattern already used in this repository, where a
  production health endpoint is checked for the deployed commit and database reachability
  (**Verified**, `CHANGELOG.md` release entries).
- **Ordering constraints are documented as constraints, not as prose.** Where a stage must precede
  another, the document says so in the imperative and names the consequence of reordering. Example
  from this repository: both deploy workflows build *before* they migrate, and `CLAUDE.md` records
  "Do not reorder" (**Verified**).

---

## 18. Runbook standard

**Design.** A runbook is an **executable procedure**, not an explanation. Architecture prose in a
runbook is a defect: it delays the operator and buries the step.

### 18.1 Required structure

Every `runbook` carries these headings, in this order. CI validates their presence.

```text
Purpose               — one sentence: what this achieves
Scope                 — what it covers, and explicitly what it does not
Owner                 — from the owner registry
Risk / Impact         — blast radius; is this customer-visible; is it reversible
Required Access       — accounts, roles, approvals; who grants each
Prerequisites         — tools, versions, state that must already hold
Pre-checks            — commands proving it is safe to start; expected output
Procedure             — numbered, copy-pasteable, one action per step
Expected Result       — what each step should print or produce
Verification          — a positive check that the goal was achieved
Post-checks           — that nothing adjacent broke
Failure Conditions    — how you know it went wrong, per step
Rollback              — how to get back; what is NOT reversible
Troubleshooting       — known failure modes → cause → fix
Escalation            — who to contact, at what threshold, by what route
Related Documentation — canonical sources; never a restatement of them
```

### 18.2 Rules

**Design.**

1. **Action-oriented title.** An imperative verb: "Rotate the database password", not "Database
   password rotation".
2. **One action per step.** A step that does three things cannot be resumed after failing at the
   second.
3. **Every command shows its expected output.** An operator who cannot tell success from failure has
   no procedure.
4. **Rollback is mandatory** — and where something is genuinely irreversible, the runbook says so
   explicitly at the top, under Risk.
5. **Safe to follow under pressure.** No step requires judgement the document has not supplied. A
   decision point is a numbered branch, not a paragraph.
6. **Explanation lives elsewhere.** Background goes in a `reference` and is linked from Related
   Documentation.
7. **Reviewed every 3 months** (section 9.1), tracked by `last_reviewed`, routed to `owner`.
8. **A runbook that has never been executed is `draft`.** Approval requires one successful end-to-end
   execution, recorded.

### 18.3 SOP versus runbook

**Design.** A `runbook` is a **system** operation, executed by devops or operations, usually with a
terminal. An `sop` is a **human** task, executed by staff or support, usually in the admin UI. They
share the structural spine above but differ in template: an SOP substitutes "Required Access" with
the specific panel and permission, and "Expected Result" with what the operator should see on screen.
**Verified:** the `sop` type is declared today and has never been used, while staff procedures live
inside guide-shaped documents. Correcting that is migration work, not a new type.

---

## 19. Automation and CI governance

**Design.** The governing principle stays: **generate, do not maintain**. Two hand-maintained
indexes have already drifted in this repository; the fix was to derive both from one generator's own
exported file list (**Verified**, `GENERATED_ARTIFACTS`, `#537`). Every new index must follow that
pattern — one generator, one exported list, checkers deriving their file list from it.

### 19.1 Validation matrix

| Check | Target | Severity | Exists today? |
| :--- | :--- | :--- | :--- |
| Required metadata present | all | fail | **Yes** (`kms:validate`) |
| `type` in enum | all | fail | **Yes** |
| `audience` in enum | all | fail | **Yes** |
| `visibility` in enum, never defaulted | all | fail | **Yes** |
| `status` in enum | all | fail | **Yes** |
| Generated artifacts current | index, runbook docs | fail | **Yes** (`kms:check-generated`) |
| **`id` unique repo-wide** | all | fail | No — add |
| **`owner` present and in the registry** | all | fail | No — add |
| **`related` values resolve** | all | fail | No — add |
| **`superseded_by` present when `status: superseded`, and reciprocal** | all | fail | No — add |
| **`canonical_source` present when `source_of_truth: derived`, and resolves** | all | fail | No — add |
| **Internal links resolve (dead-link check)** | all | fail | No — add |
| **Type template headings present** | typed docs | fail | No — add |
| **No `restricted` document in any assembled content directory** | site builds | fail | No — add |
| **A `public` document does not require an `internal` link** | public surface | fail | No — add |
| **Front-matter coverage does not regress** | repo | fail | No — add (see 19.2) |
| **`last_reviewed` within the type's cadence** | operational types | **warn**, routed to `owner` | No — add |
| **Deprecated/superseded document still linked as current** | all | warn | No — add |
| **Unknown tag not in the vocabulary** | all | warn | No — add |
| **Required documentation missing where detectable** | see 19.3 | warn | No — add |
| **Visibility raised in this PR** | changed files | annotate | No — add |

### 19.2 The coverage ratchet

**Design.** The single most important new check. Today `kms:validate` reports 1,042 files with no
front-matter as a non-blocking warning and exits 0 (**Verified**). A warning that has been emitted
1,042 times is not a warning.

The ratchet: a checked-in baseline records the current count of un-covered files **per directory**.
CI fails if any directory's count **increases**. It never fails for the existing backlog. This makes
the debt strictly non-growing from the day it lands, without blocking any current work — and it means
the migration in section 24 can reduce the baseline incrementally, each reduction locked in.

### 19.3 Detectable missing documentation

**Design.** CI can detect the absence of documentation in bounded cases, and only those:

- An audience in the enum with no `start-here` document.
- A `type` used by a document with no template registered.
- A supported deployment model with no `deployment-guide`.
- A `runbook` whose Verification section is empty.
- An owner in the registry owning zero documents (a stale registry entry).
- A slice directory in `specs/` with no `validation.md`.

**Design.** CI cannot detect that a *documented* capability does not exist — the inverse direction.
That remains a human review obligation, and it is called out explicitly here because `CLAUDE.md`
already records it as a live risk for staff-panel capability claims (**Verified**).

### 19.4 Where the checks run

**Design.** All KMS checks stay in `.github/workflows/quality.yml`, the single shared workflow used
by all three callers (**Verified**). A check added to a caller instead of to `quality.yml` makes the
deploy paths run less than a pull request does — the exact drift `#537` closed. The blocking/
non-blocking split (`kms_blocking: false` on both deploy callers) is deliberate and correct and
should be preserved: after merge, failing the deploy cannot un-merge stale content, it only withholds
the fix.

---

## 20. Documentation Impact Assessment

**Design.** This is a core KMS principle, not a checklist item: **every change assesses its
documentation impact, and the assessment is recorded.**

### 20.1 The principle

Every feature, bug fix, architecture change, operational change, configuration change or deployment
change evaluates whether it affects each of the following, and records the answer:

```text
Customer documentation      Architecture            Runbooks
Client documentation        ADRs                    Troubleshooting
Staff documentation         Specifications          Security
Admin documentation         Testing / validation    Support
Developer documentation     Deployment              Release notes
                            Configuration           Onboarding
```

Where a row is affected, the corresponding documentation is updated **as part of the same change**,
not deferred. Where a row is not affected, the assessment says so.

### 20.2 The DIA record

**Design.** The assessment is a short block in the slice's `requirements.md`, carried forward into
the PR body. Its shape:

| Area | Affected? | Document | Action | Done in |
| :--- | :--- | :--- | :--- | :--- |
| Customer documentation | no | — | — | — |
| Staff documentation | yes | `sop/process-refund` | update step 4 | this PR |
| Configuration | yes | `configuration-reference` | add new variable | this PR |
| Release notes | yes | customer release note | write | Ship |

**Design.** Rules:

1. **"No" is a valid answer and must be given.** A blank row is an incomplete assessment; an explicit
   "no" is a decision someone made.
2. **Deferral requires an issue.** A row marked "later" carries an issue number, or it is not a
   deferral, it is an omission.
3. **The DIA is written at Spec and re-checked at Validate**, because what a change actually touched
   is only known after it is built.
4. **Scope discipline applies.** A DIA identifies documentation the change makes wrong. It is not a
   licence to rewrite adjacent documentation — that is a separate slice, per this repository's
   existing scope rules.

### 20.3 Governance

**Design.** Initially the DIA is a **reviewed convention**, enforced by the spec template and human
review. It becomes CI-enforced only once the template check in 19.1 lands and the DIA block has a
machine-readable form. Stating this honestly matters: a governance mechanism that claims enforcement
it does not have is worse than one that admits it is advisory.

**This document does not implement the DIA.** Wiring it into the SDD commands is implementation work
(section 24, step 9).

---

## 21. Future SDD integration

**Design.** The platform's delivery loop is **Orient → Propose → Spec → Build → Build notes →
CLEAR → Validate/Fix → Ship → Document → CLEAR**, with four gates, each stage a slash command in
`.claude/commands/` (**Verified**, `specs/sdd-workflow.md`, `CLAUDE.md`).

This section defines **what each stage should require**. It does **not** modify any command, and no
SDD change is made by this task.

| Stage | KMS obligation | Gate relationship |
| :--- | :--- | :--- |
| **Orient** | Read the authoritative sources for the affected area from the source-of-truth matrix — not whatever is nearest. Note contradictions found; do not fix them here. | — |
| **Propose** | Identify the **affected audiences** and the documentation those audiences depend on. The proposal names them. A change that affects customers and says so at Propose cannot arrive at Ship with no customer documentation. | Gate 1 |
| **Spec** | Write the **DIA** (section 20.2) into `requirements.md`. Specify the documentation deliverables as acceptance criteria, so they are testable, not aspirational. | Gate 2 |
| **Build** | Implement required documentation **alongside** the change, in the same branch. Front-matter complete and valid. | — |
| **Build notes** | Record what was built and what documentation it touched. Gate 4 (CHANGELOG) lands here, as it does today. | Gate 4 |
| **Validate** | Verify documentation **correctness**, not merely presence: do the procedures work, do the links resolve, does the DIA match what was actually touched? Re-check the DIA against the built change. | Gate 3 |
| **Fix** | Documentation defects are validation failures and are fixed at the root cause, like any other. | Gate 3 |
| **Ship** | Confirm the audience-facing documentation exists for every audience the Propose stage named: customer, client, staff, release notes. | — |
| **Document** (final) | Update canonical knowledge: the affected `reference` documents, roadmap, indexes; move shipped specs to `source_of_truth: historical`; record supersessions. | — |

**Design.** Three integration rules:

1. **KMS obligations attach to existing gates; no fifth gate is created.** Four gates are already
   non-negotiable; a fifth would dilute them.
2. **The documentation deliverable is an acceptance criterion in `validation.md`**, so Gate 3 checks
   it by its existing mechanism rather than needing a new one.
3. **CI is ground truth, not local output** — the existing Validate rule applies unchanged to
   documentation checks.

---

## 22. AI-ready documentation

**Design.** The KMS must let an agent answer nine questions **without loading the corpus**:

| Question | Answered by |
| :--- | :--- |
| What should I read first? | the `start-here` document for the role being served |
| What is authoritative? | `source_of_truth: authoritative` |
| What is current? | `status: approved` |
| What is historical? | `source_of_truth: historical` |
| What has been superseded? | `status: superseded` + `superseded_by` |
| Who is this written for? | `audience` |
| What visibility restrictions apply? | `visibility` |
| What else is relevant? | `related`, `tags`, shared `track`/`type` |
| What is the minimum context for this task? | the retrieval contract below |

### 22.1 Progressive context retrieval

**Design.** Four tiers. An agent stops at the shallowest tier that answers the question, and each
tier is cheap enough to be the default.

| Tier | What it loads | Typical cost | When |
| :--- | :--- | :--- | :--- |
| **0 — Rules** | `CLAUDE.md` | always loaded | every session |
| **1 — Index** | `ARTIFACT_INDEX.md`: title, type, status, visibility, summary for every document | one file | orientation, "does anything cover X?" |
| **2 — Neighbourhood** | the summaries of the candidate document plus everything in its `related` | a few hundred tokens | "which of these is the right one?" |
| **3 — Body** | the document itself, then its `canonical_source` if derived | one to three documents | doing the work |

**Design.** Rules that make this work:

1. **`summary` must be self-sufficient.** It is what tiers 1 and 2 retrieve *instead of* the body. A
   summary that requires the body to make sense breaks the whole contract. The 20–300 character bound
   already enforced is what keeps the whole index loadable as one file.
2. **A derived document names its canonical source in metadata**, so an agent can escalate to
   authority in one hop instead of searching.
3. **One concern per document.** A document covering four concerns must be loaded in full to answer
   about one of them.
4. **Superseded and archived documents are excluded from retrieval by default**, and returned only
   when history is explicitly requested. This is the mechanism that stops an agent citing a
   superseded ADR as current — the failure mode that matters most.
5. **An agent inherits the visibility of the role it acts for**, and defaults to `public` when the
   role is unknown (section 6).
6. **`CLAUDE.md` deliberately carries the rule, not the evidence**, pointing at the authoritative
   document per area (**Verified** — its stated design). That is tier 0 working correctly and should
   be preserved, not "improved" by inlining evidence.

---

## 23. End-to-end journeys

### 23.1 The feature journey

**Design** for the sequence; **Example** for the subject matter.

1. **Business requirement** — a product owner identifies a need. Recorded against the authoritative
   business-requirements source.
2. **Propose** — the proposal names the affected audiences: customer, staff, store-admin.
3. **Design** — UX produces the design against the authoritative design system.
4. **Decision** — if the change alters an architectural property, an **ADR** is written. If it
   supersedes an existing decision, the supersession is reciprocal.
5. **Spec** — `requirements.md` carries acceptance criteria **and the DIA**.
6. **Build** — code, tests and the documentation the DIA identified, in one branch.
7. **Build notes + CHANGELOG** — Gate 4.
8. **Validate** — acceptance criteria and documentation correctness, in CI.
9. **Ship** — staging, then production. Audience documentation confirmed present.
10. **Document** — canonical `reference` documents updated; a `release-note` per affected audience;
    the shipped `spec` set to `source_of_truth: historical`; indexes regenerated.
11. **Afterwards** — the spec remains, in place, as evidence of intent at approval. It is never
    relocated and never read as current behaviour.

### 23.2 The deployment journey

**Design** for the sequence. The specific models referenced are the **Verified** ones from 15.3.

1. **Choose** — the operator consults the deployment decision guide (section 16) and sees both the
   supported options and the ruled-out ones.
2. **Prerequisites** — the `deployment-guide` for the chosen model lists what must already exist and
   who provisions it.
3. **Configure** — every setting from the `configuration-reference`, with its source named. Secret
   *values* are never in the KMS.
4. **Migrate** — the documented migration procedure, in its documented order relative to the deploy.
5. **Deploy** — the exact trigger, from the runbook.
6. **Verify** — a positive check proving the intended state is live.
7. **Monitor** — what is watched and who is paged.
8. **On failure** — the runbook's Failure Conditions identify which step failed; Troubleshooting
   gives cause and fix; Rollback restores the previous state.
9. **Escalate** — if the runbook does not cover it, the Escalation section routes it, and the gap
   becomes a documentation defect with an issue.

---

## 24. Follow-on implementation sequence

**Design.** None of this is performed by this task. It begins only after this document is approved.

```text
Approved KMS strategy  (this document)
        ↓
1.  Current KMS inventory
        ↓
2.  Classification
        ↓
3.  Gap analysis
        ↓
4.  Migration map
        ↓
5.  Restructuring specification
        ↓
6.  Controlled migration
        ↓
7.  Navigation / index generation
        ↓
8.  Validation
        ↓
9.  SDD integration
        ↓
10. CI / governance enforcement
        ↓
11. Continuous maintenance
```

| Step | Produces | Notes |
| :--- | :--- | :--- |
| 1. Inventory | Every Markdown artifact, whether covered by front-matter, its current type/audience/status, and where it is referenced. | Must include the 1,042 uncovered files, bucketed. |
| 2. Classification | For each artifact: target type, audience, visibility, status, owner, source-of-truth standing. | The first point at which the new taxonomy meets real content. |
| 3. Gap analysis | Missing Start Here pages; missing owners; missing deployment guides; contradictions; unsupported claims. | Reuses the pilot's `Resolved` / `Superseded` / `Unresolved` register. |
| 4. Migration map | Source-to-destination ledger covering **100%** of inventoried artifacts. | The pilot proved this shape (R7). |
| 5. Restructuring spec | A normal SDD slice: `plan.md`, `requirements.md`, `validation.md`. | Subject to all four gates. |
| 6. Controlled migration | Executed in slices by domain, never as one change. | Front-matter first; relocation only where the map requires it and only with explicit approval. |
| 7. Navigation / index generation | Generated sidebars, facets, Start Here pages, per-surface recent-changes. | One generator, one exported artifact list. |
| 8. Validation | The section 19 checks, landed **warn-first**, then promoted to fail. | The coverage ratchet lands at step 6, not step 10 — it must guard the migration, not follow it. |
| 9. SDD integration | DIA in the spec template; documentation criteria in `validation.md`; command updates. | The only step that touches `.claude/commands/`. |
| 10. CI enforcement | Warn-level checks promoted to blocking. | Promotion is a decision per check, with its backlog cleared first. |
| 11. Continuous maintenance | Review cadences live; staleness routed to owners; DIA on every slice. | Steady state. |

**Design.** Sequencing constraints:

- Steps 1–4 are **analysis only**: no file moves, no renames, no deletions.
- Step 6 proceeds **domain by domain**, each domain a slice with its own gates, as the orders/
  fulfilment pilot already demonstrated.
- No historical `specs/` file is relocated, deleted or structurally modified at any step. Front-matter
  changes only. This carries the pilot's R8 forward as a permanent rule.
- A check is promoted from warn to fail only when its backlog is clear. A check that fails on
  day one gets disabled, and a disabled check is worse than a warning.

---

## 25. Unresolved decisions requiring approval

These need an explicit answer before implementation begins. Each names its default if no decision is
taken.

| # | Decision | Options | Default if undecided |
| :--- | :--- | :--- | :--- |
| **U1** | **What is the platform, and this KMS, actually called?** The commissioning request said "SRIMART"; the repository shows SriMart is a *tenant*, not the platform. | (a) keep tenant-neutral naming, (b) adopt a platform name, (c) confirm SRIMART is the intended platform name | (a) tenant-neutral — used throughout this document |
| **U2** | **Visibility model**: three values now (`public`/`internal`/`restricted`) with a documented trigger for five, or five immediately? | 3-now (recommended) · 5-now | 3-now |
| **U3** | **Retire the required `version` field?** 164 of 212 documents sit at `1.0.0`; nothing consumes it. Affects a rendered index column. | retire (recommended) · keep required · keep for `adr`/`release-note` only | keep required — no change without approval |
| **U4** | **Is `owner` required from the start, or phased?** Making it required immediately fails 211 of 212 documents. | phase via the coverage ratchet (recommended) · require immediately | phased |
| **U5** | **Does a client-facing surface get built?** Section 8 assumes a client track; today only the internal site is deployed and the public site is not built. | build both · public first · internal only | public first — client track stays a design |
| **U6** | **`ai-agent` as an audience value?** This document recommends *against* it (section 4.1). | omit (recommended) · add | omit |
| **U7** | **Does `spec` split into `spec` and `plan`/`validation` types**, so the 403 uncovered `specs/` files can be typed meaningfully? Or do all four slice documents share `type: spec`? | one type with a sub-field · separate types · leave uncovered | one type — decided at step 2 of section 24 |
| **U8** | **Who owns the KMS itself?** No owner exists for the standard, the schema or the sites. Without this, section 12 has no root. | name an owner | **must be decided — no safe default** |
| **G1** | **Gap, not a choice: there is no authoritative source for security requirements.** Section 11.3 records the hole. Something must own it before security documentation can be `derived` from anything. | create one | **must be decided — no safe default** |

---

## 26. Assumptions removed or converted to examples

Version 1.0.0 of this document contained statements that read as platform capabilities and were not
verified. Each is recorded here so the conversion is auditable rather than silent.

| v1.0.0 statement | Disposition in v2.0.0 |
| :--- | :--- |
| "The Codebase … rule supreme" as a global source-of-truth hierarchy | **Replaced** by the per-knowledge-type matrix, section 11. The old rule made every defect self-ratifying. |
| "Checklist of GitHub, **AWS, Jira, and Slack** channels" | **Removed.** AWS, Jira and Slack appear nowhere in this repository. Replaced by a generic access checklist, section 7.1 item 3. |
| "Preview / Ephemeral — PR Validation … Triggered via GitHub Actions", classified *Experimental* | **Reclassified Unsupported**, section 15.3. No workflow creates a per-PR environment. |
| "Self-Hosted (On-Prem) … Enterprise Client deployment" | **Reclassified Unsupported**, section 15.3. No supporting artifact exists. |
| "Disaster Recovery … Multi-region failover" as a deployment model | **Reclassified Unverified**, section 15.3. Retained as a *required documentation topic* (15.2), not as an available model. |
| "Local Development Setup (**Requires Docker**, Node.js)" | **Removed.** No `Dockerfile` or compose file exists. Local development is `npm run dev` (UI only) and `npm run preview` (database-touching work). |
| "Checks **Datadog** dashboard linked in the runbook" | **Converted to a generic requirement** — the deployment lifecycle requires a Monitor stage (section 17); no observability product is named. |
| "restore the previous stable **container image**" | **Removed.** There are no container images. Rollback is defined generically in section 18.1. |
| "Restricted … stored in a separate secure vault repository (e.g. HashiCorp Vault, AWS Secrets Manager)" | **Replaced** by the verified model: secret *values* live in Cloudflare and GitHub environments; `restricted` visibility means "never assembled into any site" (section 5). |
| "e.g. `NODE_ENV=production`" as a configuration example | **Removed.** Configuration is reached through the validated config module, never `process.env` directly (**Verified**, `CLAUDE.md`). |
| "Schema migrations (`npm run db:migrate`)" | **Removed.** That script does not exist. Migrations run in CI on a Node runner against the direct connection (**Verified**, `CLAUDE.md`). |
| "AI Coding Assistants (like **Antigravity/Gemini**)" | **Removed.** Replaced by a product-neutral retrieval contract, section 22. |
| "CI warns if a `runbook` hasn't had a **commit** touching it in 90 days" | **Replaced.** Commit recency measures editing, not correctness. Replaced by `last_reviewed` against a per-type cadence, section 10.1. |
| "`visibility: internal \| public`" as sufficient | **Extended** to three values with an enforceable `restricted`, section 5. |
| Deployment-options matrix presented without evidence | **Replaced** by the verified inventory, section 15.3, every row carrying its evidence. |
| Document-type table including a generic `doc` | **Retired**, section 9.2. |
| Ownership model stated as though practised | **Retained as design**, with the verified reality (1 of 212 documents) stated in section 2.2 and a phased adoption path in U4. |

---

## 27. Change summary — v1.0.0 → v2.0.0

**Retained and refined** (the request was to correct and complete, not replace): single KMS
repository; progressive disclosure; audience tracks; role-based Start Here pages; audience →
documentation mapping; role → task → procedure → troubleshooting → reference navigation; document
types; ownership; document lifecycle; metadata/front-matter; deployment documentation; runbooks;
search and navigation; generated indexes; CI validation; AI-friendly documentation; the feature and
deployment journeys. All fourteen concepts survive; each is now testable.

**Added**

- Section 0: the strategy/implementation boundary and the Design / Verified / Example marker system,
  applied throughout.
- Section 2: a measured current-state baseline, with the eight problems the design must solve.
- Section 11: the per-knowledge-type source-of-truth matrix, replacing the "codebase rules supreme"
  hierarchy, and the intent-versus-implementation rule.
- Sections 4–6: an expanded audience vocabulary (seven new values, two retired), a four-track model,
  and an exhaustiveness requirement on track derivation.
- Section 5: a three-value visibility model with an enforceable `restricted`, and explicit triggers
  for expanding to five.
- Section 7: onboarding for ten audiences with verifiable completion tests, not just developers.
- Section 9: a thirteen-type taxonomy with an explicit "does it earn its place" test, three reasoned
  rejections, and the retirement of the generic `doc`.
- Section 10: the metadata schema with a rationale, requirement level, allowed values and CI
  disposition per field — including `last_reviewed`, `source_of_truth`, `canonical_source`,
  `supersedes`/`superseded_by` and `applies_to` — and the removal of fields that govern nothing.
- Section 13: six lifecycle states, reciprocal supersession, and the rule that shipped specs become
  historical by front-matter alone.
- Sections 15–17: deployment as a first-class domain — discovery-then-classification, the required
  documentation set, the verified current inventory, the decision guide, and the fifteen-stage
  lifecycle.
- Section 18: the full runbook standard, plus the SOP/runbook distinction.
- Section 19: a twenty-one-row validation matrix and **the coverage ratchet**, the check that stops
  the 1,042-file front-matter gap from growing.
- Section 20: the Documentation Impact Assessment as a core principle, with an honest statement of
  what is enforced and what is convention.
- Section 21: stage-by-stage SDD integration attaching to the four existing gates, creating no fifth.
- Section 22: the four-tier progressive context retrieval contract for AI agents.
- Sections 24–26: the implementation sequence, eight unresolved decisions plus one gap, and the
  audit trail of every assumption removed.

**Changed**

- Status moved `approved` → `review`: this document is awaiting the approval it asks for.
- `ARTIFACT_INDEX.md` reframed as governance and AI surface, explicitly *not* primary human
  navigation.
- The runbook staleness signal moved from commit recency to `last_reviewed`.

---

## Appendix A — Definition of Done

| Question | Answered in |
| :--- | :--- |
| Who uses the KMS? | §4, §6 |
| Where does each audience start? | §7 |
| How is information organised and discovered? | §8, §14 |
| What document types exist and what are they for? | §9 |
| Which source is authoritative for each kind of information? | §11 |
| How is documentation owned and maintained? | §12, §19 |
| How are current and historical knowledge distinguished? | §13 |
| How are deployment options and operational procedures documented? | §15–§18 |
| How does someone onboard into their role? | §7 |
| How will future changes determine which documentation must change? | §20 |
| How will the SDD process enforce this standard? | §21 |
| How can humans and AI agents find the minimum authoritative information they need? | §14, §22 |
| What happens after approval? | §24 |
| What still needs a decision? | §25 |

**Do not begin the KMS restructuring until this strategy has been reviewed and approved.**
