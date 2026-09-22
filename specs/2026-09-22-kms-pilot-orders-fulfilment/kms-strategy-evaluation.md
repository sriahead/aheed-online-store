---
id: kms-strategy-evaluation
title: "KMS Strategy and Evaluation"
audience: [dev, operations, product]
type: spec
status: approved
version: "1.0.0"
updated: 2026-09-22
visibility: internal
summary: "A comprehensive evaluation and strategic guide for designing a scalable, audience-centric Knowledge Management System (KMS)."
tags: [kms, strategy, documentation, architecture]
---

# KMS Strategy and Evaluation

A comprehensive evaluation and architectural guide for designing, structuring, and maintaining a robust Knowledge Management System (KMS) tailored for modern software delivery, operational excellence, and AI-readiness.

---

## 1. Recommended KMS Architecture

The initial structure presented is highly comprehensive but risks overwhelming users with a flat hierarchy of 18 top-level domains. A better approach applies **Progressive Disclosure** by grouping the architecture around **Visibility Tracks (Audience Domains)**. A unified repository can hold all documentation, but the KMS interface should render segregated portals.

### Refined Architecture (Track-Based)

```text
KMS Repository (Single Source of Truth)
├── 1. Public Track (Customer Help Centre)
│   ├── Start Here: Customers
│   ├── User Guides & FAQs
│   └── Troubleshooting
│
├── 2. Client / Partner Track (Client Portal)
│   ├── Start Here: Clients & Store Admins
│   ├── Store Configuration & Administration
│   ├── Integration Guides & APIs
│   └── Release Notes (Client-facing)
│
├── 3. Internal: Staff & Operations Track
│   ├── Start Here: Staff / Support / Operators
│   ├── Staff Knowledge Base & SOPs
│   ├── Runbooks & Operational Procedures
│   ├── Incident Response & Troubleshooting
│   └── Security & Compliance
│
├── 4. Internal: Engineering Track
│   ├── Start Here: Developers / QA / DevOps
│   ├── Architecture & Decisions (ADRs)
│   ├── Specifications (Active & Historical)
│   ├── Testing & Quality
│   ├── Deployment & Environments (see section 4)
│   └── Product Roadmap & Delivery
│
└── 5. Restricted Track
    ├── Secrets Management
    └── Privileged Infrastructure Procedures
```

**Why this is better:** It enforces the **Audience Boundary** strictly. Customers never see deployment guides; Developers immediately know where architectural decisions live; Operations has a dedicated domain free of marketing copy. 

---

## 2. Audience → Documentation Mapping

| Audience | Primary Domain | Read Access | Write/Review Access |
| :--- | :--- | :--- | :--- |
| **Customers / End Users** | Public Track | Public | None |
| **Clients / Business Stakeholders** | Client Portal | Public, Client | None |
| **Store/Platform Admins** | Client Portal, Internal Ops | Public, Client, Ops | Store Configuration |
| **UX/UI Designers** | Internal Eng (UX & Design) | Internal Eng | UX/Design Specs |
| **Product Owners / PMs** | Internal Eng (Roadmap, Specs) | Internal Eng, Ops | Specs, Roadmap |
| **Developers** | Internal Eng | Internal Eng | Code, Specs, ADRs |
| **QA and Testers** | Internal Eng (Testing & Quality) | Internal Eng | Validation Plans |
| **DevOps / Operations** | Internal Ops, Internal Eng | Internal Ops, Eng | Runbooks, Infrastructure |
| **Support Teams** | Internal Ops, Public | Public, Client, Ops | Support SOPs, FAQs |
| **Security / Audit Teams** | Restricted, Internal Ops | All Tracks | Security, Compliance |
| **AI Agents** | All Tracks (context-dependent) | Filtered by role | Automated Indexes |

---

## 3. Onboarding Journeys

Every audience domain requires a **Start Here** page following a standardized structure:

### Example: `Start Here → Developer`

