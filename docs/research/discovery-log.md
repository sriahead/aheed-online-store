---
id: discovery-log
title: "Discovery log"
audience: [dev, product]
type: doc
status: approved
version: "1.9.0"
updated: 2026-10-10
visibility: internal
summary: "Append-only record of Discover-phase findings — customer problems, opportunities, friction, gaps, risks and assumptions — each separating observed evidence from interpretation, and each ending in exactly one governance next action."
tags: [research, discovery, opportunities, risk, sdd]
related: [research-index, sdd-workflow, roadmap]
---

# Discovery log

Newest entry first. Written by the **Discover** phase (`/discover`, and automatically at every
milestone close). Nothing here is approved scope — see `docs/research/README.md`.

## Entry template

```
### YYYY-MM-DD — <short finding title>

**Trigger:** <milestone close | explicit /discover | incidental>
**Status of the area:** <already implemented | already tracked as #NN | genuinely unowned>

**Observed (verifiable today):** file, line, schema field, issue number, or command output.
**Interpretation:** what I think it means. Clearly separated from the line above.
**Confidence:** Known / Inferred / Needs validation.

**Why it matters commercially:** which customer behaviour would change, and the business value.
**Options considered:** including the cheapest one and doing nothing.
**Cost of delay:** what gets more expensive the longer this waits.

**Next action:** RESEARCH MORE | PROPOSE | ADD TO ROADMAP/BACKLOG | READY FOR SPEC | DO NOT PURSUE
```

---

## 2026-10-10 — ninth Discover pass (owner ruling: first-party chatbot, `wa.me` context handoff — and its Workers AI feasibility)

A continuation of the eighth pass below, after the owner **rejected** its WhatsApp Business
Platform premise and named a different design, then asked for the technical feasibility and cost of
running the bot on Cloudflare AI, and how it behaves for a standalone vendor versus a shared one.

**The owner's ruling (2026-10-10):** a **first-party chatbot on the storefront** answers most FAQs
from this platform's own per-vendor approved content; when it cannot answer, it **hands off to the
store's existing WhatsApp number via a `wa.me` deep link carrying the conversation's context**. No
Meta Business Platform, no API, no webhook, no template approval, no per-message billing.

**That ruling is materially better than the design it replaced, and the record has been corrected
to match it.** `#1015` was rewritten, `#1014` was rescoped and retitled, and `#695` carries a
comment taking it off the support-deflection critical path. Four entries below are superseded in
part and say so inline; nothing has been deleted.

**Why the ruling is better, in this repo's own terms.**

- *The handoff mechanism already ships.* `components/layout/FloatingContact.tsx:116` already builds
  `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(whatsappMessage)}` from
  `VendorConfig.whatsappNumber` (`prisma/schema.prisma:463`). The only change is what goes in that
  string — today a fixed `Hi ${vendorName}, I have a question about my order.`
- *It needs no ADR and no mission change.* `specs/mission.md:60-64` already permits "a first-party
  deep link a shopper chooses to tap — no API, no Meta Business account, no inbound webhook, and no
  message this platform ever sends." The eighth pass's ADR-007 requirement is **withdrawn**.
- *`#571`'s cost-bounding pattern now transfers.* A storefront bot has a session and an IP to hash,
  so `lib/repositories/list-normalisation-rate-limit.ts` — already `vendorId` + `ipHash` scoped —
  is a direct ratified precedent rather than a pattern that breaks.
- *Meta's 24-hour window stops applying.* Those rules govern the Business *Platform* API. Staff
  replying from the ordinary WhatsApp app have no window, no templates and no per-message billing.
- *It is better for the shopper, not only cheaper.* The context is visible and editable before the
  shopper taps, and nothing leaves the browser until they do — a consent property a server-side
  integration does not give for free.

**Four constraints the ruling does carry**, recorded on `#1015`: bound the `?text=` context in code
(clients truncate silently, and the ceiling varies by platform); keep PII out of that URL (it lands
in browser history — order number and topic only); call it a **handoff, not a transfer**, because
the conversation does not move; and do not hardcode the model (see the first finding below).

**What did not move.** `#1012` (a per-vendor approved-answer corpus) is still the real
prerequisite and is design-independent. `#606` still caps the workload claim — substitution and
cancelling a paid order cannot be *resolved* by anyone, bot or human — though for those two a
context-rich handoff is the right answer and is strictly better than today's generic message.

**Feasibility verdict: the AI is the cheap part, and the platform already runs three Workers AI
features, so nothing here is new infrastructure.** Cost is not the constraint: computing from
`NET_CONTENT_MODEL_RATES` against the published 10,000-neuron daily free allowance and the $0.011
per 1,000 neurons overage rate (both re-confirmed 2026-10-10), a single store's support volume fits
inside the **free** daily allowance even at the 1,000-orders/day throughput `specs/mission.md`
designs for. The two findings below are what the feasibility check surfaced, and neither is about
the chatbot: one is a scheduled risk in shipped code — **investigated as a suspected live outage
and disproved by verification**, which is itself recorded — and the other is the multi-tenancy
question the owner asked, which applies to the three AI features already in production.

### 2026-10-10 — two shipped features hardcode a delisted, deprecated Workers AI model id; verified still serving, and its removal will be invisible

**Trigger:** explicit /discover (feasibility check for `#1015`)
**Status of the area:** genuinely unowned. Filed as `#1016`.

> **This entry was rewritten the same day it was filed.** As first written it hypothesised that
> `/shop-your-list`'s AI pre-pass had been silently dead since 2026-05-30. **Live verification
> disproved that**, and the hypothesis is withdrawn. The record of the correction is kept
> deliberately: the original reasoning was sound and the conclusion was still wrong, which is
> exactly why `CLAUDE.md` requires a real failing request rather than an inference from a
> deprecation notice.

**Observed (verifiable today):** Cloudflare's changelog post of 2026-05-08 ("planned model
deprecations") lists **`@cf/meta/llama-3.1-8b-instruct` as deprecated on 2026-05-30**. Two shipped
call sites hardcode that id and neither is env-overridable: `lib/list-normalisation.ts:37`
(`NORMALISATION_MODEL`, the "Shop your list" AI pre-pass, on the **public request path**) and
`lib/search-synonym-proposals.ts:31` (`MODEL`, the staff-triggered synonym proposals). The newer
net-content code already moved on and shows the correct pattern — `lib/net-content-suggester.ts:30`
resolves `DEFAULT_NET_CONTENT_MODEL` through the `NET_CONTENT_AI_MODEL` config key
(`lib/config.ts:153`), and every suggestion row records the model that produced it.

**Verified live, 2026-10-10, against the platform's own Cloudflare account** (real
`CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_TOKEN` from `.dev.vars`):

1. `GET /accounts/{id}/ai/models/search?per_page=500` returned `success: true` and **70 models**.
   `@cf/meta/llama-3.1-8b-instruct` is **absent from the catalogue**; the only surviving
   `llama-3.1` entry is **`@cf/meta/llama-3.1-8b-instruct-fp8`**. The changelog summary suggested
   `-fast` was the survivor — on this account it is `-fp8`, so a swap must target `-fp8`.
2. `POST /accounts/{id}/ai/run/@cf/meta/llama-3.1-8b-instruct` with a trivial message returned
   **`success: true`**. Controls `-fp8` and `@cf/google/gemma-4-26b-a4b-it` also both succeeded.

**Interpretation:** the id is **delisted but still serving**, so the pre-pass is working today and
`#591` stays conditional ("inert *whenever* the pre-pass degrades") rather than unconditional,
while `#590` is filed against a pre-pass that *is* running. What remains is a deprecated, delisted
id serving on borrowed time, hardcoded twice, with no env override and **no signal for the day it
stops**. `lib/list-normalisation.ts` is documented to degrade invisibly — "every failure path
returns null and the caller falls through to exactly the deterministic behaviour this feature
shipped with in P3d" — nothing writes an `ErrorEvent` on that path, and `/api/health` does not
cover Workers AI, so the eventual withdrawal would be undateable after the fact.
**Confidence:** Known for both literals, for the published deprecation date, for the id's absence
from this account's catalogue, and for its still answering a real call. **Unknowable from here:**
when it actually stops. Both checks hit the REST API directly rather than a deployed Worker, so
`#588` (the Workers AI credentials never reach the Worker runtime) remains a separate, untested
failure path.

**Why it matters commercially:** nothing is broken today, so this is a scheduled-risk item rather
than an incident — but it is the kind that converts into an undateable regression. It also sets the
rule for `#1015`: a chatbot that hardcodes a model id inherits this failure mode, except a
conversation has no deterministic answer to degrade into, so there the failure is user-visible and
unrecoverable rather than a lost enrichment.
**Options considered:** move both sites to the net-content pattern (named default plus env
override), defaulting to `-fp8` so observable behaviour barely moves, or to
`@cf/google/gemma-4-26b-a4b-it`, which is already used here and already priced in
`NET_CONTENT_MODEL_RATES`. Narrower: swap the two literals to `-fp8` and stop, which leaves the
next deprecation to land identically. **Separately and regardless:** have the degradation path
write an `ErrorEvent` — now the most valuable half, since the feature works and the real exposure
is the undated future failure. Doing nothing is tenable only while an unlisted id keeps answering,
which nobody here controls or monitors.
**Cost of delay:** none today. It becomes unrecoverable context on the day the id stops.

**Next action:** PROPOSE

### 2026-10-10 — Workers AI is an unmetered shared commons: one account credential, one daily pool, no per-vendor figure