* **What is the system?** Brief 2-paragraph overview of the platform, its purpose, and core domain.
* **What is my role?** "You build and maintain the core platform services and storefront."
* **What access do I need?** Checklist of GitHub, AWS, Jira, and Slack channels.
* **What should I read first?** Links to: 1) Local Environment Setup, 2) Core Architecture Overview.
* **What should I learn next?** The SDLC Workflow (Propose → Spec → Build → Validate → Ship).
* **What common tasks will I perform?** Branching, opening PRs, running local tests.
* **Where are the relevant procedures?** Link to the Developer Portal / Runbooks.
* **How do I know onboarding is complete?** "You have successfully run the full test suite locally and submitted a dummy PR."
* **Where do I go when something fails?** Link to `Troubleshooting Dev Environments` and `#eng-help` Slack channel.
* **Who owns/supports this area?** Platform Engineering Team.

---

## 4. Role → Common Tasks → Documentation Mapping

| Role | Goal / Task | Procedure Link | Troubleshooting | Reference |
| :--- | :--- | :--- | :--- | :--- |
| **Customer** | Track an order | `guide/tracking-orders` | `faq/missing-order` | N/A |
| **Staff** | Process a refund | `sop/refund-processing` | `runbook/refund-failures` | `doc/payment-states` |
| **Store Admin** | Add a product | `guide/manage-catalogue` | `faq/image-upload-fails` | `doc/product-schema` |
| **Developer** | Implement a feature | `spec/sdd-workflow` | `runbook/ci-failures` | `adr/001-architecture` |
| **QA** | Validate a release | `doc/regression-testing` | `runbook/test-env-down` | `spec/feature-x-val` |
| **DevOps** | Deploy to Production | `runbook/deploy-production` | `runbook/rollback-prod` | `doc/infra-diagram` |
| **Client** | Configure delivery areas | `guide/delivery-areas` | `faq/delivery-not-found` | `doc/delivery-rules` |

---

## 5. Deployment-Options Matrix

| Deployment Model | Intended Use | Complexity | High Availability | Operational Burden | Example Scenario |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Local Development** | Engineering / QA | Low | No | Low | Developer workstation setup |
| **Preview / Ephemeral** | PR Validation | Medium | No | Low (Automated) | QA testing a specific branch |
| **Staging Environment** | Pre-release check | Medium | No | Medium | UAT / Final sign-off |
| **Production (Managed)**| Live Customer Traffic | High | Yes | High | SaaS Platform hosting |
| **Self-Hosted (On-Prem)**| Client Data Sovereignty| High | Varies | Shifted to Client | Enterprise Client deployment |
| **Disaster Recovery** | Catastrophic failure | High | Yes | High | Multi-region failover |

*Status tracking:* **Supported** (Prod, Staging, Local) | **Experimental** (Preview) | **Unsupported** (Self-Hosted).

---

## 6. Deployment Decision Tree

> **I am a developer**
> ↳ Proceed to **Local Development Setup** (Requires Docker, Node.js).
> 
> **I need a temporary test system for a specific feature**
> ↳ Proceed to **Ephemeral Preview Environments** (Triggered via GitHub Actions).
> 
> **I need to validate a release before it goes live**
> ↳ Proceed to **Staging Deployment** (Mirrors production, uses sanitized snapshot data).
> 
> **I need to deploy to live customers**
> ↳ Proceed to **Production Deployment Runbook** (Requires approval, triggers zero-downtime rollout).
> 
> **I need to recover the system from a catastrophic outage**
> ↳ Proceed to **Disaster Recovery Plan (DRP)**.

---

## 7. Environment Documentation Model

Every supported environment (e.g., Staging, Production) must document:

1. **Prerequisites**
   * **Infrastructure:** Compute, Memory, OS requirements.
   * **Dependencies:** External APIs, Database engines (version specific).
   * **Network:** Open ports, DNS configurations, TLS requirements.
2. **Installation & Build**
   * Steps to build artifacts and start services.
3. **Configuration**
   * **Required:** Secrets, DB connection strings.
   * **Optional:** Analytics keys, performance tuning flags.
   * **Environment-Specific:** e.g., `NODE_ENV=production`.
4. **Data Initialization**
   * Schema migrations (`npm run db:migrate`).
   * Seed data (required reference data vs mock data).
5. **Verification**
   * Health check endpoints, expected log outputs.

---

## 8. Runbook Structure

Operational runbooks must be **executable**, avoiding long narrative text.

* **Title:** Action-oriented (e.g., `Deploy to Production`).
* **Intent:** 1 sentence describing what this achieves.
* **Prerequisites:** Tools, permissions, and state required before starting.
* **Steps:** Numbered, copy-pasteable commands. Include expected output.
* **Verification:** How to prove it worked (e.g., `curl /api/health`).
* **Rollback:** What to do if a step fails.
* **Troubleshooting:** Known failure modes and remedies.

---

## 9. Document Types and Their Purpose

| Type | Audience | Purpose | Example |
| :--- | :--- | :--- | :--- |
| `guide` | Customer/Client | Narrative how-to for using the product. | `shopping-guide.md` |
| `faq` | Customer/Client | Q&A for common pain points. | `payment-faq.md` |
| `sop` | Staff/Ops | Standard Operating Procedure for daily work. | `refund-processing.md` |
| `spec` | Engineering | Feature requirements, design, and plan. | `shopping-cart-spec.md` |
| `adr` | Engineering | Immutable record of an architectural decision. | `adr-001-database.md` |
| `runbook` | Ops/DevOps | Executable procedure for system operations. | `deploy-staging.md` |
| `doc` | Internal | Broad domain knowledge, architecture diagrams. | `order-fulfilment.md` |

---

## 10. Ownership Model

* **Every document must have an owner.** (e.g., `owner: platform-team`).
* The owner is responsible for responding to stale document alerts.
* If a team is disbanded, ownership defaults to the Engineering Manager or is reassigned.
* Orphaned documents trigger automated deprecation warnings.

---

## 11. Document Lifecycle

1. **Draft:** Initial creation, WIP. (Not indexed for AI/Search).
2. **Review:** Pending peer review / SDD Gate approval.
3. **Approved / Published:** Live, authoritative, indexed.
4. **Deprecated:** Scheduled for removal, clearly marked, AI penalizes its retrieval weight.
5. **Archived:** Removed from active navigation, kept for historical auditing only.

---

## 12. Source-of-Truth Hierarchy

When conflicts arise, the KMS resolves truth in this order:

1. **The Codebase:** The actual database schema and runtime logic rule supreme.
2. **Current Architectural Decisions (ADRs):** Explicitly adopted designs.
3. **Latest Merged Specification:** The most recent feature slice detailing behavior.
4. **Operational Runbooks / SOPs:** Daily working documents.
5. **Historical Artifacts (Archived Specs):** Used only as evidence of past intent.

*Rule:* Never document the exact same fact in two places. Use section-level transclusion or hyperlinking.

---

## 13. Visibility & Access Model

Handled strictly via Frontmatter metadata (`visibility: internal | public` and `audience: [...]`).
Build scripts (e.g., Nextra site generators) must securely partition output:
* **Public Site Deploy:** Reads ONLY `visibility: public`.
* **Internal Site Deploy:** Reads `visibility: internal`, protected behind Identity/Access proxies (e.g., Cloudflare Access, VPN).
* **Restricted:** Stored in a separate secure vault repository (e.g., HashiCorp Vault, AWS Secrets Manager), never in standard KMS plaintext.

---

## 14. Navigation and Search Strategy

* **Role-Based Landing Pages:** Provide curated views.
* **Faceted Search:** Allow users to filter search by `DocType` and `Audience`.
* **Breadcrumbs:** Contextual location (`Engineering > Deployment > Staging`).
* **Tags & Related:** Explicit frontmatter arrays (`tags: [auth, login]`, `related: [adr-002]`) to create a knowledge graph.
* **Visual Cues:** Auto-inject warnings if a document is older than 6 months without review.

---

## 15. Metadata / Tagging Model (Frontmatter)

Every markdown file requires structured YAML frontmatter:

```yaml
id: deploy-staging
title: "Runbook: Deploy to Staging"
audience: [devops, dev]
type: runbook
status: approved
version: 1.0.0
updated: 2026-09-22
visibility: internal
summary: Executable steps for deploying the main branch to the staging environment.
owner: platform-ops
tags: [deployment, staging, runbook]
related: [adr-005-ci-cd, staging-deploy-gates]
```

---

## 16. Automation Opportunities

* **Auto-Categorization:** Build scripts read `type` and automatically group files into UI sidebar folders.
* **Artifact Indexes:** Scripts dynamically build `ARTIFACT_INDEX.md` from frontmatter, enforcing SDLC governance.
* **Dead-Link Checkers:** CI fails if internal markdown links break.
* **Staleness Alerts:** CI warns if a `runbook` hasn't had a commit touching it in 90 days.
* **Validation Gates:** `kms:validate` blocks PRs if frontmatter schemas are violated.

---

## 17. AI-Consumption Strategy

AI Coding Assistants (like Antigravity/Gemini) read the KMS efficiently if it is structured correctly:
* **Small Chunks:** Keep files focused on a single concern.
* **Index Files:** AI reads `ARTIFACT_INDEX.md` first to understand the landscape without reading every file.
* **Metadata Clues:** The AI prioritizes `status: approved` and ignores `status: deprecated`.
* **Audience Filtering:** The AI can deduce that if generating a response for a customer, it must only pull from `visibility: public` docs.

---

## 18. Recommended Improvements for a System like SRIMART

1. **Avoid Flat Navigation:** Shift from alphabetical lists to `DocType` and `Theme` grouped directories.
2. **Single-Source Indexing:** Consolidate multiple indexes (like `docs.ts` and `ARTIFACT_INDEX.md`) into a single build-step generation to prevent drift.
3. **Thematic Consolidation:** Stop relying solely on chronological `specs/`. Create canonical domain documents (e.g., `order-fulfilment-core.md`) that represent current truth, leaving `specs/` as historical change ledgers.
4. **CI Enforcement:** Continue shifting KMS compliance left. Documentation validation (Frontmatter schemas, changelog updates) must block PR merges.

---

## Final Deliverables: Complete Journeys

### Journey 1: The Feature Journey

1. **Business Requirement:** Product Owner identifies need for "Subscription Products".
2. **Product/UX:** Design team creates wireframes and saves to `UX & Design`.
3. **Architecture/Decision:** Engineering writes `adr-015-subscriptions-model.md` defining how recurring billing works.
4. **Specification:** Developer writes `specs/2026-10-01-subscriptions.md` detailing the exact implementation plan.
5. **Development & Testing:** Code is written, automated tests are built against the spec.
6. **Release:** Spec is merged; feature goes live.
7. **Operations / Staff Instructions:** An SOP `sop/manage-subscriptions.md` is added for staff.
8. **Client/Customer Help:** A public guide `guide/how-to-subscribe.md` is published.
9. **Historical Record:** The `2026-10-01` spec is retained but marked as `status: approved` (historical), while the actual platform logic lives in code and canonical docs.

### Journey 2: The Deployment Journey

1. **Choose Deployment Model:** Developer refers to the *Deployment Decision Tree*. Needs a live test environment. Chooses **Staging**.
2. **Prerequisites & Infrastructure:** Checks `doc/staging-env-requirements.md`. Confirms database cluster is provisioned.
3. **Installation & Configuration:** Follows the first half of `runbook/deploy-staging.md`. Sets required secrets in the environment vault.
4. **Database Migrations:** Executes the documented Prisma migration command.
5. **Deployment & Verification:** Triggers the GitHub action. Validates via `/api/health`.
6. **Monitoring:** Checks Datadog dashboard linked in the runbook.
7. **Troubleshooting:** The deploy fails halfway. The developer consults the `Troubleshooting` section of the runbook, identifies a missing environment variable, and restarts the pipeline.
8. **Upgrade / Rollback:** If the staging environment breaks completely, the developer follows `runbook/rollback-staging.md` to restore the previous stable container image.