**Trigger:** explicit /discover (the owner's standalone-versus-shared-vendor question)
**Status of the area:** genuinely unowned. Filed as `#1017`.

**Observed (verifiable today):** every Workers AI call in this repo goes to
`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${MODEL}` using **one
platform-level credential pair** — `getAiEnv()` reads a single `CLOUDFLARE_ACCOUNT_ID` and
`CLOUDFLARE_API_TOKEN` (`lib/config.ts:158-164`) — so ADR-004's host-based tenant resolution does
not reach the AI transport. Cloudflare's free allocation is **10,000 Neurons per day per account**,
resetting 00:00 UTC, with overage on the Workers Paid plan at **$0.011 per 1,000 Neurons**, and
exceeding the limits without that plan makes further requests **fail with an error rather than
being charged**. Per-caller throttling is already vendor-aware (`ListNormalisationAttempt` carries
`vendorId` + `ipHash`, `prisma/schema.prisma:1786`) but it **counts requests, not neurons**. A real
neuron budget exists only inside a script: `DEFAULT_NEURON_BUDGET = 5000` and
`NET_CONTENT_MODEL_RATES` (neurons per million tokens, read from Cloudflare's pricing page
2026-09-25) with `neuronsForCall()` in `lib/net-content-run.ts:25-41`. **No table or column
anywhere records neurons spent per vendor.**
**Interpretation:** ADR-004 gives no infrastructure split between a standalone and a shared
vendor — decision 2 is row-level tenancy in one database, decision 3 resolves the tenant from the
request host, and a custom domain changes only the session cookie scope (decision 4). One Worker,
one Neon database, **one AI account**. That is the right architecture, but it makes AI a shared,
unmetered, unattributed commons with two consequences: one vendor can exhaust the platform's daily
pool and silently degrade every other vendor's features — the same starvation shape as open `#619`,
where a batch cap consumed in vendor order lets one vendor starve another's reconciliation
candidates — and no vendor can be capped, charged or reported on. Storage is namespaced per vendor
under ADR-003 (`vendors/{vendorId}/...`); AI is not. A chatbot makes this acute rather than
creating it: the three shipped AI features are a staff-triggered step, an offline script and one
call per list submission, whereas a conversation is several calls per shopper and is the first AI
feature whose volume scales with **customer** traffic.
**Confidence:** Known for the single-credential transport, the absent per-vendor record and the
three code locations. **Needs validation** for the current rate card — third-party sources
disagree, and Cloudflare has moved to more granular per-model unit pricing while still billing in
neurons behind the scenes. **Needs validation** for real per-conversation cost: arithmetic on
`NET_CONTENT_MODEL_RATES` for Gemma 4 puts a short turn in the region of a few tens of neurons,
which would fit a single store's support volume inside the free daily pool — but that is a
calculation on a published rate, not a measurement.

**Why it matters commercially:** the platform's pitch is no per-store licence and no revenue share,
on infrastructure costing tens of pounds a month. AI is the only component that can breach that
quietly and the only one that cannot be attributed to the store that caused it. Metering before the
chatbot is far cheaper than retrofitting it once several vendors are live.
**Options considered:** record neurons per vendor per call from the same seam that already computes
`neuronsForCall()`, then refuse a call that would exceed a per-vendor daily budget, exactly as the
net-content run already refuses to start one past its budget. Cheaper: a per-vendor daily *call*
cap reusing the `ListNormalisationAttempt` shape — approximate, stops exhaustion, gives no cost
figure. Rejected and recorded so it is not revisited: per-vendor Cloudflare credentials, which
would give true isolation and a real per-vendor bill but require each vendor to hold a Cloudflare
account, breaking ADR-004 decision 7's "onboard with a row, no deploy". Doing nothing is tenable
while only Aheed and SriMart exist and neither has traded.
**Cost of delay:** none today; it becomes a billing problem at the first vendor onboarded on
commercial terms, and a credibility problem if it is discovered then.

**Next action:** ADD TO ROADMAP/BACKLOG

---

## 2026-10-09 — eighth Discover pass (owner proposal: AI chatbot with WhatsApp handoff)

> **Superseded in part on 2026-10-10.** The owner rejected this pass's WhatsApp Business Platform
> premise in favour of a first-party storefront chatbot handing off via a `wa.me` deep link. The
> four entries marked below are superseded; the rest stand. See the ninth pass above.

An explicit `/discover` over an owner proposal: a dedicated AI chatbot that asks qualifying
questions, answers FAQs "using our approved information", and hands the conversation to a member of
staff when it cannot answer — all over WhatsApp, so the shopper never leaves a familiar chat.
Treated as evidence, not scope. Every element was mapped against the schema and the code first,
then against the roadmap and the 141 open issues, then against `specs/mission.md` and the ADRs.

**Result: four genuinely unowned findings (filed as `#1012`–`#1015`), two `RESEARCH MORE` entries
that stay in this log, one `DO NOT PURSUE` on the programme shape, and new evidence on two tracked
issues.** The proposal is not one feature. It is six, and they are already split across three
different states.

**Already implemented, recorded so it is not rediscovered.**

- *A per-vendor WhatsApp contact surface.* `FloatingContact` renders a `wa.me` deep link with a
  prefilled message (`components/layout/FloatingContact.tsx:116`), driven by
  `VendorConfig.whatsappNumber` (`prisma/schema.prisma:463`), editable at `/staff/storefront`
  (`components/staff/StorefrontConfigForm.tsx:750`), validated to E.164 digits on write with a real
  error message for the national-format mistake (`lib/social-contact-form.ts:119`, `:133`), and a
  null hides the link rather than falling back to a platform default
  (`components/layout/FloatingContact.tsx:96`). The "simple, familiar WhatsApp" entry point the
  proposal asks for already exists; what is missing is everything behind it.
- *A vendor-agnostic AI prompt framing.* `VendorConfig.storeDescription` (`#905`) is already fed to
  every AI prompt in place of a hardcoded grocery framing, via `storeDescriptionPromptLine`.
- *A bounded AI call on a public request path.* `lib/list-normalisation.ts` runs
  `@cf/meta/llama-3.1-8b-instruct` over the Cloudflare REST API with three independent bounds —
  per-caller (`lib/repositories/list-normalisation-rate-limit.ts`), per-submission
  (`MAX_AI_INPUT_CHARS` 4000), per-call (`NORMALISATION_TIMEOUT_MS` 6000) — and every failure path
  returns null into a deterministic fallback.
- *An inbound webhook precedent.* `app/api/webhooks/stripe/route.ts` already does
  signature-verified inbound processing on this runtime, so that half of the channel work is
  cheaper than `#695` implies.
- *Postcode eligibility self-serve.* `components/layout/PostcodeChecker.tsx` in the header.
- *One-click reorder* (`#124`), which is the capability `#695`'s chat entry point would front.

**Already tracked, with evidence added rather than re-filed.**

- **`#695`** owns the channel: WhatsApp Business Platform access, a verified Meta business, a
  registered number, template approval, the inbound webhook and phone-to-`User` identity binding.
  Milestone *Deferred — owner/external gated*. Two of its claims were re-verified and both still
  hold: `User` carries no phone field at all (`prisma/schema.prisma:49-78`), and nothing links a
  phone to an identity. `Address.phone` (`:1176`) and `CustomerAddress.phone` (`:1847`) exist and
  are both required, but they are self-asserted delivery contacts captured at checkout — a match
  against one is not authentication, and a reassigned or shared mobile makes it actively unsafe as
  one. A comment recording this pass's constraints has been added there.
- **`#606`** owns the reason the workload claim does not land yet (see the fourth entry below).
- **`#104`** (no verified sending domain, so no customer email has ever been delivered) and
  **`#113`** (production still on Stripe test keys, so the platform has never traded) are both
  open.
- **`specs/mission.md:60-64`** records the 2026-09-10 narrowing explicitly: the `wa.me` contact
  link is in scope, and "everything that would make WhatsApp an outbound *channel* stays out of
  scope: notifications, marketing automation, and the chat re-order flow (`#695`, which needs its
  own `/propose` and almost certainly its own ADR)." This proposal reverses that narrowing
  substantially, so it inherits that requirement.

**Challenges to the proposal itself.**

- *"Using our approved information" names a corpus that does not exist.* See the first entry below.
- *"Reduce the workload on the support team" assumes the deflectable questions are the ones being
  asked.* The two highest-volume grocery contact reasons have no system answer to give, so the bot
  can only collect and escalate. See the fourth entry.
- *The AI layer is the expensive part and the least of the value.* The questions a grocery shopper
  actually asks first — minimum order, delivery charge, free-delivery threshold, do you collect,
  do you deliver to my postcode — are all structured columns on `VendorConfig` today. A
  deterministic answer path serves them exactly, with no model, no token cost and no hallucination
  surface. See the second entry.
- *A conversation is not a single-shot call.* `lib/list-normalisation.ts` is safe partly because it
  is one call per submission with a real deterministic fallback. A multi-turn conversation is N
  calls carrying history, and there is no deterministic "answer the shopper's question" path to
  fall back to, so the degradation strategy that makes the existing AI call acceptable does not
  transfer.
- *As a whole,* this is a programme spanning a licensed external channel, a content model, a
  conversation model, a staff surface and an AI layer. Taking it as one piece would break "build
  only what the stage requires". See the last entry.

### 2026-10-09 — a chatbot has no approved answers to give: one shopper-facing document exists, and it is deliberately hedged

**Trigger:** explicit /discover (owner proposal, "answers using our approved information")
**Status of the area:** genuinely unowned. Filed as `#1012`.

**Observed (verifiable today):** the Help Centre at `app/(storefront)/help/page.tsx:21-24` filters
`DOC_ARTICLES` for an audience containing `shopper` or `customer`. In the generated corpus
(`app/(admin)/staff/runbook/docs.ts`) the audience tags count 209 `dev`, 9 `product`, 6 `admin`,
3 `staff` and **1 `shopper`**. That one article is `docs/shopper-help/shopping-guide.md`, 52 lines
including front matter, platform-authored and committed to this repo. Because it must serve every
tenant, its answers are hedged by design: "Some stores have a minimum order amount", "A delivery
fee may apply, but you might qualify for free delivery if your order is above a certain amount",
"Loyalty Program (If Enabled)". There is no per-vendor content model anywhere in the schema — no
FAQ, policy, answer or article table — and `VendorConfig` carries exactly four free-text
shopper-facing strings (`searchPlaceholder`, `bannerNote`, `heroSubtitle`, `storeDescription`,
`prisma/schema.prisma:435-510`), none of them an answer to a question.
**Interpretation:** the phrase "our approved information" has no referent. The only corpus a bot
could be pointed at is a 209-article engineering doc set with one hedged shopper page in it, and
the obvious shortcut — retrieve over `DOC_ARTICLES` — would put `CLAUDE.md`, the ADRs and the
runbook behind a customer-facing chat. Writing the answers as repo markdown instead would make the
platform author claims on a vendor's behalf, which is exactly what `#239` fixed and what
`ADR-004` forbids.
**Confidence:** Known for every count and file above. That a retrieval bot would be pointed at
`DOC_ARTICLES` is Inferred — it is the only corpus present.

**Why it matters commercially:** this is the prerequisite for every later answering surface, AI or
not, and it is also the cheapest item in the whole proposal. Aheed and SriMart sell different
things under different delivery rules; one hedged page serves neither well, and a shopper who
cannot find the answer contacts a human, which is the cost the proposal exists to remove.
**Options considered:** a vendor-scoped FAQ aggregate (question, answer, sort order, active flag,
`@@unique([vendorId, …])`, null-or-empty renders nothing per `#239`) with staff CRUD, reusing the
`VendorReviewLink` shape that already solved "the vendor owns the rows, the platform compiles no
names". Cheaper: keep the markdown guide and add a per-vendor override block. Cheapest: do
nothing, and accept that no answering surface can be built honestly.
**Cost of delay:** rises the moment trading starts, and gates `#1013`, `#1015` and `#695`'s
successor. Writing it after a bot exists means the bot ships with placeholder answers.

**Next action:** ADD TO ROADMAP/BACKLOG

### 2026-10-09 — the Help Centre hedges five answers the database already knows exactly

**Trigger:** explicit /discover (owner proposal, FAQ automation)
**Status of the area:** genuinely unowned. Filed as `#1013`.

**Observed (verifiable today):** `VendorConfig` holds `minimumOrderPence`, `deliveryFeePence`,
`freeDeliveryThresholdPence` (null meaning free delivery is never offered) and `offerCollection`
(`prisma/schema.prisma:435-510`); `VendorDeliveryArea` holds the postcode rules. Those values are
already rendered precisely to shoppers — but only inside the cart and checkout
(`components/cart/CartContents.tsx`, `components/checkout/CheckoutPricing.tsx`,
`components/checkout/CheckoutSummary.tsx`, `lib/delivery-pricing.ts`, `lib/cart-rules.ts`), which
means a shopper must already have items in a basket to learn them. The one shopper-facing help
document states the same five facts as "some stores", "may apply", "a certain amount" and
"specific postcode areas". Postcode eligibility is the exception and is already answerable without
a basket (`components/layout/PostcodeChecker.tsx`).
**Interpretation:** the platform's single help page is less accurate than its own database, for
the questions most likely to be asked first, and for no reason other than that the page is prose.
Rendering those five from `VendorConfig` on the existing `/help` route needs no model, no new
channel, no migration and no content authoring, and it would be correct for every tenant
automatically.
**Confidence:** Known (every field and render site read). Which questions arrive most often is
Needs validation — no support contact has ever been recorded, which is itself the subject of the
last entry.

**Why it matters commercially:** "do you deliver to me, what does it cost, what is the minimum" is
the pre-basket decision. A shopper who cannot answer it without filling a basket either fills one
speculatively or leaves. It is also the subset of the owner's proposal that can ship before any of
its three external gates clear.
**Options considered:** render the delivery and loyalty facts on `/help` from `VendorConfig` and
`VendorDeliveryArea`, leaving the hedged prose for everything genuinely vendor-independent.
Larger: fold it into `#1012`'s content model as computed rows. Doing nothing leaves a document
that contradicts the checkout.
**Cost of delay:** low before launch, immediate after — this is first-visit information.

**Next action:** ADD TO ROADMAP/BACKLOG

### 2026-10-09 — "transfer to a real person" has no destination: no conversation model, and no staff surface to transfer to

> **SUPERSEDED IN PART 2026-10-10.** The destination problem is solved by the owner's design: the
> handoff goes to the store's existing WhatsApp number, so no staff inbox, assignment model or
> availability model is needed. `#1014` was rescoped and retitled to what survives — **no
> conversation is logged, so FAQ deflection stays unmeasurable**, which keeps `#1012`'s FAQ set a
> guess. The observed facts below are unchanged and still verifiable.

**Trigger:** explicit /discover (owner proposal, seamless handoff to staff)
**Status of the area:** genuinely unowned. Filed as `#1014`.

**Observed (verifiable today):** `prisma/schema.prisma` declares no conversation, message, thread,
ticket or case model — the nearest inbound-customer-writing aggregate is `CustomerFeedback`, which
is a one-row-per-customer rating with a `PENDING`/`APPROVED`/`REJECTED` moderation state and a
`@@unique([vendorId, userId])`, so it structurally cannot hold a second message from the same
person, let alone a thread. `app/(admin)/staff/` carries twenty-two sections (orders, inventory,
products, categories, brands, attributes, bundles, promotions, discounts, loyalty, customers,
delivery-areas, fulfilment, payments, errors, feedback, net-content, reports, runbook,
search-synonyms, storefront, team) and **none of them is a contact or conversation queue**. There
is also no notion of staff availability anywhere in the schema: `VendorFulfilmentSlot` and
`VendorExpressSchedule` model delivery and collection capacity, not working hours, and no field
answers "is a human reachable now".
**Interpretation:** the handoff is the load-bearing half of the proposal — it is what makes the
bot safe to deploy, because it is the escape hatch for everything the bot gets wrong — and it is
the half with no foundation at all. A bot that "transfers to a member of staff" with nowhere to
transfer to transfers into the owner's personal WhatsApp, which is the status quo the proposal is
trying to improve on, now with an AI layer in front of it and a shopper who has already answered
three qualifying questions.
**Confidence:** Known.

**Why it matters commercially:** the collected-information benefit ("collect the necessary
information before involving staff") is only realised if the information lands somewhere a human
reads, next to the order it concerns. Without a queue, the qualifying questions cost the shopper
time and save staff nothing. This is also the surface that would finally make support volume
measurable, which every other finding here is currently guessing about.
**Options considered:** a vendor-scoped conversation aggregate (conversation plus message, an
assigned staff user, an open/closed state, an optional `orderId`) with a `/staff/` queue following
the three-surface rule in `CLAUDE.md` and a `PanelRefusal` branch. Cheaper and channel-free: a
contact form writing one row that `/staff/` lists, which delivers the collect-then-escalate
benefit with no Meta dependency and no AI. Cheapest: do nothing and keep the `wa.me` link.
**Cost of delay:** every month without it is a month with no support-volume data, so the FAQ set
in `#1012` stays a guess.

**Next action:** PROPOSE

### 2026-10-09 — the deflection ceiling is set by #606, not by the bot: the top two grocery contact reasons have no answer to give

**Trigger:** explicit /discover (owner proposal, "reduce the workload on the support team")
**Status of the area:** **already tracked as `#606`** (open, no milestone) for the substitution and
refund half. The customer-facing cancellation half sits inside the same undecided territory. No new
issue filed; evidence added to `#606`.

**Observed (verifiable today):** a grep for `substitut` across `app`, `lib`, `components`,
`features` and `prisma` returns hits only in search, colour and theming code — there is no
substitution concept in this platform, and `OrderItem` has no substitution, fulfilled-quantity or
per-line note field. Order cancellation by the customer exists only on the unpaid checkout path
(`app/(storefront)/checkout/[orderNumber]/cancel/page.tsx` calling
`features/checkout/cancel-order.ts`); a confirmed order can be cancelled only by staff
(`features/orders/cancel-order-staff.ts`, reached from
`app/(admin)/staff/orders/[orderNumber]/page.tsx:131`). `PaymentStatus.REFUNDED` is declared and
never written. The shopper guide says so itself, in one line: "**Cancellations:** If you need to
cancel an order, please contact the store directly."
**Interpretation:** the two questions a grocery support line actually receives — "my item was out
of stock, can you substitute it" and "I need to change or cancel my order" — are precisely the two
the platform cannot act on. The bot's honest behaviour for both is to collect details and escalate
to a human, which is the outcome the proposal counts as a failure. Automating FAQs lowers the
volume of the questions the website already answers; it does not touch the volume of the questions
it cannot. `#606` is the gate on the workload benefit, and it is undecided `ADR-005` territory
entangled with `#399`'s weight model, not a small piece of work.
**Confidence:** Known for the code facts. The volume ranking is Inferred from grocery practice and
from the guide's own escalation line — no observed contact data exists (see `#1014`).

**Why it matters commercially:** this reorders the whole proposal. Resolving `#606` reduces support
workload whether or not a bot exists; a bot without `#606` mostly changes who types the escalation.
It is also the finding that stops the chatbot being funded on a benefit it cannot deliver.
**Options considered:** sequence `#606` ahead of any conversational layer. Or scope the bot
explicitly to the answerable subset and state the escalation rate as expected rather than as a
defect. Doing nothing is tenable only while the platform has not traded.
**Cost of delay:** `#606` gets more expensive after the first imperfect real order, not before.

**Next action:** ADD TO ROADMAP/BACKLOG

### 2026-10-09 — an AI call reachable from a phone number has no rate-limit anchor, and #571's bounds do not transfer

> **SUPERSEDED 2026-10-10 for the chatbot, still live for `#695`.** The owner's first-party design
> puts the bot on the storefront, where a session and an IP exist, so
> `lib/repositories/list-normalisation-rate-limit.ts` applies directly. The finding stands
> unchanged for anything that reads **inbound** WhatsApp messages, which still has neither. The
> `#588` credential gap and the per-account pool problem both survive — the latter is now `#1017`.

**Trigger:** explicit /discover (owner proposal, AI answering inbound messages)
**Status of the area:** genuinely unowned, and deliberately left in this log rather than filed —
it is a design constraint on `#695`'s successor, not separable work. Recorded as a comment on
`#695`.

**Observed (verifiable today):** `#571` ruled that an AI call reachable from a public,
unauthenticated endpoint is attacker-controlled cost, and `#565` resolved it by moving AI offline
behind a staff action. `lib/list-normalisation.ts` documents at length why its own call is the
exception and how it is bounded: per-caller through
`lib/repositories/list-normalisation-rate-limit.ts`, per-submission through `MAX_AI_INPUT_CHARS`
(4000) and `MAX_LIST_LINES` (100), per-call through `NORMALISATION_TIMEOUT_MS` (6000) — and every
failure returns null into the deterministic matcher that shipped in P3d. `lib/config.ts` holds no
Cloudflare rate-limiting binding; the three existing throttles (`OrderLookupAttempt`,
`AuthenticationAttempt`, `CustomerFeedbackAttempt`) all count hashed IPs in Postgres.
**Interpretation:** every one of those bounds has an anchor that an inbound WhatsApp message does
not supply. There is no IP to hash — the request arrives from Meta's webhook, not the shopper — so
the only per-caller key is the phone number, which is attacker-chosen and cheap to rotate at
scale. And the per-call fallback does not exist: a list normalisation that degrades still matches
the list, whereas a conversation turn that degrades has no deterministic answer to fall back to, so
the graceful path is silence or "a human will reply", which is the escalation the proposal is
trying to avoid. `#588` additionally records that `configure-env` never pushes the Workers AI
credentials to the Worker runtime, so the credential path this would depend on is itself unproven
in a deployed environment.
**Confidence:** Known for the code and the ruling. The abuse economics are Needs validation — they
depend on Meta's current rate card and on whether a BSP sits in front, neither of which is settled
(see the next entry).

**Why it matters commercially:** an unbounded model call on an inbound channel is an open-ended
bill on a platform explicitly chosen for costing tens of pounds a month. Discovering that after
the Meta approval has been obtained would mean discovering it with the channel already live.
**Options considered:** bound per phone number and per 24-hour window in Postgres, following the
three existing attempt-counter tables, and cap turns per conversation. Or keep the AI entirely off
the inbound path — classify and route deterministically, which needs no model at all. Or treat the
whole inbound-AI question as the ADR `#695` already says this needs.
**Cost of delay:** none today; it becomes a blocking design question the moment `#695`'s gates
clear.

**Next action:** RESEARCH MORE

### 2026-10-09 — the 24-hour service window turns an out-of-hours handoff into a template-approval problem

> **SUPERSEDED 2026-10-10 for the chatbot, still live for `#695`.** These are WhatsApp Business
> *Platform* API rules. The owner's design touches no Meta API: staff reply from the ordinary
> WhatsApp app, where there is no window, no template approval and no per-message billing. The
> finding stands unchanged for `#695`. The owner research it asked for is no longer a prerequisite
> to anything on the critical path.

**Trigger:** explicit /discover (owner proposal, "staff stepping in only when human support is needed")
**Status of the area:** genuinely unowned; external, so it stays in this log.

**Observed (verifiable today):** Meta's customer service window is settled across every source
checked on 2026-10-09: a customer's inbound message opens a 24-hour window, the window resets on
each new inbound, free-form replies inside it need no template, and once it closes only a
pre-approved template message may be sent. Whether service messages become billable from
2026-10-01 is **disputed** between sources, and could not be confirmed on Meta's own pricing page.
Against that, this platform has no concept of staff availability at all (previous entry), and no
customer message of any kind has ever been delivered from it — `#104` (no verified sending domain)
and `#113` (Stripe test keys) are both open.
**Interpretation:** the window is favourable for the bot and hostile to the handoff. An AI
answering a customer-initiated question lives entirely inside an open window, so the answers
themselves need no template approval — that part of the proposal is cheaper than it looks. But
"staff step in" is asynchronous by nature: a question arriving at 9pm and picked up at 10am the
next day is inside the window; one left over a weekend is not, and the reply then requires an
approved template, which is a Meta review cycle and a fixed form of words, not a staff member
typing. The proposal's phrase "seamlessly transfer the conversation to a real person" therefore
carries an unstated service-level commitment that nothing in the platform measures or enforces.
**Confidence:** Known for the window mechanics (multiple independent sources agree). Needs
validation for the billing change, the current rate card, and whether a BSP markup applies.
Needs validation for the owner's actual staffing pattern, which nobody has stated.

**Why it matters commercially:** a handoff that silently fails out of hours is worse than no
handoff — the shopper has been told a human is coming. Confirming the rate card and the window
rules against Meta directly is a prerequisite to budgeting any of this, and is an owner task, not
a code task.
**Options considered:** confirm the rules and rate card with Meta or a BSP before any proposal;
state published support hours and have the bot say them; or keep replies inside the window by
committing to a response time the owner can actually staff.
**Cost of delay:** none — this is research that must precede `#1015`'s `/propose`, not work.

**Next action:** RESEARCH MORE

### 2026-10-09 — the proposal should not be carried as one programme: its AI-over-WhatsApp layer sits behind three gates, two of them not code

> **SUPERSEDED IN PART 2026-10-10.** The decomposition stands and the sequencing recommendation
> stands. What changed is the gating: the owner's first-party design removes the `#695` gate, the
> Meta rate-card gate and the ADR-007 requirement entirely, so `#1015` is **no longer deferred** —
> its milestone was cleared and it can be proposed alongside the rest. `#606` still caps the
> workload claim. The `DO NOT PURSUE` verdict below applied to the *Meta-channel programme shape*
> and is spent; it is not a verdict on the owner's current design.

**Trigger:** explicit /discover (owner proposal, programme shape)
**Status of the area:** the channel is tracked as `#695`; the AI and handoff layer on top of it was
unowned and is now filed as `#1015`, gated and deferred, so the owner's actual ask has a home.

**Observed (verifiable today):** the proposal decomposes into six parts in three different states.
Implemented: the `wa.me` entry point. Tracked and owner-gated: the WhatsApp Business Platform
channel (`#695`, milestone *Deferred — owner/external gated*). Unowned: the answer corpus
(`#1012`), the deterministic answers (`#1013`), the conversation and handoff destination
(`#1014`), and the AI layer itself (`#1015`). Three of its gates are not code: Meta business
verification and template approval (`#695`), the `ADR-005` decision behind `#606`, and confirmation
of Meta's current rules and rate card. `specs/mission.md:60-64` already requires that any
reversal of the outbound-channel exclusion carry its own `/propose` and almost certainly its own
ADR — the next free number is **ADR-007**.
**Interpretation:** every part of the proposal that can be built today can be built without
WhatsApp and without AI, and every part that needs WhatsApp or AI is blocked on something a human
must obtain or decide. That is not an argument against the proposal; it is an argument against
taking it as a single piece, because doing so would park the three cheap, unblocked, independently
valuable parts behind a Meta approval queue. `#1012` → `#1013` → `#1014` is a coherent sequence
that delivers the collect-then-escalate and FAQ-deflection benefits on the storefront, produces the
first real support-volume data this project has ever had, and leaves `#1015` able to reuse all
three once its gates clear.
**Confidence:** Known for the states and the gates. That the storefront sequence would deflect
meaningful volume is Inferred — `#1014` is what would measure it.

**Why it matters commercially:** the proposal's benefits are real and mostly reachable without its
most expensive component. Sequencing them the other way round spends the Meta approval effort
first and discovers the FAQ set afterwards.
**Options considered:** build `#1012`, `#1013`, `#1014` in that order and revisit `#1015` with
real contact data. Or pursue `#1015` first, which means guessing the FAQ set, building the handoff
queue anyway, and still being gated on `#606` for the workload claim. Or do nothing, which leaves
the `wa.me` link as the entire support strategy.
**Cost of delay:** the three storefront parts get cheaper the earlier they land, because each one
informs the next. `#1015` cannot start regardless.

**Next action:** DO NOT PURSUE — not as one undivided programme, and not as a pre-`#606`
workload-reduction play. Its four parts are filed individually and `#1015` carries the rest.

---

## 2026-10-02 — seventh Discover pass (external mobile-first redesign brief)

An explicit `/discover` over an external, roughly fifty-section brief for a mobile-first redesign of
the storefront: header, navigation, homepage, search, filters, product card, quick add, basket,
checkout, reorder, states, accessibility, performance. Treated as evidence, not scope. Every ask was
mapped against the code and, where it mattered, against live production. **Nine genuinely unowned
findings** (eight filed as `#955`–`#962`, one `RESEARCH MORE`), new evidence on four tracked
issues, and a set of challenges to the brief itself.

**Method and its limit.** Code was read first. Live measurements were taken in Chrome against
`aheedfoodcentre.nocaped.com`. The desktop browser cannot be narrower than 501px, so every
"mobile" measurement below was taken at 501×694. That is still under Tailwind's `sm` breakpoint
(640px), so the mobile layout is what rendered. Behaviour at 320–430px is **inferred, not
measured**. Measuring at real device widths needs the Playwright harness `#440` has not built yet.

**Most of the brief is already built, and is recorded as such so it is not rediscovered.**

- *Header basket with count and subtotal:* `CartDrawerShell` renders both, and the aria-label says
  "Cart, N items".
- *Add then quantity stepper on the card:* `ProductCard` swaps `AddToCartButton` for
  `CartQuantityStepper` once a product is in the cart (`#345`). The stepper names the product in its
  labels and coalesces writes.
- *One source of truth for delivery rules:* the brief's §22 and §44. The hero, cart drawer and
  checkout all read `getShopperDeliveryRules` and `fulfilmentProgress` (`#890`, `#748`). The
  hardcoded "Free Delivery Over £30" was removed in `#239`.
- *Search:* autocomplete and suggestions (`#568`), a staff-approved synonym dictionary (`#566`),
  zero-result recovery (`#580`) and the AI shop list (`#567`).
- *Guest checkout, saved addresses (`#764`), slot capacity shown in `SlotPicker`, loyalty
  redemption and discount codes* all exist.
- *Restoring the basket after a cancelled Stripe payment:* the `cancel` page puts the lines back
  (`#428`).
- *Reorder from a past order:* `#124`.
- *Multi-buy on the card:* `#348`.

**Already tracked, so not findings:**

- Typo tolerance: `#286`.
- Unit pricing: `#398`. It is inert because no product carries net content (`#697`).
- Sort control: `#664`, with new evidence added.
- Resuming payment: `#100`, with new evidence added.
- Image weight: `#439`, with new evidence added.
- Bottom navigation: `#395`, challenged below.
- Accessibility launch validation: `#442`. Prior contrast, focus and motion findings: the 2026-09-07
  pass.
- Hardcoded currency: `#654`.
- Desktop mega-menu: `#394`.

**Challenges to the brief.**

- *"Pay £X" as the final button.* The total depends on a discount code and loyalty points, both
  validated on the server in `place-order`, and the next screen is Stripe's hosted page. The label
  cannot be exact before submission. Show the total above a "Continue to payment" button (`#959`).
- *A bottom-sheet filter panel.* `FilterPanel` is a native `details` disclosure **by recorded
  decision**, so filters keep working with JavaScript off. A sheet would undo that. The brief's
  goal (filters not dominating the page) is already met on mobile.
- *A product detail page with a sticky Add CTA (§18–19)* conflicts with `#830`, which removed
  drill-down from the card in favour of Quick View. Whether the product page is a destination is an
  owner ruling. `#955` shows the SEO cost of the current answer.
- *Bottom navigation (§42):* the brief argues against it by default, which supports challenging
  open `#395`. A comment has been added there.
- *As a whole,* the brief is a redesign programme, not a slice. Its P0 list spans header,
  search, card, basket and checkout at once. Taking it as a single milestone would break "build
  only what the stage requires". The findings below are the defects worth carving out first.

### 2026-10-02 — product pages are invisible to crawlers, and robots.txt de-indexes every vendor but Aheed

**Trigger:** explicit /discover (mobile redesign brief, §47 "preserve SEO-friendly URLs")
**Status of the area:** genuinely unowned. Filed as `#955`.

**Observed (verifiable today):** `app/sitemap.ts` returns only `/`, and live `/sitemap.xml` on both
production hosts holds a single URL. Since `#830`, the `ProductCard` title is a `button` that opens
Quick View, and `QuickViewDrawer` links only to `/login`. Live `/categories/fruit-veg` contains
**zero** `href="/products/…"` links. `#830`'s plan (line 46) claims the product route stays
reachable for "SEO … and sitemap crawling". `app/robots.ts` hardcodes
`PRODUCTION_HOST = "aheedfoodcentre.nocaped.com"`, and live `srimart.nocaped.com/robots.txt` returns
`Disallow: /`.
**Interpretation:** crawlers can reach the homepage and category pages, and nothing below them.
Every vendor other than Aheed is de-indexed in production by a hostname literal, which breaks
ADR-004's "nothing vendor-specific in code".
**Confidence:** Known for the facts. The commercial size is Inferred: no search-console data exists.

**Why it matters commercially:** a local grocer's cheapest acquisition is people searching for an
item and a town. Indexing takes weeks, so the gap costs most just after trading starts (`#113`).
**Options considered:** build the sitemap from data (cheap, no UI change). Restore a real product
link under Quick View using the stretched-link pattern `ProductCard`'s stale doc comment still
describes (this partly reverses `#830`, so it is an owner ruling). Decide robots from environment
or `VendorDomain`. Doing nothing is only tenable while the platform has not traded.
**Cost of delay:** low until launch, then rising week by week.

**Next action:** PROPOSE

### 2026-10-02 — add to cart says "Added" when the server added nothing, and every card's button is named "Add"

**Trigger:** explicit /discover (brief §13–15, §35)
**Status of the area:** genuinely unowned. Filed as `#956`.

**Observed (verifiable today):** `AddToCartButton` sets `added` as soon as `addToCart` resolves.
`addCartItem` (`lib/repositories/cart.ts:314-324`) returns normally when stock is 0, and clamps a
request above stock without saying so. The card variant ignores its `label` prop, so live
`/categories/fruit-veg` has 8 buttons whose accessible name is just "Add", and pre-add buttons named
"Decrease quantity" with no product. There is no live-region announcement on add, and no `catch`
around the action.
**Interpretation:** a product that sells out between render and tap, or a request for more than
remain, shows a false "✓ Added". Screen-reader users cannot tell the grid's Add buttons apart.
**Confidence:** Known (code path read). The sold-out race was not reproduced live.

**Why it matters commercially:** fresh stock is volatile. A shopper who saw "Added" does not check
again, and the item is missing at checkout or at the door, which is a first-order trust failure.
**Options considered:** have the action return the outcome (added, quantity, reason) and render it.
Name the button from the existing `label` prop. Add a `role="status"` region. Doing nothing leaves
a false confirmation in the most-used control on the site.
**Cost of delay:** grows with real stock movement after launch.

**Next action:** PROPOSE

### 2026-10-02 — reorder silently drops unavailable lines and clamps quantities

**Trigger:** explicit /discover (brief §31 "do not add unavailable products silently")
**Status of the area:** genuinely unowned. Reorder itself was built in `#124`. Filed as `#957`.

**Observed (verifiable today):** `features/orders/reorder-items.ts` passes every line of a past
order to `addCartItems` and redirects to `/cart` with no message. `addCartItems`
(`lib/repositories/cart.ts:353`, `:363-368`) drops inactive or out-of-stock products and clamps the
rest to stock. Lines whose product was deleted are filtered out earlier. `cancel-order.ts:55`
restores an unpaid order through the same path.
**Interpretation:** the grocery case is a weekly shop of about 20 lines that comes back as 18, with
nothing telling the shopper which 2 are missing.
**Confidence:** Known.

**Why it matters commercially:** "same as last time" is the whole value of reorder, and a forgotten
item is the most common grocery complaint. Customers who rely on reorder are the repeat customers.
**Options considered:** a one-time notice on `/cart` listing what was skipped or reduced (cheap).
Suggested substitutes (larger, overlaps `#606`). Doing nothing.
**Cost of delay:** none before launch. After launch it lands squarely on repeat customers.

**Next action:** PROPOSE

### 2026-10-02 — checkout and sign-in fields carry no autocomplete tokens

**Trigger:** explicit /discover (brief §23, §35)
**Status of the area:** genuinely unowned. Filed as `#958`.

**Observed (verifiable today):** in `components/checkout/CheckoutForm.tsx`, name, email, phone,
both address lines, city, county and postcode have no `autoComplete` attribute. Neither do
`LoginForm`, `RegisterForm` or `ResetPasswordForm`. There are 5 `autoComplete` attributes in the
whole storefront.
**Interpretation:** a WCAG 2.2 SC 1.3.5 (Level AA) failure. It is also the largest avoidable cost in
mobile checkout: phone autofill and password managers key off these tokens.
**Confidence:** Known.

**Why it matters commercially:** a guest on a phone types about 8 fields by hand, where autofill
would take one tap. That is the classic point of checkout abandonment.
**Options considered:** add the standard tokens and a guard test asserting they are present. Very
small. No credible reason not to.
**Cost of delay:** none to fix later, but every pre-fix order pays the friction.

**Next action:** READY FOR SPEC

### 2026-10-02 — checkout step numbers repeat or skip, and on mobile the total sits below the submit button

**Trigger:** explicit /discover (brief §23, §25)
**Status of the area:** genuinely unowned. Filed as `#959`.

**Observed (verifiable today):** `CheckoutForm.tsx` numbers contact `offerCollection ? "1" : "1"`
and address `offerCollection ? "2" : "2"`; time is `"3"` or `"2"`; discount `redeemable ? "4" : "3"`.
The sequences shown:

- Delivery with slots: 1, 2, 3, 3.
- With loyalty: 1, 2, 3, 4, 4.
- Click & Collect: 1, 3, 3.

`checkout/page.tsx` renders the form and then `CheckoutSummary` in a grid that stacks below `md`,
so on mobile the total comes after "Place order".
**Interpretation:** the only progress cue on a phone reads as broken, and the amount is not visible
before the shopper commits on mobile. Stripe does show it on the next screen.
**Confidence:** Known for the code. Which sequence Aheed shows depends on its live configuration
(Inferred).

**Why it matters commercially:** this is checkout trust at the last step. Small to fix.
**Options considered:** compute the numbers from the sections actually rendered. Move or duplicate
the total above the button on mobile. Label the button "Continue to payment". Not "Pay £X", as
argued in the challenges above.
**Cost of delay:** low, but it is visible to every shopper who reaches checkout.

**Next action:** PROPOSE

### 2026-10-02 — the mobile sticky header is a third of the viewport

**Trigger:** explicit /discover (brief §4, §41)
**Status of the area:** genuinely unowned. `#395` is a bottom bar, which is a different thing.
`#333` was header-row reflow. Filed as `#960`.

**Observed (verifiable today):** live at 501×694 in the mobile layout, `header` measures **232px**
and is `sticky top-0`. That is 33% of the viewport, made up of the banner, the logo and nav row,
and a mobile row holding `LocationControl` and search. On `/categories/fruit-veg` the first
product card starts at **y=757**, below the first screen.
**Interpretation:** while scrolling a category, roughly one row of products is visible at a time.
At 360–390px the wrapped banner and toggle likely make it taller.
**Confidence:** Known at 501px. Needs validation at real device widths.

**Why it matters commercially:** browsing is the main grocery mode after search, and screen space
taken by chrome directly reduces how many products are seen.
**Options considered:** make only logo + search + basket sticky (cheap, no JS). Compact the header
on scroll (needs client JS in a zero-JS server header). Do nothing (needs `#607` data to defend).
**Cost of delay:** low. The cost is UX that compounds with `#961`.

**Next action:** PROPOSE

### 2026-10-02 — primary mobile shopping controls are 24 to 32px

**Trigger:** explicit /discover (brief §15, §35, §41)
**Status of the area:** genuinely unowned. `#665` is primitive adoption, not sizing. Filed as `#961`.

**Observed (verifiable today):** live bounding boxes in the mobile layout:

- Card Add button: 108×32.
- Pre-add minus and plus: 28×30.
- In-cart stepper: 24×24 (`h-6 w-6`).
- Mobile Quick View: 29×28.
- Header Shop and Shop List: 34×34.

62 of 79 header and main controls are under 44px on at least one side.
**Interpretation:** this is **not** a WCAG AA failure. SC 2.5.8 needs 24×24, which all of them
meet. It falls short of SC 2.5.5 (AAA), Apple's 44pt and Material's 48dp, and the most-tapped
controls are the smallest.
**Confidence:** Known for the measurements. The user impact Needs validation: no usability data
exists.

**Why it matters commercially:** older shoppers and one-handed use are the brief's named audiences.
Mis-taps on adjacent minus and plus controls produce wrong quantities.
**Options considered:** a shared minimum-size token through `#665`'s primitives. Larger only for
the in-cart stepper (the 24px outlier). Doing nothing is defensible on conformance grounds.
**Cost of delay:** low. The trade-off is card height against `#960`.

**Next action:** PROPOSE

### 2026-10-02 — the product grid has an odd-column tablet step and no configuration

**Trigger:** explicit /discover (an owner follow-up during the same review: "make the cards
configurable, even numbers would be better")
**Status of the area:** genuinely unowned. Filed as `#962`.

**Observed (verifiable today):** listings hardcode `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4` in
three places: category (`categories/[slug]/page.tsx:176`), search (`search/page.tsx:292`) and
bundles (`bundles/page.tsx:82`). `PAGE_SIZE` is 12, so full pages fill evenly at 2, 3 or 4 columns.
Short pages do not: live `/categories/fruit-veg` has 8 products, which the 3-column step renders as
3 + 3 + 2. `FilterPanel`'s 240px sidebar from `md` leaves about 500px for the grid at 768–1023px.
**Interpretation:** the 3-column step is what produces ragged rows and a second change in card width.
Even steps (2 then 4) avoid both. Four columns cannot start at `md`, because each card would be
about 110px wide beside the sidebar.
**Confidence:** Known for the layout. The owner's preference for even counts is stated direction,
not measured user behaviour.

**Why it matters commercially:** cleaner rows read as a tidier shop. Per-vendor density matters
because grocery cards and electronics cards want different widths.
**Options considered:**

- Even columns only (2 below `lg`, 4 from `lg`). Cheapest.
- Vendor density presets stored as an enum, mapped to static class strings, because Tailwind cannot
  build `grid-cols-` classes from runtime values. One shared `ProductGrid` component, so the three
  call sites cannot drift.
- A free per-vendor column number, rejected: it allows layouts that break the card.
- A shopper-side grid/list toggle, deferred until analytics exist (`#607`).

**Cost of delay:** low. Interacts with `#960` and `#961`: all three decide how many products fit
on a phone screen.

**Next action:** PROPOSE

### 2026-10-02 — the homepage has no shoppable product and nothing for a returning customer

**Trigger:** explicit /discover (brief §6, §31)
**Status of the area:** genuinely unowned as a question. The landing layout was a deliberate P8.5f
decision.

**Observed (verifiable today):** live `/` in the mobile layout has three blocks below the header: a
596px hero, a department strip, and customer testimonials. It has **no product card and no add
control**. Reorder is reachable only from `/account/orders/[orderNumber]`. There is no "buy again"
or recently-purchased surface anywhere.
**Interpretation:** a repeat weekly shopper, the core grocery customer, starts every visit from a
brand page and has to search again or dig into their order history.
**Confidence:** Inferred. Whether returning customers land on `/` at all is unknown, because no
analytics exist (`#607`).

**Why it matters commercially:** a buy-again surface is the highest-leverage repeat-purchase
feature in grocery. Whether the homepage is the right place for it depends on traffic data that
does not exist.
**Options considered:** a signed-in "buy again" rail built from past order lines (the data exists).
Popular products on `/`. Waiting for `#607`. Not filed: the first question is where returning
customers actually arrive, and that needs data.
**Cost of delay:** none before launch. After launch, `#607` should land first.

**Next action:** RESEARCH MORE

---

## 2026-09-24 — sixth Discover pass (delivery-area geography, `#613`)

An explicit `/discover` on `#613`: what exists, what is left, what competitors do, and what open
source could supply. It ran while `#613`'s `/propose` (exclusions plus ranges) awaited approval, so
it doubles as a challenge to that proposal. **Three genuinely unowned findings**, one already
tracked item with new evidence, and one `DO NOT PURSUE`.

**External reference points, labelled as such.** Shopify local delivery defines a zone as a
postcode-prefix list (asterisk or trailing space for a group) **or** a radius from the store
(up to 160 km), with a minimum order price and up to three price rules **per zone**, ten zones per
location ([Shopify Help Center](https://help.shopify.com/en/manual/fulfillment/setup/delivery-methods/local-delivery)).
WooCommerce zones take exact postcodes, wildcards and numeric ranges, and handle exclusion by
*absence* or by an empty zone rather than by a negative rule
([WooCommerce docs](https://woocommerce.com/document/setting-up-shipping-zones/)). UK supermarkets
vary the delivery charge by postcode and slot, and apply small-basket charges below a threshold
([Sainsbury's help](https://help.sainsburys.co.uk/help/delivery-collection/grocery-delivery-times)).
Open-source routing engines — Valhalla and OpenRouteService for drive-time isochrones, VROOM for
round optimisation — all consume OpenStreetMap and are **self-hosted servers**
([Valhalla](https://github.com/valhalla/valhalla), [VROOM](https://github.com/VROOM-Project/vroom/blob/master/README.md)).
None of this was measured against Aheed; it is what the market treats as normal.

**Already tracked, with new evidence: `#613` itself is largely implemented.** `lib/delivery.ts:21-34`
matches a stored district (`MK9`) exactly against the shopper's outward code and a stored area
(`MK`) against every district in it; `lib/delivery-area-form.ts:39` accepts both shapes; the staff
form explains both (`components/staff/DeliveryAreaManager.tsx:58`); tests pin `MK9` versus `MK17`
(`tests/delivery-eligibility.test.ts:96`, `tests/is-deliverable.test.ts:38`). All of it arrived
unspecified inside `#402`'s build commit `2f0f20c` (2026-09-12) — `#402`'s spec never mentions it.
Every consumer (checkout, header badge, `/api/address/lookup`) goes through the one matcher. Stale
prose still describes the old behaviour: the header comment of `lib/delivery-area-form.ts` (a
`RegExp` matcher and a letters-only allow-list, both gone), `prisma/schema.prisma:418` ("district
prefix, e.g. MK" — that is an area), and `#613`'s own body. `#761`'s premise that the delivery
cluster never touched `#613` is **partly wrong**: the mechanism did ship with that cluster, just
not under its own spec. Evidence goes to `#613`, not a new issue.

**Challenge to the pending `#613` proposal.** "All of MK except MK17" is already expressible today
as a list of MK's districts minus MK17 — roughly eighteen rows, which a range-input shortcut would
make a one-line entry with **no schema change**. Neither reference platform models a negative rule.
An `excluded` column on `VendorDeliveryArea` is also the wrong shape if per-zone charges (finding
below) ever land, because those want a *zone* that owns fee, minimum and member districts — at
which point exclusion is again just absence. Recommendation for `/propose` to weigh, not a
decision: ship ranges as input expansion plus the documentation fixes now, and defer the
exclusion column until a zone model is decided. Confidence: **Known** for the code facts,
**Inferred** for the modelling argument.

**Already tracked, evidence added: per-area capacity.** The 2026-09-02 entry below ("an order
carries no delivery date, slot or capacity ceiling") is still `RESEARCH MORE`. `#401` has since
shipped slots with a capacity, but `VendorFulfilmentSlot` (`prisma/schema.prisma:274-287`) carries
no area link — capacity is per vendor per window, so one far-flung district can consume a van
round meant for the town centre. Same conversation with Aheed about vans and rounds; not a new
finding.

### 2026-09-24 — radius-from-store eligibility is buildable from data already in production

**Trigger:** explicit `/discover` on `#613`.
**Status of the area:** genuinely unowned. No issue mentions a radius or distance-based delivery
area (searched open and closed). `#613` is prefix granularity only; ADR-004's `Region`/`Location`
tables are named places, not distance.

**Observed (verifiable today):** `PostcodeReference` in the reference database stores OS
eastings/northings for every materialised postcode (`prisma/reference/schema.prisma:170-185`), and
`lib/reference/postcode-reference-service.ts:158` already converts them. `VendorLocation` holds the
store's own `postcode` (`prisma/schema.prisma:424-434`). British National Grid coordinates are
metres, so a straight-line distance is plain Pythagoras — no PostGIS, no external API, no new data.
Shopify offers radius as one of its two zone types.

**Interpretation:** a vendor could say "within 8 km of the shop" instead of curating a district
list, which matches how a single-van independent grocer actually thinks about reach better than
postcode geography does (districts are irregular; `MK17` spans rural villages several times
further out than its number suggests). It could sit beside prefix rules rather than replace them.

**Confidence:** Known for the data. **Needs validation** for usefulness: crow-flies distance
ignores rivers, the M1 and one-way systems, and Aheed has not said how it plans rounds. Two hard
edges: coverage is only `MK` and `RG` today, so a radius crossing into an unmaterialised area must
degrade to `UNVERIFIED` (the standing rule) rather than refuse; and a radius needs the store's
coordinates, which exist only while its own postcode is inside materialised coverage.

**Why it matters commercially:** removes the most error-prone configuration a vendor does
(guessing which districts are reachable) and makes onboarding a second vendor a one-number
setting. Wrong reach either loses orders or commits the van to unprofitable drops.
**Options considered:** do nothing (districts are sufficient for one vendor with one van); radius
only; radius plus prefix override; drive-time isochrones (see the `DO NOT PURSUE` entry below).
**Cost of delay:** low while one vendor trades from one site. Rises with the second vendor, and
with `#422` if Aheed ever trades from a second site.

**Next action:** PROPOSE

### 2026-09-24 — refused postcodes are discarded, so the district list is set by guesswork

**Trigger:** explicit `/discover` on `#613`.
**Status of the area:** genuinely unowned. Nothing records an out-of-area refusal: the only trace
is the message returned by `lib/delivery-eligibility.ts:137` ("Sorry — we don't deliver to ... yet").
No issue covers a waitlist, demand capture or out-of-area analytics.

**Observed (verifiable today):** eligibility is computed and returned per request (header badge,
checkout, `/api/address/lookup`) and nothing persists the refused postcode. `#613` and the
2026-09-02 capacity finding both say the district list needs "operational input from Aheed" — but
the platform holds no demand evidence to give that conversation.

**Interpretation:** a count of refusals per postcode **district** per day — no full postcode, no
identity, no cookie — would tell Aheed which excluded districts customers actually try, which is
exactly the input `#613`'s own decision lacks. District-level aggregates are not personal data, so
this stays clear of PECR consent and of `#104` (no email). A "tell me when you deliver here" email
list is the richer competitor pattern but needs consent handling and a working sending domain, so
it is the second step, not the first.

**Confidence:** Known that nothing is recorded. **Inferred** that the signal will be useful: the
platform has never traded, so volumes will be tiny until launch.

**Why it matters commercially:** turns "should we deliver to MK17?" from a guess into a number,
and costs almost nothing per request. A grocer extending reach one district at a time is the
normal growth path.
**Options considered:** do nothing; aggregate district counts (cheapest, privacy-neutral);
consented email waitlist (needs `#104`); full postcode logging (needless personal-data risk).
**Cost of delay:** every day of trading without it is demand evidence permanently lost; before
launch the cost is near zero, which makes pre-launch the cheap moment to add it.

**Next action:** PROPOSE

### 2026-09-24 — delivery charge and minimum order are vendor-wide, so far districts are subsidised

**Trigger:** explicit `/discover` on `#613`.
**Status of the area:** genuinely unowned. `#634` (closed) made the three values editable but kept
them vendor-wide; no issue proposes varying them by area.

**Observed (verifiable today):** `VendorConfig.deliveryFeePence` (default 349),
`freeDeliveryThresholdPence` and `minimumOrderPence` are single per-vendor columns
(`prisma/schema.prisma:372-374`). Shopify allows a minimum and price rules per zone; UK
supermarkets vary charge by postcode and slot.

**Interpretation:** with a flat fee, a drop in an outlying village costs the same to the customer
as one next to the shop while costing the van several times the time. For heavy, low-margin
grocery baskets that is where delivery economics break first. The honest counter-position: at one
van and pre-launch volumes, a flat fee is simpler to explain, and complexity here may cost more
conversions than it recovers.

**Confidence:** Known for the schema. **Needs validation** for the economics — no order has been
placed, so there is no cost-per-drop figure, and none should be invented.

**Why it matters commercially:** margin per delivery on the edge of the footprint; it is also the
main reason a zone model (fee and minimum owned by a zone, districts as members) might be needed —
which is why it bears on the `#613` schema shape now.
**Options considered:** do nothing; a per-area surcharge column; a zone entity owning fee, minimum
and member districts; distance-based pricing off the radius finding above.
**Cost of delay:** low until trading. The one near-term cost is designing `#613`'s schema without
considering it.

**Next action:** RESEARCH MORE

### 2026-09-24 — drive-time isochrones and route optimisation (OpenRouteService, Valhalla, VROOM)

**Trigger:** explicit `/discover` on `#613`, asked directly whether open source could do this.
**Status of the area:** genuinely unowned; recorded so it is not rediscovered.

**Observed (verifiable today):** all three are self-hosted server processes built on
OpenStreetMap extracts (OpenRouteService has the highest memory needs of the engines compared).
None runs inside a Cloudflare Worker. The runtime is Workers-only (`CLAUDE.md`), and the project
is explicitly cost-effective and vendor-agnostic (ADR-004).

**Interpretation:** a drive-time polygon ("20 minutes from the shop") is the most accurate
delivery-area model available, and VROOM would plan van rounds with time windows and capacity.
Both need an always-on server to host, patch and refresh with map data — new infrastructure for a
platform with one vendor, one van, zero orders. The radius finding above captures most of the
benefit with data already owned.

**Confidence:** Known for the hosting constraint; Inferred for the cost/benefit.

**Why it matters commercially:** would matter at multi-van volume; does not before launch.
**Options considered:** self-host ORS or Valhalla; a hosted routing API (a new vendor and per-call
cost on the request path); precompute isochrones offline and store them (needs polygon storage,
which the no-`Json` rule and the absence of PostGIS make awkward); do nothing.
**Cost of delay:** none now. Revisit trigger: more than one van, or order volume where manual
round planning visibly costs time.

**Next action:** DO NOT PURSUE

---

## 2026-09-07 — fifth Discover pass (multi-industry design-system refactor brief)

An explicit `/discover` over the whole frontend, prompted by a brief proposing a reusable
multi-industry commerce design system — tokens, UI primitives, commerce components, layout, page
consistency, responsive behaviour, accessibility, and industry decoupling — with the existing
product-card motion named as reference behaviour to preserve. **Eight genuinely unowned findings.**

**The brief's central premise does not survive contact with the code, and that is the most useful
thing this pass produced.** The proposed layering is
`DESIGN SYSTEM -> THEME -> STORE CONFIGURATION -> REUSABLE COMMERCE COMPONENTS -> FEATURES`, with
the platform reusable across verticals "primarily through theme/configuration rather than code
forks". Grounding that in `prisma/schema.prisma` shows the blocker is **the data model, not the UI
layer**, and it is **already owned by #398** — recorded below as an already-tracked item with
evidence added to that issue rather than as a new finding.

**Three of the brief's audit areas are already implemented and are recorded as such.** *Motion
centralisation*: `.skew-card*` lives once in `app/globals.css` and is shared by both
`components/product/ProductCard.tsx` and `components/bundle/BundleCard.tsx` — there is **no
duplicated card-motion implementation to consolidate**, and the brief's expectation of one is
wrong. *Theme-as-data*: `lib/vendor-theme.ts`'s `brandStyle()` already delivers per-vendor colour
through `clampForContrast`, enforced by `tests/design-tokens-contrast.test.ts` and
`tests/panel-token-purity.test.ts`; the remaining gap (six seed-only primitives, an unusable
branding form) is **#639**. *Status messaging*: the `role="alert"` / `role="status"` pair is used
consistently across roughly 20 components. **Two more are already tracked**: the product card's
nested-interactive-controls defect is **#351**, and a named theme catalogue is **#75**.

### 2026-09-07 — alpha-modifier text fails WCAG AA at roughly 240 sites, silently discarding the contrast clamp the platform is built on

**Trigger:** explicit `/discover`, auditing design tokens against the rule
`specs/design-system.md` states for them.
**Status of the area:** genuinely unowned. `#442` is accessibility *validation of the deployed
candidate* and explicitly says "do not reopen historical accessibility issues" — it would surface
this late rather than own it. `#512` and `#641` are single-site token issues of a different class
(raw hex, and a hover tint).

**Observed (verifiable today):** counted across `app/`, `components/` and `features/` `.tsx`,
excluding the generated `app/(admin)/staff/runbook/docs.ts` — `text-primary/70` appears **101 times
across 51 files**, `text-primary/60` **102 times**, `text-primary/50` 12, `text-primary/40` 10,
`text-primary/30` 3, and `text-black/50` 10. Computed with sRGB relative luminance, compositing
each over the surface it renders on: `text-primary/70` on white is **3.78:1** for Aheed
(`--color-primary` `#1b5e20`) and **4.10:1** for SriMart (`#0d47a1`); `text-primary/60` is
**3.01:1** and **3.23:1**; `text-primary/50` is **2.43:1**; `text-black/50` is **3.98:1**. All are
under the 4.5:1 AA threshold for normal text. `text-black/60` (5.74:1) and `text-black/70`
(8.52:1) pass and are out of scope. `specs/design-system.md`'s "Accessibility and Compliance"
section already forbids exactly this and names these exact utilities as its counter-example:
"Never use opacity layers below 80% (e.g. `text-primary/70` or `text-black/50`) for functional text
or links against light backgrounds ... as they mathematically fall below the 4.5:1 contrast
threshold." Sampling the sites, they carry page descriptions, empty-state messages, list metadata
and — through `labelClass`, duplicated **verbatim in 15 files** — every form label in the
application, at `text-xs`.

**Interpretation:** this is the most-invested-in guarantee in the repo being bypassed by a
one-character suffix. `brandStyle()` runs every vendor's `--color-primary` through
`clampForContrast`, which raises the value until it clears 4.5:1; an alpha modifier then composites
it back down below the floor. The better the clamp does its job — the closer it lands a vendor to
exactly 4.5:1 — the worse `/70` renders, so this gets *more* wrong as more vendors onboard, not
less. Three controls miss it for three different reasons: the contrast test measures token values
at full opacity and cannot see a paint-time alpha, `jsx-a11y` ships no contrast rule, and the rule
that would catch it exists only as prose in a spec — which `CLAUDE.md` already records, in the
GAP-011 note, as not being a control at all.

**Confidence:** Known. The counts are grep output and the ratios were computed from the seeded
primitives read out of `prisma/seed.ts`. Which subset of the roughly 240 sites is genuinely
non-functional text (WCAG exempts disabled controls and pure decoration) is Needs validation and is
the first question a `/spec` has to answer.

**Why it matters commercially:** the failing treatment is the default for form labels across
checkout, the account forms and the whole staff panel — the text a shopper must read to complete a
purchase, and the text a shop manager must read to price a product correctly. It is also a UK
Equality Act exposure on a public retail site, and it is the single largest accessibility defect
count in the codebase.

**Options considered:** add clamped semantic tokens for muted and secondary text and replace the
alpha modifiers at the call sites, restoring the guarantee at the token layer where the existing
machinery already lives, plus a source-level sweep test in the shape of
`tests/panel-token-purity.test.ts` so a re-introduced `text-primary/70` fails CI; fix only the
`labelClass` and `text-primary/50` and below instances, deferring the rest as a judgement call per
site (cheaper, and it leaves 200 sites needing the same judgement again later); do nothing and let
`#442` find it during launch validation, which is exactly when P9.3's exit gate wants no
launch-severity UX defect remaining.

**Cost of delay:** it compounds with every new page, because the failing value is what a developer
copies from the file next door — 15 verbatim `labelClass` copies are the proof.

**Next action:** PROPOSE — filed as **#649**.

---

### 2026-09-07 — 27 sites suppress the focus outline and 2 replace it; every form field indicates focus by a 1px border alone

**Trigger:** explicit `/discover`, auditing the brief's accessibility area against the real markup.
**Status of the area:** genuinely unowned. `tests/a11y/` covers focus *management* for the cart
drawer (move in, trap, restore, Escape) and the cookie banner; nothing anywhere asserts that a
focused control is visibly indicated.

**Observed (verifiable today):** `focus:outline-none` appears **27 times** across `app/`,
`components/` and `features/`. `focus-visible:ring-*` appears **twice**, both in
`components/product/SearchSuggestionsNotice.tsx`; `focus:ring-*` appears 9 times. The remainder
replace the browser's outline with a border-colour change alone. The largest single group is the
shared field style, duplicated **verbatim in 11 files** —
`w-full rounded-xl border border-black/15 bg-surface-muted px-3 py-2 text-sm focus:border-primary focus:bg-white focus:outline-none`
— across `components/checkout/CheckoutForm.tsx`, `components/account/NameForm.tsx`,
`EraseDataForm`, `components/staff/ProductForm.tsx`, `CategoryForm`, `BundleForm`, `CampaignForm`,
`DiscountCodesPanel`, `LoyaltyConfigForm`, `BrandManager` and `DeliveryAreaManager`. Separately,
`aria-invalid` appears in exactly one file (`components/staff/SynonymDictionary.tsx`) and
`aria-describedby` in exactly one (`components/orders/GuestEraseForm.tsx`), while
`errorInputClass = "border-danger bg-danger-tint"` — a colour-and-border-only invalid state with no
programmatic association — is duplicated in 8 places, including all four of `ProductForm`,
`CategoryForm`, `BundleForm` and `CampaignForm`, none of which set either attribute.

**Interpretation:** two distinct WCAG failures share one cause. The focus one is SC 2.4.11 (Focus
Appearance): a 1px border swap does not meet the required indicator area or contrast change, it
fires on mouse click as well as keyboard because `focus:` rather than `focus-visible:` is used, and
it disappears entirely in Windows High Contrast mode — where the user's own accessibility setting
overrides author border colours, leaving nothing, because the system outline has already been
suppressed. The error one is SC 3.3.1 plus SC 1.3.1: a field marked wrong by colour and border
only. Both were written once and copied, which is why the count is 11 and 8 rather than 1 and 1 —
the same mechanism as the finding above.

**Confidence:** Known for every count and file, all read directly. That the border-only indicator
fails SC 2.4.11 in a real audit is Inferred from the criterion's wording rather than measured with
tooling; the forced-colors consequence is Known from how that mode works.

**Why it matters commercially:** a keyboard-only or screen-magnifier shopper cannot tell which
checkout field they are in. This is the same audience and the same page as the finding above, and
the two would be found together by any real accessibility audit.

**Options considered:** define one focus-ring treatment in the design system, switch `focus:` to
`focus-visible:`, and adopt it wherever the outline is currently suppressed unreplaced — one edit
that also fixes the duplication, since the sites are the same 11 constants; add the ring at the
call sites without consolidating (faster, and it leaves 11 copies to drift); handle the error
association separately with `aria-invalid` and `aria-describedby` on the four staff forms; do
nothing.

**Cost of delay:** low technically. But `#442` is a launch gate and both of these are the kind of
defect it exists to block, so finding them there converts a contained fix into a late blocker.

**Next action:** PROPOSE — filed as **#650**.

---

### 2026-09-07 — the reduced-motion opt-out is class-scoped and misses 24 utility transforms, one of them inside the product card itself

**Trigger:** explicit `/discover`, grounding the brief's "preserve the existing product-card
animations" constraint in the components and CSS responsible.
**Status of the area:** genuinely unowned.

**Observed (verifiable today):** `app/globals.css`'s
`@media (prefers-reduced-motion: reduce)` block resets `.skew-card`, `.skew-card-inner`,
`.skew-card-badge` and `.skew-card-price` — by class name. `components/product/ProductCard.tsx:94`
renders the product photo with `transition-transform duration-500 group-hover:scale-105`, which is
in none of those classes. The image is a descendant of `.skew-card-inner`, and `transform` is not
an inherited property, so `transform: none` on the ancestor does not reset the child's own scale.
`components/bundle/BundleCard.tsx:73` carries the identical line. Across the repo there are **24
transform-based interaction sites with no reduced-motion coverage of any kind**: `active:scale-95`
in 13 files (`AddToCartButton`, `CheckoutForm`, `NameForm`, `EraseDataForm`, `ProductForm`,
`CategoryForm`, `CampaignForm`, `DiscountCodesPanel`, `LoyaltyConfigForm`, `ProductImageManager`,
`ProductImageUploader`, `DepartmentHero`, `app/(storefront)/account/data/page.tsx`),
`group-hover:scale-105` on the two card images, `group-hover:scale-110` on
`app/(landing)/page.tsx`'s step markers, and 3 `animate-spin` indicators. The Tailwind
`motion-reduce:` variant is used **nowhere**. `specs/design-system.md`'s Motion section states the
rule this breaks — "Every motion effect has a reduced-motion opt-out" — and closes by noting "No
lint rule checks any of this".

**Interpretation:** with `prefers-reduced-motion: reduce` set, hovering a product card correctly
stops the skew and the lift, and still runs a 500ms 5% image zoom. The block's own comment states
the intent it misses. This is the one part of the existing card motion that is **wrong** rather
than merely unstandardised — which matters directly to the brief, because a refactor that
centralises the card's motion contract before fixing it would propagate the gap into whatever
generic component replaces it. It also shows the real shape of the brief's motion work: the
durations and easings are literals repeated across five CSS rules (380ms, 350ms, 300ms, 500ms) with
Tailwind's implicit 150ms default alongside them and no `--ease-*` or duration tokens in `@theme` —
but the *card* motion is already shared, so there is nothing to de-duplicate there.

**Confidence:** Known for the counts, the file lines and the absence of `motion-reduce:`. That the
image visibly still zooms under the preference follows from CSS inheritance rules and was not
observed in a browser — Needs validation, and cheap to confirm under `npm run preview` with the OS
preference set.

**Why it matters commercially:** `prefers-reduced-motion` is set by people for whom motion causes
nausea or migraine. The product grid is the most-hovered surface on the site, so the one unguarded
effect is also the most frequently triggered.

**Options considered:** one global reduced-motion rule neutralising transform transitions on the
utility sites too (smallest, but must not become a global element-selector transition rule —
`specs/design-system.md` Motion rules 1 and 2 exist because that caused #324's layout thrashing and
#326's broken carousel dot); explicit `motion-reduce:` variants at each of the 24 sites (verbose,
but local and greppable); leave it. In all cases **the durations, easings and transforms themselves
stay untouched** — the existing card motion is intentional reference behaviour.

**Cost of delay:** none accruing, except that any motion-standardisation work done first would copy
an incomplete contract.

**Next action:** PROPOSE — filed as **#651**.

---

### 2026-09-07 — six storefront pages, including sign-in and registration, render with a zero-pixel mobile gutter

**Trigger:** explicit `/discover`, auditing the brief's responsive area.
**Status of the area:** genuinely unowned. `#395` is a mobile sticky bottom nav, a different thing.

**Observed (verifiable today):** `app/(storefront)/login/page.tsx:18`, `register/page.tsx:18`,
`forgot-password/page.tsx:7`, `reset-password/page.tsx:8`, `account/page.tsx:27` and
`account/data/page.tsx:40` each render `<main className="mx-auto max-w-sm">` — no padding class of
any kind. Nothing upstream supplies one: `app/(storefront)/layout.tsx` delegates to
`components/layout/StorefrontChrome.tsx`, which wraps children in a bare
`<div className="flex-1">`. `max-w-sm` resolves to `--container-sm: 24rem` = 384px
(`node_modules/tailwindcss/theme.css:336`), so on any viewport narrower than 384px — an iPhone SE
at 375px, a 360px Android — `mx-auto` contributes nothing and the content runs edge-to-edge.
Separately, there is no `Container` or `Page` primitive at all: each of the 24 storefront pages
hand-writes its wrapper, producing **eight distinct content widths** — `max-w-7xl` on the browse
pages, `max-w-4xl` on product detail and the content pages, `max-w-3xl` on cart and checkout,
`max-w-2xl` on the account pages, plus `max-w-xl`, `max-w-md`, the unpadded `max-w-sm`, and
`max-w-5xl` for the footer inside `StorefrontChrome` — and two vertical rhythms (`py-6` and `py-8`).

**Interpretation:** two findings of very different severity share one root. The padding one is a
live mobile defect on the highest-intent pages in the funnel, and it exists precisely because
nothing shared owns the gutter — every other page happens to supply its own, so each file reads
correctly in isolation and the defect lives in the absence of a common wrapper. The width one is
not a defect; it is an inconsistency a shopper experiences as the content column changing width
three times between a category grid, a product page and the cart.

**Confidence:** Known for the class strings, the layout chain and the 384px token value, all read
directly. The rendered consequence at 375px follows arithmetically but was not observed in a
browser — Needs validation, and it is one of the cheapest checks in this log.

**Why it matters commercially:** sign-in and registration are the pages where an abandoned session
costs a conversion, and a form flush against both screen edges reads as broken rather than as
minimal. Mobile is the dominant surface for grocery repeat ordering.

**Options considered:** add the missing padding to the six pages (small, self-contained, and the
only launch-severity part); additionally introduce a `Container`/`Page` primitive with a small set
of named widths and adopt it incrementally, which is design-system work and belongs with the rest
of it; put the padding on `StorefrontChrome`'s wrapper instead, which fixes all six at once but
double-pads the 18 pages that already supply their own.

**Cost of delay:** the padding half is live on production today.

**Next action:** PROPOSE — filed as **#652**.

---

### 2026-09-07 — the radius token scale is unused and self-aliasing, and the most-used radius has no token at all

**Trigger:** explicit `/discover`, auditing the brief's design-tokens area.
**Status of the area:** genuinely unowned.

**Observed (verifiable today):** `design-system/tokens/tokens.css` declares `--radius-sm: 0.5rem`,
`--radius-md: 1rem` and `--radius-full`, and `specs/design-system.md` tabulates them as
authoritative for "small controls, inputs", "cards" and "pills" — adding that where the doc and
`design-system/tokens/` disagree, the doc governs. Tailwind v4's `@theme` **merges** rather than
replaces, and its default scale (`node_modules/tailwindcss/theme.css:397-404`) sets `lg: 0.5rem`
and `2xl: 1rem`. Overriding only `sm` and `md` therefore makes `rounded-sm` byte-identical in
output to `rounded-lg`, and `rounded-md` byte-identical to `rounded-2xl`. Actual usage:
`rounded-2xl` **141**, `rounded-xl` **105**, `rounded-full` 90, `rounded-lg` 33, `rounded-md` 23,
`rounded-sm` 14, `rounded-3xl` 5, `rounded-r` and `rounded-l` 1 each. So the two names the token
layer defines are used 37 times; their unlabelled equivalents rendering identical pixels are used
174 times; and the single most-used radius in the codebase, `rounded-xl` at 0.75rem, corresponds to
no token and no documented role — including on the `inputClass` duplicated across 11 files, which
the doc's own table assigns to `--radius-sm`.

**Interpretation:** shape is the one token dimension with neither adoption nor enforcement. Colour
has two tests behind it; typography is explicitly and deliberately delegated to Tailwind's utility
scale by the same document; shape declares tokens and is then bypassed. Nothing looks wrong today
because the aliases resolve to the same pixels — which is exactly what makes it a latent problem
rather than a visible one: changing `--radius-md` would move 23 surfaces and leave 141 behind,
splitting one design decision in two with no error anywhere.

**Confidence:** Known. The Tailwind default scale and the override were read from the two files,
and the counts are grep output.

**Why it matters commercially:** nothing today. It matters to the brief, because "the design system
should own border radii" is stated as a goal and the honest answer is that it nominally does and
effectively does not — so a refactor would otherwise start by trusting a layer that has no users.

**Options considered:** delete the two overrides, adopt Tailwind's default scale as the shape
system, and correct `specs/design-system.md`'s table to name the classes the code actually uses —
which costs nothing at runtime and makes the doc true, and is arguably right given the doc already
concedes these values were "inferred from the brand kit's UI-elements panel, **not**
pixel-measured" and already defers spacing and breakpoints to Tailwind wholesale; keep semantic
shape tokens, add one for the 0.75rem case, sweep the 174 alias uses onto token names, and add a
source-level test so an unlabelled radius fails CI; do nothing and accept two vocabularies.

**Cost of delay:** none accruing. It gets slightly more expensive with every component added.

**Next action:** ADD TO ROADMAP/BACKLOG — filed as **#653**.

---

### 2026-09-07 — currency is hardcoded to a pound sign in six separate UI implementations, while Order.currency is a real column

**Trigger:** explicit `/discover`, testing the brief's "locale/currency where applicable" store-
configuration claim.
**Status of the area:** genuinely unowned. **#363** owns the identical shape of problem for
*timezone* and names it a non-UK onboarding blocker; nothing covers currency or locale.

**Observed (verifiable today):** `lib/repositories/orders.ts:126` writes `Order.currency` from
`const CURRENCY = "GBP"`, and `lib/stripe-webhook.ts:119` reconciles Stripe's lower-cased `gbp`
against it — so the data model already carries currency per order. The UI reads it nowhere, and
formats money in six independent hardcoded places: `components/product/format-price.ts:3`,
`components/product/filter-chips.ts:99` (a second, separate copy of the same function),
`components/cart/CartDrawerShell.tsx:123`, `components/staff/DiscountCodesPanel.tsx:33` and `:91`,
`app/(admin)/staff/inventory/InventoryTable.tsx:131`, and
`app/(admin)/staff/reports/page.tsx:18`. The last uses
`Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" })` while the other five hand-roll
a symbol prefix — two conventions coexisting, neither reading the column. Adjacent hardcoded
locale: `lib/local-datetime.ts:54` and `lib/order-status.ts:77`/`:238` pin
`Intl.DateTimeFormat("en-GB", ...)`, plus six `toLocaleString("en-GB")` sites in the staff panel.
Currency symbols are also baked into form labels in `ProductForm`, `StorefrontConfigForm` and
`LoyaltyConfigForm`.

**Interpretation:** money *storage* is already correct — integer pence with an explicit currency
column, exactly as `CLAUDE.md` requires — so this is purely presentational and therefore cheap
relative to its reach. ADR-004's own rule of thumb is that if changing a vendor's locality requires
editing anything outside the database and the UI/config layer, the abstraction has been violated;
currency is the same class of region value as timezone, and timezone is filed while currency is
not. Two honest caveats keep this out of P9: both seeded vendors are UK and Stripe charges in GBP,
so a constant and a per-vendor value produce identical output for every row today (the same
argument #363 makes about `STORE_TIMEZONE`); and real multi-currency is far more than formatting —
Stripe session currency, `Payment` reconciliation, loyalty redemption rates, and every `...Pence`
field's implied minor unit, which breaks outright for currencies with zero or three decimal places.

**Confidence:** Known for every file and line. That a non-UK vendor is a near-term prospect is
Needs validation — no such vendor exists today, and both seeded ones are UK.

**Why it matters commercially:** it is a hard stop on onboarding a vendor outside the UK, which is
the platform's stated direction, and the duplicated formatter means the fix touches six places
whenever it happens.

**Options considered:** consolidate to one money formatter taking amount, currency and locale, drop
the duplicate in `filter-chips.ts`, source currency and locale from vendor config alongside #363's
`Vendor.timezone`, and keep GBP/en-GB as the default so nothing changes for either seeded vendor —
sequenced **with** #363, since it is the same change against the same table; fix only the duplicate
formatter and leave the hardcoding (removes the drift risk, not the coupling); do nothing until a
non-UK vendor is real. Scope must stay at the presentation layer — this must not grow into a
multi-currency payments project.

**Cost of delay:** none until a non-UK vendor appears, at which point it is on the critical path
alongside #363.

**Next action:** ADD TO ROADMAP/BACKLOG — filed as **#654**.

---

### 2026-09-07 — #502's missing-image degradation reached the product card and stopped there

**Trigger:** explicit `/discover`, auditing the brief's commerce-component reuse area.
**Status of the area:** genuinely unowned. `#502` is closed and its fix is real; `#373` covers a
related but different bundle-degradation blind spot in the *staff* list; `#174` is orphaned objects
in the bucket.

**Observed (verifiable today):** `components/product/ProductImage.tsx` is the client boundary added
by `#502`, whose `onError` swaps a 404'd object for the same grey box a product with no image gets.
It is imported in **exactly one file** — `components/product/ProductCard.tsx:5`. Every other
storage-key-derived image renders through a bare `<img>` with no `onError`:
`components/product/ProductImageGallery.tsx:21` (the product detail page),
`components/cart/CartContents.tsx:86` (the cart drawer and `/cart`),
`components/bundle/BundleCard.tsx:70`, and `components/layout/DepartmentHero.tsx:170` and `:256`.
`ProductImageGallery` and `CartContents` each have a correct **empty-key** branch, which is a
different condition — "no row points at an object", not "a row points at an object that is not
there".

**Interpretation:** `CLAUDE.md` records the `#502` lesson as making "checking the CDN, not the
page, the way to catch the next one", because the storefront card no longer looks broken. That is
true of the card and not yet true of the product page, the cart or the bundle rail — so a
per-environment bucket gap is now simultaneously invisible to a seed-side check and visible to the
customer, on the surfaces where they are most committed. The presence of a correct-looking
empty-key branch in two of the four files is probably why the gap reads as covered on a skim.
`BundleCard` is the sharpest instance: its own comment says it deliberately mirrors `ProductCard`'s
treatment "rather than a visually distinct component bolted on beside it", and it mirrors
everything except this.

**Confidence:** Known for the code facts — the `<img>` sweep and the single `ProductImage` import
were both read directly. Whether any of these keys currently 404 in staging or production is **not
claimed**: `docs/developer-portal/runtime-pitfalls.md` prescribes `curl -I "${CDN_BASE_URL}/${key}"`
against the environment that serves them, and that check was not run in this pass.

**Why it matters commercially:** a broken-image icon on a product detail page reads as a broken
shop, and the `#502` incident showed this failing per-environment — complete in dev, entirely
missing in staging — which is exactly the case no local check can see.

**Options considered:** adopt the existing component in the four places, widening its
currently-hardcoded `width={400} height={300}` and `loading="lazy"` into props so the gallery
(800 by 800, first image eager and high priority) and the 64px cart thumbnail can use it — reuse
before create, which is this project's stated order; write a second fallback inline at each site
(duplicates the failure-handling logic four ways); do nothing and rely on CDN checks alone.

**Cost of delay:** none accruing, unless a live CDN check finds current 404s on any of these
surfaces — in which case it stops being backlog and becomes a launch defect.

**Next action:** ADD TO ROADMAP/BACKLOG — filed as **#655**.

---

### 2026-09-07 — there is no UI primitive layer, and the field, button and card styles are copy-pasted across 11 to 30 files each

**Trigger:** explicit `/discover` — this is the architectural core of the brief.
**Status of the area:** genuinely unowned as work; **deliberately deferred** as a decision, and the
reasoning behind the deferral has now expired.

**Observed (verifiable today):** `components/ui/` and `components/forms/` exist and contain only
`.gitkeep`. There is no Button, Input, Select, Checkbox, FormField, Badge, Modal, Alert, Toast or
Skeleton component in the repo; all **102** `<button>`, **147** `<input>`, **13** `<select>` and
**123** `<label>` elements are styled inline or from a per-file constant. Verbatim duplicate
constants: `inputClass` in **11 files**, `labelClass` in **15**, `errorInputClass` in **8**,
`buttonClass` in 2; the card surface `rounded-2xl border border-black/10 bg-white p-5` appears
**30** times, plus 17 with a hover border and 11 further near-variants. The primary action button
has no canonical form: counting distinct class strings containing `bg-action`, the same control
appears with four different radii, five different padding pairs, three disabled treatments
(`opacity-50`, `opacity-60`, absent) and three hover treatments (`bg-action-hover`, `opacity-90`,
absent). `specs/design-system.md` records the deferral and its reason: "Nothing consumes tokens yet
— first real usage is P1+ feature UI. Building these now would be speculative."

**Interpretation:** the deferral was correct when written, before P1. It is now after P9.2 and the
patterns have visibly stabilised — the copy-paste *is* the evidence, and so is the fact that two
accessibility defects (#649, #650) were each propagated to 11 and 15 sites by a single string.
That is the strongest argument for the abstraction and simultaneously the reason not to do it
first: the defects must be fixed at the call sites now, and the consolidation can follow. The gap
is also narrower than "there is no design system" — colour and motion **are** systematised and
enforced; spacing, shape, control geometry and interaction states are not.

**Confidence:** Known. Every count is grep output over `app/`, `components/` and `features/` `.tsx`
excluding the generated runbook bundle.

**Why it matters commercially:** indirectly. It is not a customer-visible defect; it is the reason
customer-visible defects arrive eleven at a time.

**Options considered — and this is where the brief should be challenged.** `specs/roadmap.md` P9.3
says "test the actual candidate rather than continuing to add architecture" and P9.4 says "there
should be virtually no normal feature development here". A platform-wide component migration during
launch certification would invalidate the UAT (#441), the accessibility validation (#442), the LCP
re-measurement (#439) and the exact-candidate verification (#444) each time a batch landed. So: fix
#649, #650 and #652 now as targeted defect fixes at the existing call sites, and take the
consolidation in P10, incrementally, one route group at a time, paired with #653 so control
geometry and radius are decided once. Explicit non-goals for whenever it happens — no
vertical-specific card components (see the already-tracked item below); no `transition-all` and no
global element-selector transitions, both of which caused real defects here (#324, #326); nothing
that needs client JavaScript to render a form field, since progressive enhancement is load-bearing
in this codebase rather than aspirational; and no `Toast` or `Skeleton` built merely because the
brief's list has a gap — nothing dispatches a toast today and there are zero `loading.tsx` files,
so the original "building these now would be speculative" reasoning still holds for those two
specifically.

**Cost of delay:** each new page adds a copy. Against that, doing it during P9 costs launch
confidence, which is more expensive.

**Next action:** ADD TO ROADMAP/BACKLOG — filed as **#656**.

---

### 2026-09-07 — the multi-industry premise fails at the data model, not the design system

**Trigger:** explicit `/discover` — the brief's central architectural claim.
**Status of the area:** **already tracked as #398** (P10, "Scaled weights and calibrated sortable
unit pricing"), whose item 2 is "A decision on **variants** ... the single biggest decision in this
issue. It needs `/propose` before any `/spec`." The attribute-list duplication is **#601**.
Recorded here as a finding whose verdict is not to pursue it as design-system work; evidence was
added to #398 as a comment rather than filed again.

**Observed (verifiable today):** `prisma/schema.prisma` gives `Product` one `basePrice`;
`Inventory.productId` is `@unique`, so one stock row per product; `CartItem` is
`@@unique([cartId, productId])` and `OrderItem` references `productId` — **no variant dimension
anywhere**. Product attributes are boolean columns (`isHalal`, `isFresh`, `isOrganic`,
`isVegetarian`, `isGlutenFree`, `isHmcCertified`) hardcoded in six places that must be edited
together: the columns, `AvailableFacets` (`lib/repositories/products.ts:252`), `FilterChipParams`
and `REMOVABLE` (`components/product/filter-chips.ts`), `SearchHrefParams` and `CARRIED`
(`components/product/search-href.ts`), `buildHref` in
`app/(storefront)/categories/[slug]/page.tsx`, and the badges in
`components/product/ProductCard.tsx`. `components/product/category-icon.ts` maps nine grocery
category slugs to icons with a shopping-basket default — one of the hardcoded surfaces ADR-004's
sequencing item 4 listed for collapse, still hardcoded, though its fallback means a new category
renders an icon without a schema change.

**Interpretation:** testing the brief's own multi-industry examples against this schema is
decisive. Fashion needs size and colour with per-variant stock and price; electronics needs storage
and memory tiers the same way. Both are the *same* `ProductVariant` shape as #398's 1kg / 5kg /
10kg rice — they are not additional models, and none of them is reachable through theme or store
configuration. Modelling "Blue T-shirt, Medium" as its own `Product` row is technically possible
today and produces a search result grid with one card per size, no swatch, and reviews split across
variants. So the layering the brief proposes is sound in principle and **mis-sequenced**: the
design-system tier cannot deliver multi-industry reuse, because the constraint is two tiers down.
The grocery-specific *attribute* coupling is a smaller and more defensible matter — `#569`'s own
schema comment gives a reasoned case for boolean columns over a generic attribute table ("an
attribute table would make every facet an EXISTS join, harder to index, and would fork the codebase
... for no gain a shopper sees"), and that reasoning stands. The honest statement is not that the
booleans are wrong, but that a non-grocery vendor cannot express one of its own attributes without
a migration plus six code edits.

**Confidence:** Known for every schema and code fact. That a non-grocery vendor is actually wanted
is Needs validation — no such vendor exists, ADR-004 and ADR-006 both reason exclusively about
grocery vendors, and the brief is the only evidence of the intent.

**Why it matters commercially:** it changes what a design-system investment can be expected to buy.
Sold as "the platform becomes reusable across verticals", it would not deliver that and the gap
would surface at the first non-grocery onboarding. Sold as "the storefront becomes internally
consistent, accessible and cheaper to change", it delivers exactly that and is worth doing on its
own merits.

**Options considered:** pursue multi-industry reuse as a design-system refactor — rejected, since
it cannot deliver the stated outcome; make it a schema project now — rejected, because #398 already
owns the decision, it is correctly sequenced in P10, and reopening a variant model during launch
certification contradicts P9.4 outright; add the multi-industry evidence to #398 so whoever takes
it to `/propose` evaluates the variant model against at least one non-grocery shape (size by
colour) alongside the multi-weight one, so the chosen model is not accidentally weight-specific —
**done**; do nothing.

**Cost of delay:** none. #398 is already gated behind launch, and nothing about this becomes more
expensive by waiting.

**Next action:** DO NOT PURSUE — as a design-system refactor. The underlying decision stays with
**#398**, which now carries this evidence.

---

## 2026-09-06 — fourth Discover pass (Admin/Staff portal usability brief)

An explicit `/discover` over the admin panel, prompted by a six-part usability brief (staff menu
allocation, category expand/collapse, catalogue category selection, brand sample data, per-menu-item
operator documentation, and status-report drill-down). Six genuinely unowned findings, and — more
usefully — **two of the six requested changes rest on premises the code does not support**, which is
exactly what this pass exists to catch before `/propose` commits to them.

**Two of the brief's items are already implemented and are recorded here as such rather than as
findings.** *Brand sample data* (item 4) exists end to end: `prisma/schema.prisma:180` carries a
full `Brand` model, `prisma/seed.ts:758` seeds three real grocery brands (Shan, East End, TRS) via
`CATALOGUE_BRANDS`, `/staff/brands` and `components/staff/BrandManager.tsx` manage them, and
`components/staff/ProductForm.tsx:214` already offers a brand picker. No schema change is required
and none should be proposed; the only open question is *volume* (three brands, carried by three
seeded products), which is a fixture edit, not a slice. *Reduced-motion support* (a stated UX
constraint) also exists — `app/globals.css:99` and `:138` already carry `prefers-reduced-motion`
blocks — and a keyboard-accessible disclosure pattern to copy exists at
`components/product/FilterPanel.tsx:38` (a native `details`/`summary`). Item 2 should reuse both
rather than invent a parallel one.

### 2026-09-06 — the runbook renders 1 of its 152 articles, and its "Admin" tab can never match anything

**Trigger:** explicit `/discover` over the admin panel, grounding item 5 (per-menu-item operator
documentation) in the surface that would deliver it.
**Status of the area:** genuinely unowned. No issue covers the runbook's filtering; `#602` is about
a *different* page being unlinked, not about this one rendering nothing.

**Observed (verifiable today):** `/staff/runbook` filters its articles **twice**, against two
different audience vocabularies. `app/(admin)/staff/runbook/page.tsx:19-21` keeps articles whose
`audience` includes `"staff"` or `"store-admin"`. `components/staff/RunbookClient.tsx:18-19` then
filters the already-filtered list again, keeping `"staff"` or **`"admin"`** — a different string.
Counted directly out of the generated `app/(admin)/staff/runbook/docs.ts`: **152 articles**, whose
audiences are `dev` (144), `admin` (8), `product` (4), `architect` (2), and one each of `design`,
`marketing`, `operations`, `platform-admin`, `shopper`, `staff` and `store-admin`. The server filter
therefore passes exactly **two** articles (`docs/staff-playbook/staff-tabs-guide.md`, audience
`staff`; and `docs/store-admin-guide/admin-tabs-guide.md`, audience `store-admin`). The client filter
then drops the second, because `["store-admin"].includes("admin")` is `false`. **Net result: one
article renders.** The same mismatch makes the UI's own `"admin"` filter tab
(`RunbookClient.tsx:22`) permanently empty — the 8 genuine `admin`-audience articles were already
removed by the server filter one layer up, so selecting that tab always renders "No documents found
for this filter."

**Interpretation:** the Store Admin Management Guide has been written, approved, front-mattered and
compiled into the runbook bundle, and no store admin can read it in the product. This is not a
content gap; it is a two-line vocabulary mismatch between a server filter and a client filter that
nobody could see from either file alone — the same shape as `#612`'s two-navigation-surface defect,
where each file was individually correct and the defect lived only in the relationship between them.
It also directly blocks the brief's item 5: writing per-menu-item documentation into
`docs/store-admin-guide/` today produces content that the delivery surface silently discards.

**Confidence:** Known. The article counts and both filter expressions were read out of the files;
`Array.includes` is exact-element matching, not substring.

**Why it matters commercially:** operator documentation is how a non-technical shop manager avoids
mis-pricing a product or hiding a department by accident. A guide that exists but does not render is
indistinguishable from one never written, and it has been silently absent since the guide was
authored (front-matter `updated: "2026-08-22"`).

**Options considered:** align the client filter's vocabulary with the server's and let both accept
`store-admin` (smallest possible change, two lines, and it makes the existing guide visible
immediately); additionally decide whether the `admin` tab should surface the 8 `admin`-audience
articles by widening the server filter, which is a deliberate scope question rather than a bug fix
because several of those are developer-facing; introduce a single shared audience constant so the
two layers cannot diverge again; do nothing, and accept that the admin guide is write-only.

**Cost of delay:** every documentation slice written before this is fixed compounds the waste —
item 5's whole deliverable would land in a directory whose contents do not reach the reader.

**Next action:** PROPOSE — filed as **#625**.

**Update 2026-09-06 (post-`#633`):** RESOLVED. Fixed by `#633` (`specs/2026-09-06-operator-documentation/`, PR #635), promoted to production in PR #637; the issue is closed. Recorded here so this finding is not read as open work.

---

### 2026-09-06 — a STAFF user loses the Payment Issues link the moment they leave the hub

**Trigger:** explicit `/discover`, grounding item 1 (Admin/Staff menu allocation) in the real RBAC
map rather than in the nav components.
**Status of the area:** genuinely unowned. `#612` fixed navigation parity at the whole-file level
and added `tests/staff-nav-parity.test.ts`; that test is **tier-blind by construction** and cannot
see this.

**Observed (verifiable today):** the real RBAC map, read from every page's own gate, is that exactly
four staff pages admit a STAFF member — `inventory`, `orders`, `payments` and `runbook` all call
`requireVendorRole("STAFF", "ADMIN")`; the other fourteen call `requireVendorRole("ADMIN")`.
`app/(admin)/staff/page.tsx` renders the Payment Issues card **outside** its `isAdmin` block, so a
STAFF member correctly sees it on the hub and can open it. `components/staff/PanelNav.tsx`'s
`currentTier === "staff"` branch lists only Overview, Inventory, Orders and Runbook — **no
Payments**. So the link is present on the hub, absent from the persistent nav, and disappears the
instant a STAFF user navigates to any other page. `tests/staff-nav-parity.test.ts` passes throughout,
because it collects every href in each file and compares the two sets; its own docstring states the
assumption that makes it blind here — "PanelNav's staff-tier branch is a strict subset of its
admin-tier branch ... so collecting every href in the file yields the admin-tier set exactly." That
is true, and it is precisely why the staff-tier set is never compared against anything.

**Interpretation:** the parity guarantee `#612` established is a guarantee about the *admin* view
only. The staff view has no equivalent check, and it has already drifted once — silently, in the
direction that matters most operationally, since `/staff/payments` is where a shop worker finds an
order whose payment left it stranded. The brief's item 1 asks which admin items should move to the
staff view; the honest first answer is that one already-permitted item is missing from it.

**Confidence:** Known. Page gates, both nav surfaces and the test were each read directly.

**Why it matters commercially:** a stranded `PENDING_PAYMENT` order holds its stock, its discount
code use and its loyalty redemption (see `#618`). The person most likely to notice a customer
chasing an order that never confirmed is shop-floor staff, and the panel hides their route to it
everywhere except the front door.

**Options considered:** add the Payments link to the staff branch and extend the parity test to
compare the **staff-tier** sets of both surfaces against the set of pages that actually admit STAFF —
deriving the expected set from the pages' own `requireVendorRole` calls, which turns the test from a
two-file comparison into a check against the real authorization model, and makes any future item-1
reallocation self-verifying; add the link alone and leave the test as-is (cheapest, and the drift
recurs); do nothing.

**Cost of delay:** low technically, but it is a live operational blind spot today, and item 1 will
add more staff-visible items on top of an unchecked surface.

**Next action:** PROPOSE — filed as **#626**.

**Update 2026-09-06 (post-`#633`):** RESOLVED. Fixed by `#633` (`specs/2026-09-06-operator-documentation/`, PR #635), promoted to production in PR #637; the issue is closed. Recorded here so this finding is not read as open work.

---

### 2026-09-06 — the category list interleaves subcategories with unrelated parents

**Trigger:** explicit `/discover`, grounding item 2 (category expand/collapse) in the data the list
is actually built from.
**Status of the area:** genuinely unowned.

**Observed (verifiable today):** `lib/repositories/categories.ts:163`'s `listCategoriesForAdmin`
orders by `sortOrder` then `name` — a single **global** ordering with no grouping by `parentId`.
Every top-level category is created by `prisma/seed.ts:875` as
`tx.category.create({ data: { ...category, vendorId } })` from a fixture typed at
`prisma/seed.ts:356` as `category: { slug: string; name: string }` — **no `sortOrder`**, so all 13
top-level categories take the schema default of `0`. Subcategories are created at
`prisma/seed.ts:960-967` with `sortOrder: index`, i.e. `0`, `1`, `2` within each parent. The
`sortOrder: 0` bucket therefore contains all 13 departments plus the 9 first-children, ordered by
name alone. `app/(admin)/staff/categories/page.tsx:56-58` then indents any row carrying a `parentId`
by `ml-6`, under whatever row happens to precede it. Working the fixture through by hand, the list
opens: Baby and Kids, Bakery, Beverages, **Bread and Loaves** (indented, "in Bakery"), **Cleaning**
(indented, "in Household"), **Crisps and Namkeen** (indented, "in Snacks"), Dairy and Eggs,
**Fresh Fruit** (indented, "in Fruit and Veg") — so an indented Household subcategory renders
directly beneath Beverages. The page's own docstring concedes the mechanism without drawing the
conclusion: "Sub-categories are indented under the ordering the repository already returns rather
than re-sorted here."

**Interpretation:** the visual hierarchy on `/staff/categories` is decorative — the indent implies a
parent-child relationship to whichever row precedes it, and that row is usually a different
department. The `in <parent-name>` caption is currently the only thing preventing an outright
misreading. This matters for the brief's item 2 well beyond cosmetics: **expand/collapse cannot be
built on this ordering at all**, because there is no contiguous run of children to reveal or hide
under a parent. Item 2 is therefore not a UI slice; it is a repository-ordering fix with a UI on
top, and proposing it as the latter alone would produce a component that cannot be made correct.

**Confidence:** Known for the ordering, the missing fixture `sortOrder` and the rendering. The
worked example above is derived from the fixture rather than read off a running page, so the exact
sequence is Inferred — the interleaving itself is not.

**Why it matters commercially:** categories are how a shop's departments are structured, and a
manager reorganising them is reading this list to decide what sits where. A list that indents
"Cleaning" under "Beverages" invites a genuinely wrong edit, and mis-filed departments are the
single most visible catalogue error a shopper encounters.

**Options considered:** return the rows already grouped — order by parent, then children within
parent (either as a nested shape or a stable flattened one), which fixes the list and makes
expand/collapse possible in the same change; sort in the page instead (leaves every other consumer
of `listCategoriesForAdmin` — notably `ProductForm`'s picker — still interleaved); backfill
`sortOrder` on top-level categories in the seed and a migration (helps ordering *within* a tier but
does **not** group parents with their children, so it does not fix this); do nothing and drop item 2.

**Cost of delay:** it is a prerequisite, so any delay simply relocates the same work into item 2's
own slice, where it will be discovered mid-Build rather than at Spec.

**Next action:** PROPOSE — filed as **#627**.

**Update 2026-09-06 (post-`#633`):** RESOLVED. Fixed by the combined admin-panel slice (`specs/2026-09-06-admin-panel-operability/`). Recorded here so this finding is not read as open work.

---

### 2026-09-06 — the report tiles and the order list count different things, so a naive drill-down would disagree with itself

**Trigger:** explicit `/discover`, grounding item 6 (status-report drill-down) in the numbers the
report actually produces.
**Status of the area:** genuinely unowned. `#607` covers the absence of analytics instrumentation;
this is about the reports that **do** exist being un-drillable without contradicting themselves.

**Observed (verifiable today):** `app/(admin)/staff/reports/page.tsx` renders stat tiles only — no
link, no filter, no per-status breakdown anywhere on the page. Its Total Orders and Total Revenue
tiles come from `lib/repositories/orders.ts:1130`'s `getFinancialsForStaff`, which aggregates
`where: { vendorId, status: { in: [...REVENUE_STATUSES] } }`, and `lib/order-status.ts:186` defines
`REVENUE_STATUSES` as `CONFIRMED`, `OUT_FOR_DELIVERY`, `DELIVERED` — deliberately excluding
`PENDING_PAYMENT` and `CANCELLED`, because counting them overstated revenue by 39% on staging
(`#238`). A drill-down target already exists: `/staff/orders` accepts `?status=` and `?q=`, parsed by
`lib/staff-orders-query.ts`. But that parser resolves a status to exactly one of three things — the
default queue (`STAFF_QUEUE_STATUSES`, i.e. `CONFIRMED` and `OUT_FOR_DELIVERY`), the sentinel `all`
(every status), or **one** single `OrderStatus`. There is no way to express the three-status
`REVENUE_STATUSES` set in a URL.

**Interpretation:** the brief's own acceptance condition — that aggregated numbers and their detail
views represent the same filtered dataset — is the thing that would break first here, and silently.
Linking "Total Orders" to `/staff/orders?status=all` shows a **larger** count than the tile (it adds
abandoned and cancelled orders); linking it to the bare `/staff/orders` shows a **smaller** one (the
queue omits `DELIVERED`). Neither is wrong as a list; both contradict the tile they were reached
from, and a store admin reconciling the two has no way to tell which number to trust. Additionally,
the brief's worked example ("Total Orders, then Orders by status, then click Out for Delivery")
assumes a by-status breakdown that does not exist on the page at all — the intermediate tier has to
be built, not merely linked. Note also that Reports is `requireVendorRole("ADMIN")` while
`/staff/orders` is `STAFF, ADMIN`, so the drill-down direction is safe, but the reverse (surfacing
report links from the order list) would not be.

**Confidence:** Known — every status set, the aggregate's `where` clause and the query parser's three
branches were read directly.

**Why it matters commercially:** the reports page is the only financial surface a store owner has,
and its credibility was itself repaired once already (`#238`). A drill-down whose detail view does
not add up to its own headline would re-open exactly the trust problem that fix closed.

**Options considered:** make the tile's filter expressible — extend `parseStaffOrdersQuery` with a
named multi-status selection (e.g. a `revenue` sentinel alongside `all`) so the tile links to
precisely its own dataset and the list can state the filter it is showing; build the by-status
breakdown as a real intermediate tier grouped from one `groupBy` over the same `where` clause, with
each row linking to its single status (which `?status=` already expresses correctly today, so only
the *totals* row is the hard case); scope the first slice to per-status drill-down only and leave the
aggregate tiles un-linked, which is honest and much cheaper; do nothing.

**Cost of delay:** none accruing — but proposing item 6 without resolving this would specify a
feature whose stated acceptance criterion is unmeetable.

**Next action:** PROPOSE — filed as **#628**.

**Update 2026-09-06 (post-`#633`):** RESOLVED. Fixed by the combined admin-panel slice (`specs/2026-09-06-admin-panel-operability/`). Recorded here so this finding is not read as open work.

---

### 2026-09-06 — the store admin guide documents two capabilities that do not exist

**Trigger:** explicit `/discover`, reading the existing operator documentation before proposing more
of it.
**Status of the area:** genuinely unowned as a documentation defect. The *refund* capability gap
itself is tracked as `#606`; that the shipped guide tells operators the feature is already there is
not.

**Observed (verifiable today):** `docs/store-admin-guide/admin-tabs-guide.md` (status `approved`,
version `1.2.0`, `updated: "2026-08-22"`) states under Orders and Fulfillment that an admin can
"issue full refunds via the payment provider (Stripe)", and under Team Management that they can
"Invite new staff members". Neither exists. A case-insensitive search for `refund` across `app/`,
`lib/`, `features/` and `components/` returns only `lib/loyalty.ts`, `lib/repositories/loyalty.ts`,
`lib/order-status.ts` (points reversal, not payment refunds), the storefront terms page and the
generated runbook bundle — `lib/repositories/orders.ts` contains no refund path at all. A search for
`invite` across `app/(admin)/staff/team/`, `components/staff/team/` and `lib/repositories/roles.ts`
returns nothing; `lib/repositories/roles.ts` exports exactly `listVendorTeam` and `applyVendorRole`,
so the page assigns roles to users who already exist. Separately,
`docs/staff-playbook/staff-tabs-guide.md` opens by telling staff their panel "contains three main
tabs" and documents Fulfillment, Inventory and Overview; the staff nav actually carries four (Runbook
is the fourth) and the hub additionally offers Payment Issues.

**Interpretation:** the two approved operator guides describe a portal that differs from the one that
shipped — two capabilities that were never built, and a tab count that has been wrong since at least
the runbook was added. Combined with the runbook-filter finding above (only one of the two guides
renders at all), the practical state is that operator documentation is both partly wrong and largely
unreachable. This reframes the brief's item 5: it is not "write new documentation", it is "make the
existing surface work, correct what is already approved, then extend it to the menu items with no
coverage at all" — and the uncovered set is large, since neither guide mentions Payment Issues,
Brands, Bundles, Reports, Customers, Delivery Areas, Search Synonyms or Error Events.

**Confidence:** Known.

**Why it matters commercially:** an operator who reads that they can refund a customer through the
panel will promise a refund to that customer on the phone, and then be unable to issue it. That is a
worse outcome than absent documentation, because it converts a missing feature into a broken promise
to a shopper.

**Options considered:** correct the two guides to describe only what exists and note the refund path
as out-of-product for now (cheapest, and it removes the customer-facing risk immediately); do that
and add the missing per-menu-item coverage in the same slice; hold all documentation work until
`#606` decides whether refunds get built, which leaves an actively misleading approved document live
in the meantime; do nothing.

**Cost of delay:** the misleading refund line is live to every store admin who can reach the guide —
which, per the finding above, is currently nobody, so the *exposure* begins the moment the runbook
filter is fixed. Sequence the correction before or with that fix, not after.

**Next action:** PROPOSE — filed as **#629**.

**Update 2026-09-06 (post-`#633`):** RESOLVED. Fixed by `#633` (`specs/2026-09-06-operator-documentation/`, PR #635), promoted to production in PR #637; the issue is closed. Recorded here so this finding is not read as open work.

---

### 2026-09-06 — Aheed's brand colours are hardcoded into shared staff pages, so SriMart renders the wrong palette

**Trigger:** explicit `/discover`, checking the brief's "no raw hex" constraint against the panel it
applies to.
**Status of the area:** genuinely unowned in these files. `#512` tracks one instance of the same
class (`ProductFilterForm`'s Apply button) and is storefront-side; these are different files and
carry the additional multi-tenant consequence below.

**Observed (verifiable today):** `app/(admin)/staff/inventory/InventoryTable.tsx:131` renders the
price as `text-[#2e7d32]` and `:159` renders a control as
`bg-[#e8f5e9] text-[#2e7d32] hover:bg-[#c8e6c9]`; `app/(admin)/staff/errors/page.tsx:49` uses
`bg-[#f5f5f0]`. Those values are Aheed's own brand primitives — `prisma/seed.ts:283-289` seeds
Aheed's `VendorBranding` with `brandGreen: "#4caf50"`, `brandCream: "#f5f5f0"` and the green tint
`#e8f5e9`. SriMart's seeded primitives are deliberately different values (blue, purple, red, per
`CLAUDE.md`'s design-tokens section). `components/staff/ProductForm.tsx:26` states the rule this
breaks, in the panel's own code: "Colours are semantic tokens per design-system.md, never raw hex."

**Interpretation:** `/staff/inventory` is one of the four pages a STAFF member can open, and it is
vendor-scoped chrome — a SriMart staff member sees Aheed's green on their own store's inventory
screen. This is not a tidiness issue but the exact failure `CLAUDE.md`'s design-token section warns
about, firing where nothing checks: no test asserts a second vendor's rendered admin output, and the
affected literals are Tailwind arbitrary values, so neither `lint` nor `format:check` sees them. It
is a small finding, recorded mainly because items 2 and 3 will both edit staff-panel components under
a stated "no raw hex" constraint — the constraint is already violated in the files next door.

**Confidence:** Known for the literals and the seeded primitives. That the mismatch is visually
material on SriMart's panel is Needs validation — it requires fetching a staff page under SriMart's
host, which `CLAUDE.md` already prescribes for branding changes.

**Why it matters commercially:** the platform's multi-tenant promise is that a vendor's staff see
their own store. Colour bleed from another tenant is a small but direct contradiction of that, and it
is cheapest to fix while these components are already open.

**Options considered:** replace the three literals with the existing semantic tokens as incidental
cleanup inside whichever item-2 or item-3 slice touches the panel (smallest, no separate slice); do
it as its own tiny slice alongside `#512` so both instances of the class close together; leave it and
accept the drift.

**Cost of delay:** negligible in isolation; it only compounds if items 2 and 3 copy the surrounding
style.

**Next action:** ADD TO ROADMAP/BACKLOG — filed as **#631**.

**Update 2026-09-06 (post-`#633`):** RESOLVED. Fixed by the combined admin-panel slice (`specs/2026-09-06-admin-panel-operability/`). Recorded here so this finding is not read as open work.

---

### 2026-09-06 — the product form's single flat category select cannot express what the data model allows

**Trigger:** explicit `/discover`, grounding item 3 (catalogue category selection).
**Status of the area:** genuinely unowned.

**Observed (verifiable today):** `components/staff/ProductForm.tsx:128-146` renders **one** `select`
named `categoryId`, populated from the flat `AdminCategoryRow[]` and labelled with the parent name,
an arrow and the child name for children, or the bare name for parents — every tier in one list, in
the interleaved order the category finding above describes. Both tiers are genuinely assignable and
both are genuinely used: `prisma/seed.ts:886` assigns every hand-curated product to a **top-level**
category (`categoryId: createdCategory.id`, created in the parent loop), while
`seedGeneratedCatalogue` (`prisma/seed.ts:1101-1102`) assigns its generated products to
**subcategories** resolved by child slug. `prisma/schema.prisma:318-335` places no constraint on
which tier a `Product.categoryId` may point at.

**Interpretation:** the brief's preferred cascade — pick a Category, then pick from its
Subcategories — is the right direction, but a naive implementation would remove a capability that is
in active use, because "assign this product to the department itself" is currently a valid and common
choice. A correct cascade needs the parent to remain selectable in its own right (an explicit "in
this department directly" option rather than an empty second field), and needs a defined answer for
the four departments that have no children at all (Frozen Foods, Health and Beauty, Baby and Kids,
Pet Supplies in the Aheed fixture). The brief anticipates the second case; it does not anticipate the
first, and the first is the one that would silently break existing editing behaviour.

**Confidence:** Known — the form, both seed assignment paths and the schema were read directly.

**Why it matters commercially:** mis-classified products are invisible to the shoppers browsing the
department they should be in, and this form is the only place a non-technical manager classifies a
product. The brief's stated goal (reduce incorrect classification) is well aimed; the risk is that a
cascade built without the direct-to-department case makes classification *worse* for the products
that legitimately use it.

**Options considered:** two dependent fields where selecting a category populates the second and the
second always offers an explicit "directly in this department" choice, with the field hidden (not
merely empty) for childless departments; keep one field but group it with `optgroup` per department,
which is a far smaller change, needs no client state, and removes the ambiguity without removing any
capability; do nothing. Both of the first two depend on the grouped ordering from the category
finding above.

**Cost of delay:** none accruing.

**Next action:** PROPOSE — filed as **#630**.

**Update 2026-09-06 (post-`#633`):** RESOLVED. Fixed by the combined admin-panel slice (`specs/2026-09-06-admin-panel-operability/`). Recorded here so this finding is not read as open work.

---

## 2026-09-05 — third Discover pass (P2.6 milestone close)

Run automatically at milestone close, per `specs/sdd-workflow.md`, immediately after `#569`
(P2.6's sixth and final slice) shipped and promoted. One genuinely new finding, plus a
process correction: two 2026-09-02 findings below had carried `PROPOSE` for three days with no
issue filed — an instruction-8 gap in the pass that wrote them, now fixed (filed as **#606** and
**#607**, addenda added in place below rather than duplicating the research). Everything else this
pass surfaced was already owned: the missing brand mega-menu/thumbnails are `#394`; pack size is
`#398`; the three filter-key-list/staff-hub-link gaps found during `#569`'s own Build are `#601`/
`#602`; the AI synonym proposal response-shape risk is `#583`.

### 2026-09-05 — six of `#569`'s seven new facet fields never reach a product card or detail page

**Trigger:** milestone-close Discover, grounding in the code that just shipped (`#569`).
**Status of the area:** genuinely unowned — not required by `#569`'s own requirements (`R20`–`R23`
scoped the filter *controls*, not what a matched product then displays) and not covered by any
other filed issue.

**Observed (verifiable today):** `lib/repositories/products.ts:420`'s `productSummarySelect` — the
one shape every storefront card, list and detail page is built from (`ProductDetail extends
ProductSummary`, line 92) — selects `isHalal`, `isFresh`, `isOrganic`, `origin` and
`originalPrice`, and nothing else from `#569`. It was not touched by `#569`. `ProductCard.tsx`
renders a badge for `isHalal` (line 65) and `isFresh` (line 71) and shows `origin` as plain text
(line 119) — all three pre-existing. There is no badge, label or any rendering anywhere in
`app/(storefront)/` or `components/product/` for `isVegetarian`, `isGlutenFree`, `isHmcCertified`,
`brandId`/`Brand.name`, `hmcReference` or `hmcVerifiedAt`. A shopper can filter `/search` to
"Vegetarian" or "Brand: Shan" or "HMC certified" and get a correctly narrowed result set (confirmed
live at this slice's own `/validate`), but nothing on the resulting product cards or detail pages
confirms *why* a product matched, or shows the brand name, or shows the HMC certificate reference
and verified date the admin form requires before the flag can even be ticked.

**Interpretation:** the filter half of this facet feature is complete; the display half — showing a
shopper the fact that made a product match, which is also how a shopper who is just browsing
(not filtering) discovers these attributes at all — was not built. For three of the six facets
(vegetarian, gluten-free, brand) this is a lost merchandising signal: no badge, no
brand-recognition cue anywhere a shopper is actually looking at a product. For HMC certification
specifically it is sharper than a missing badge: `#569`'s own stated reason for requiring
`hmcReference`/`hmcVerifiedAt` before the flag can be ticked is `#239` — a real incident of this
codebase asserting HMC certification with no basis for it. Storing that provenance but never
showing it to the shopper relying on the claim leaves the shopper in exactly the position `#239`
was about: taking a certification claim on faith, with the safeguard existing only in the database
and the admin form, never reaching the person who needs to trust it.

**Confidence:** the code facts (the shared select, the badge code, the absence everywhere else) are
Known — grepped directly, not inferred. That this is a genuine shopper-trust gap for HMC
specifically, rather than a cosmetic one for the other five fields, is Inferred from `#569`'s own
stated rationale for the provenance requirement.

**Why it matters commercially:** brand and dietary badges are a scan-speed and trust signal in
grocery browsing — a shopper does not read filter chips while scrolling a result grid, they read
badges on the card. For HMC, the gap is closer to a compliance/reputational one: the codebase now
argues internally (in the schema, in the admin form's validation, in this slice's own commit
history) that an HMC claim needs evidence, while showing the shopper no more evidence than existed
before this slice shipped.

**Options considered:** extend `productSummarySelect` and `ProductCard.tsx`/the detail page with
badges for the three new booleans plus a brand name/link, matching the existing `isHalal`/`isFresh`
pattern exactly (smallest change, reuses an established pattern); do the same but additionally
surface `hmcReference`/`hmcVerifiedAt` only on the product detail page (not the card, where space is
tight) as a small "Certified — ref. X, verified DD/MM/YYYY" line, which is the part that actually
closes the `#239` gap rather than just adding cosmetic parity; leave it as-is, accepting that this
slice's facets are filter-only until a future slice's own display work happens to cover them.

**Cost of delay:** low technically (the shape and the badge pattern both already exist to copy), but
every day live is a day the HMC provenance the schema now enforces is invisible to the shopper it
exists to protect.

**Next action:** PROPOSE — filed as **#608**.

---

## 2026-09-03 — second Discover pass (P2.6 search & AI shopping, at /propose)

Five findings from a pass over the search path, the shop-list matcher, the data-rights machinery and
the six slice issues filed for P2.6 the same day (**#564** to **#569**). Everything else the pass
surfaced was **already owned**: fuzzy ranking is `#286`, synonyms `#396`, facets `#397`, pack size
`#398`, saved lists `#116`, stock badges `#400`, the mega-menu `#394`, and the filter-form token
`#512`. The landing page having a postcode checker where every other route has a search box is
**already implemented deliberately** (P8.5f, `components/layout/Header.tsx`) and is not a gap.

Two of these are filed as issues; three are constraints on slices already filed and are recorded
here plus as comments on those issues, because a near-duplicate issue for a rule that belongs in an
unwritten spec is noise rather than tracking.

### 2026-09-03 — a search query log is personal data and nothing connects it to data rights

**Trigger:** explicit /discover on P2.6.
**Status of the area:** genuinely unowned — `#565` proposes the log and does not mention data rights.

**Observed (verifiable today):** `lib/repositories/data-rights.ts` exports exactly ten model sets
(`user`, `account`, `session`, `address`, `order`, `review`, `cart`, `loyaltyAccount`,
`loyaltyLedgerEntry`, `discountRedemption`) and its erasure path deletes reviews, carts and loyalty
accounts, tombstones orders and deletes the user. That function's own comment warns that "a partial
erasure leaves a user half-deleted with no way to tell where it stopped". `#565` proposes a
vendor-scoped search query log recording queries and zero-result queries; its body says nothing
about export or erasure. `ErrorEvent` (`prisma/schema.prisma:962`) is absent from both paths too,
but carries no user link, so it raises the question rather than answering it.

**Interpretation:** a search history tied to a signed-in user is personal data under UK GDPR, and P7
built the data-subject-rights machinery precisely so that new personal data has somewhere to go. A
log added without wiring is a silent compliance regression of exactly the shape this repo has
already paid for elsewhere.

**Confidence:** the code facts are Known. Whether the log will carry a user link at all is **Needs
validation** — it is an open design choice in `#565`'s unwritten spec, and the cheapest resolution
is to decide it never does.

**Why it matters commercially:** a data-subject access request that silently omits a category of
personal data is a regulatory exposure, and search history is unusually revealing — dietary,
religious and health inferences all fall out of grocery queries.

**Options considered:** record no user link at all, storing vendor plus a hashed IP exactly as
`OrderLookupAttempt` and `AuthenticationAttempt` already do ("SHA-256 of the caller's IP, not the IP
itself — this table exists purely as a counter"), which removes the problem at the root and still
serves the curation purpose the log exists for; link to the user and wire the model into both export
and erasure; link and accept the gap, which is not defensible.

**Cost of delay:** after launch this becomes a migration over live rows plus a decision about
backfilling or discarding history already collected.

**Next action:** PROPOSE

### 2026-09-03 — the zero-result AI call is an unmetered, attacker-controlled cost path

**Trigger:** explicit /discover on P2.6.
**Status of the area:** genuinely unowned — `#565` specifies the AI call and no limit on it.

**Observed (verifiable today):** `/search` is public and unauthenticated, and `#565` attaches a
Cloudflare AI call to any query returning zero results — a condition fully controlled by the caller
through the `q` parameter. **There is no middleware layer to limit it centrally:** no `proxy.ts` or
`middleware.ts` exists, and `CLAUDE.md` records that none can ship on this stack at all, because
Next 16 forbids the edge runtime for a Proxy file while `@opennextjs/cloudflare` 1.20.2 exits the
build on a Node-runtime one. Rate limiting therefore exists only per route, in two places:
`lib/auth.ts` (and only as a **plugin** — a bare `onRequest` config key silently never runs, `#483`)
and guest order lookup. Both are backed by the same model shape, `vendorId` plus `ipHash` plus
`createdAt` with a matching index (`OrderLookupAttempt`, `AuthenticationAttempt`).
`lib/image-generation.ts:44` already carries a 429 retry loop with 2s and 4s backoff because
Workers AI rate-limits this account in practice.

**Interpretation:** a trivial script issuing random queries converts each request into a paid
inference. The account's AI quota is **shared with the product image pipeline**, so the failure is
not only a bill — exhausting it also stalls image generation, which `#523` already showed is a
fragile, bounded, scheduled job.

**Confidence:** Known. Every element is a verified code or configuration fact.

**Why it matters commercially:** unbudgeted spend on an endpoint no one is watching, plus a
shared-quota outage in an unrelated subsystem, and neither has an alert behind it — `#437`
(critical production alerting) is still open.

**Options considered:** a per-route limiter reusing the existing counter-model shape, which is a
known-good pattern here; a cheap pre-filter so AI is reached only after the deterministic rungs fail
and only for queries that look like plausible product terms; caching corrections by normalised query
so a repeated attack costs nothing after the first hit; doing nothing, which is only tenable if the
AI rung is never reached by anonymous traffic.

**Cost of delay:** designing the limiter alongside `#565` is nearly free; adding it after an
unexpected bill or a stalled image job means doing it under pressure.

**Next action:** PROPOSE

### 2026-09-03 — the recovery ladder fires on zero results, but the damaging case is one bad result

**Trigger:** explicit /discover on P2.6.
**Status of the area:** genuinely unowned — a design gap between `#564` and `#565` as filed.

**Observed (verifiable today):** `searchProducts` (`lib/repositories/products.ts:359`) ORs `name`
with `description`, so a term hitting prose in an unrelated product's description is a match. P3d
deliberately excluded `description` from **list** matching and recorded why: "A term matching prose
in a description produces a confident-looking wrong match, which is precisely what the review step
exists to prevent." The two paths therefore already disagree, and the storefront takes the looser
one. `#565`'s ladder is specified to run when a search yields no products; `#564` leaves whether
`description` stays in the match set as an open question for its spec.

**Interpretation:** a one-word query such as `haldi` that happens to appear in a single product's
description returns exactly one result, so the correction and synonym rungs never run. The shopper
sees one tangential product instead of the turmeric shelf — worse than zero results, because zero at
least triggers recovery. The trigger should be a relevance or confidence threshold, not a count
of zero.

**Confidence:** the code facts and the P3d ruling are Known. That this pattern occurs in the live
catalogue is **Needs validation** — and it becomes directly measurable from `#565`'s own query log
once that exists, which is an argument for shipping the log before tuning the trigger.

**Why it matters commercially:** grocery staples carry many near-synonyms and shoppers type one
word. A single irrelevant result reads as "they do not stock this" just as firmly as an empty page,
while consuming the one mechanism built to prevent that conclusion.

**Options considered:** fire the ladder on a relevance threshold rather than a result count; drop
`description` from search matching so the storefront agrees with the list matcher; keep
`description` but rank name matches above it and offer a "did you mean" alongside thin results
rather than only in place of empty ones.

**Cost of delay:** `#564` and `#565` are being specced now. The trigger condition is cheap to get
right before staff begin curating synonyms against it and awkward afterwards.

**Next action:** PROPOSE

### 2026-09-03 — the AI shop list accepts pack sizes it has no model to resolve

**Trigger:** explicit /discover on P2.6.
**Status of the area:** genuinely unowned as a **sequencing** question; the underlying unit model is
tracked as `#398`.

**Observed (verifiable today):** `#567` accepts pack sizes as input and requires that "quantities and
specified pack sizes are retained wherever possible". `Product` carries no pack-size field, and
`unitLabel` is free text of the form "GBP 2.40 per kg", unusable as a facet or a comparison. `#569`
avoids this by **excluding** pack size and deferring to `#398`; `#567` cannot, because pack size is
part of its input. `#398`'s unit-price half sits in **P9.3** and its variant and unit-of-measure
model in **P10** — both *after* P2.6, which was sequenced ahead of P9 on 2026-09-03.

**Interpretation:** "2kg atta" against a catalogue holding 1kg, 5kg and 10kg bags has no defined
resolution — two of the small bag, the nearest single pack, or a refusal are all defensible, and
they are not equivalent to the shopper. Without a unit model the AI will pick one confidently, which
is precisely the "materially different product" outcome the requirement forbids. This is a
dependency inversion created by the sequencing decision, not a defect in any single issue.

**Confidence:** Known.

**Why it matters commercially:** weight-denominated staples — atta, rice, keema, dal — are exactly
the vocabulary the Desi shop-list feature exists to serve, so this is the centre of the use case
rather than an edge of it.

**Options considered:** constrain `#567` to count quantities and route weight-denominated lines to
the review step flagged as needing a choice, which is the smallest change, keeps the
never-substitute guarantee intact and needs no unit model; pull `#398`'s unit derivation forward
ahead of `#567`, which reopens the sequencing decision; resolve to the nearest single pack and show
the size prominently in review, which is guessing with a disclosure.

**Cost of delay:** if `#567` is built before this is settled, its matcher encodes a guess that
`#398` then has to unpick, in the one place where a wrong answer charges the customer for the wrong
weight of food.

**Next action:** PROPOSE

### 2026-09-03 — ranking in-stock first can hide that the shop stocks the item at all

**Trigger:** explicit /discover on P2.6; a challenge to `#564` as filed.
**Status of the area:** partly tracked — `#400` (smart stock badges with expected restock date) is
filed and sits in P10.

**Observed (verifiable today):** `#564` will rank in-stock products ahead of out-of-stock ones.
An `inStockOnly` filter **already exists** as an explicit opt-in
(`buildFilterWhere`, `lib/repositories/products.ts:189`, setting the inventory quantity predicate to
greater than zero), so the shopper already has a control for "only show me what I can buy today".
Ordering is currently `createdAt desc, id desc` for every listing including search.

**Interpretation:** making availability the default *ordering* removes the signal that the store
carries the item at all, and the customer already had a way to ask for that behaviour when they
wanted it. In grocery, stock volatility on fresh and chilled lines is routine rather than
exceptional, and the shopper is a weekly returner: "out of stock, back Thursday" retains them,
while a result set that looks empty of their staple sends them to a competitor permanently.

**Confidence:** the code facts are Known. The retention claim is **Inferred** — and it cannot
currently be measured, because no analytics instrumentation exists (see the 2026-09-02 entry on
that, still unresolved).

**Why it matters commercially:** the cost of getting this wrong is asymmetric. Burying an
out-of-stock staple risks losing a weekly shopper outright; showing it with an honest availability
badge costs one line of a result page.

**Options considered:** rank in-stock first but guarantee an exact name match is always visible
regardless of stock, which preserves both signals; keep recency ordering and rely on availability
badges to carry the message; expose ordering as an explicit sort control and default it to
relevance rather than availability.

**Cost of delay:** low in code terms — this is a rule in one spec — but it is much easier to state
now than to revisit once `#568`'s autocomplete inherits the same ranking.

**Next action:** PROPOSE

---

## 2026-09-02 — first Discover pass (pre-launch, P9 in flight)

Three findings from a full pass over the schema, routes, the 99 spec slices and the 88 open issues.
Everything else the pass surfaced was **already owned** — the fourteen issues of the `#408` brief
(`#394` to `#407`), `#116`, `#232`, `#286`, `#146` to `#149` and `#100` are all filed and
sequenced, and are deliberately not repeated here.

### 2026-09-02 — a paid order cannot be reduced, substituted or refunded

**Trigger:** first Discover pass.
**Status of the area:** genuinely unowned — no issue, no spec, no schema support.

**Observed:** `features/orders/` contains only `advance-status.ts`, `advance-status-bulk.ts`,
`guest-data-rights.ts`, `reorder-items.ts` and `send-status-email.ts`; there is no staff
order-line-edit module. `lib/repositories/orders.ts` releases stock on cancellation only for
`PENDING_PAYMENT` orders. `PaymentStatus` declares `REFUNDED` and no code path ever writes it.
`ADR-005` states a paid order's code use cannot currently be reversed and that refunds are that
ADR's undecided territory. `CLAUDE.md` records `#137` and `#151` as structurally unreachable for
the same reason. `OrderItem` has no substitution, fulfilled-quantity or per-line note field.

**Interpretation:** a short pick — routine daily reality for fresh meat and produce — has no
representation. Staff can only deliver short and correct it out of band, after the customer has
already been charged in full, because `lib/payments.ts` pins no `capture_method` and so captures
immediately.

**Confidence:** the code facts are Known. That short picks are frequent at Aheed specifically is
**Inferred** — it is reasonable for a butcher, but it is not observed Aheed data.

**Why it matters commercially:** the first imperfect order is where grocery repeat-purchase rate is
won or lost. The exposure is also consumer-rights shaped, not merely UX shaped.

**Options considered:** a full substitution-preference flow (too large, and `#399`'s variant model
gates the weight half of it); a reduce-only line adjustment with a refund (smallest change that
makes the outcome representable); manual out-of-band refunds through the Stripe dashboard (works
today, leaves no order-level audit trail and cannot reverse loyalty points or a discount code).

**Cost of delay:** it needs an `ADR-005` amendment on refunds and capture, which `#399` also needs.
Deciding it once serves both; deciding it after launch means deciding it while live orders exist.

**Next action:** PROPOSE

**Update 2026-09-05 (P2.6 milestone-close Discover pass):** this finding carried `PROPOSE` for
three days with no issue filed — an instruction-8 gap in the pass that wrote it. Re-verified still
current (the `REFUNDED` enum value still has no writer, `ADR-005`'s own text still calls this "open
territory") and filed as **#606**.

### 2026-09-02 — there is no analytics instrumentation of any kind

**Trigger:** first Discover pass.
**Status of the area:** genuinely unowned.

**Observed:** `package.json` matches nothing for `analytics`, `gtag`, `plausible`, `posthog`,
`segment`, `mixpanel` or `umami`. No event-dispatch call exists in `app/`, `features/`,
`components/` or `lib/`. `lib/repositories/reports.ts` and the staff reports page both state that
sales analytics is deliberately absent while production runs Stripe test keys.

**Interpretation:** no conversion, basket-abandonment or search-success figure can be produced
today, and no baseline can exist for any future change. This is a **measurement** gap rather than a
feature gap, and it silently weakens every prioritisation argument made without it.

**Confidence:** Known.

**Why it matters commercially:** without a baseline, a shipped optimisation cannot be shown to have
worked, so the Learn phase can only report what was delivered, never whether behaviour changed.

**Options considered:** a full product-analytics vendor (cost, and a cookie-consent surface);
a minimal first-party event table written through the existing repository layer (view, add to
basket, begin checkout, purchase — vendor-scoped, no third party, no consent banner); nothing.

**Cost of delay:** every day of live trading without it is a baseline that cannot be recovered
retrospectively.

**Next action:** PROPOSE

**Update 2026-09-05 (P2.6 milestone-close Discover pass):** also carried `PROPOSE` with no issue for
three days. Re-verified still current and filed as **#607** — this gap is now doubly relevant, since
the 2026-09-03 "ranking in-stock first" finding below explicitly cannot be validated without it.

### 2026-09-02 — an order carries no delivery date, slot or capacity ceiling

**Trigger:** first Discover pass.
**Status of the area:** partly tracked — `#401` (delivery calendar) is filed and sits in P10.

**Observed:** `Order` carries `deliveryFeePence` and no date, slot or fulfilment-type field.
`VendorDeliveryArea` carries a postcode district prefix and no capacity. `#401` is gated on `#363`
(the vendor timezone is a hardcoded constant).

**Interpretation:** the *customer-facing* half of this is correctly deferred — the three-step
status in `specs/mission.md` is a deliberate MVP decision. The **operational** half is not the same
question: with no capacity ceiling, nothing stops a day taking more chilled orders than the van can
physically deliver. That is an operational risk that a launch surfaces immediately.

**Confidence:** schema facts Known. Whether Aheed's real delivery capacity is likely to be exceeded
at launch volumes is **Needs validation** — it depends on their van count and round size, which
this repo cannot answer.

**Why it matters commercially:** a missed chilled delivery is a refund plus a lost customer, and it
is the failure mode with the worst word-of-mouth in grocery.

**Options considered:** the full `#401` calendar (P10, gated); a per-day order cap with a simple
cut-off message (small, needs `#363` resolved for the cut-off time to be correct); an operational
answer outside the software, if Aheed's real capacity comfortably exceeds launch volume.

**Cost of delay:** low if the operational answer holds; high if it does not, and only Aheed can say
which.

**Next action:** RESEARCH MORE — ask Aheed for van count, round size and realistic daily order
ceiling before proposing anything.
