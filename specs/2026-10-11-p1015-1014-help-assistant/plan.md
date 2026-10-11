---
id: p1015-1014-help-assistant-plan
title: "Guided help assistant with WhatsApp handoff and conversation logging (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-10-11
visibility: internal
summary: "#1015 + #1014 as one slice: a per-vendor guided help assistant (off by default) answering from computed facts and active FAQs, handing off to WhatsApp with a bounded summary, logging topic and outcome without a user link."
tags: [p10, chatbot, help-centre, whatsapp, logging, privacy]
related: [roadmap, architecture, app-conventions]
---

# Guided help assistant with WhatsApp handoff and conversation logging (plan)

Issues **#1015** (first-party storefront chatbot with `wa.me` context handoff) and **#1014**
(conversation logging), built as **one slice** at the owner's Gate 1 approval on 2026-10-11. The
decisions are recorded as comments on both issues and on #1021. `requirements.md` holds the
checkable criteria; this file holds the reasoning.

**Goal:** give every vendor a help assistant they can switch on, which answers the questions the
platform can already answer truthfully from that vendor's own data, and hands everything else to
the store's WhatsApp with a short summary. Every conversation leaves a row recording what was
asked and how it ended, so **#1021** (the vendor-written FAQ answers) can be written from evidence
rather than guesswork.

## Why this is buildable before #1021

#1021's body says a bot "answers from this corpus and has nothing else to draw on". That predates
#1013 shipping. Today the platform computes, per vendor and without any authored content:

- delivery fee, minimum and free-delivery threshold, per area — `lib/help-facts.ts`
  `helpDeliveryFacts()`, the same function `/help` uses;
- whether Click & Collect is offered and its minimum — `VendorConfig.offerCollection`,
  `HelpDeliveryFacts.collectionMinimumOrderPence`;
- whether loyalty runs and its rules — `LoyaltyConfig` from `lib/loyalty-service.ts`;
- neutral discount-code wording, already on `/help`.

The vendor's own answers (`VendorFaq`, #1012) are read **when the panel opens**, so an answer a
store adds later at `/staff/faqs` appears with no code or schema change. A vendor with none simply
has no "store questions" group. Nothing is hardcoded, seeded or generated (ADR-004, #239).

## Scope (this slice)

### 1. Per-vendor switch

`VendorConfig.assistantEnabled Boolean @default(false)`. Every vendor, in every environment,
starts **off**, so the migration ships to production with no visible change. The assistant renders
only when the switch is on **and** `VendorConfig.whatsappNumber` is set: the handoff is half of the
feature, and an assistant that can answer three topics but has nowhere to send the rest is worse
than none. (The Gate 1 proposal suggested hiding just the handoff when no number exists; this spec
tightens that to "no number, no assistant", which is simpler and loses nothing. `/staff/assistant`
says so plainly when the number is missing.)

The switch lives on the new `/staff/assistant` page, not on `/staff/storefront`. Gate 1 said "with
the other storefront toggles"; putting the switch beside the report that tells an admin whether the
assistant is working is the better home, and costs no extra surface since the page exists anyway.

### 2. Storefront entry point and panel

- A **Help** control inside the existing `components/layout/FloatingContact.tsx` disclosure, not a
  third floating button — the mobile programme spent real effort keeping that corner clear, and
  `RewardsLauncher` already sits there for loyalty vendors.
- `StorefrontChrome` passes `assistantEnabled` from the `VendorProfile` it already loads, so the
  page render gains **no** query. Content is fetched by a server action only when the panel opens.
- The panel is a modal dialog: labelled, Escape closes it, focus returns to the trigger. Closing it
  ends the conversation; the next open starts a new one.

### 3. Topics and answers (guided only — no free text, no AI)

Fixed labels, vendor-neutral (no vendor name, no product category):

| Topic (`AssistantTopic`) | Label shown | Shown when | Behaviour |
|---|---|---|---|
| `DELIVERY` | Delivery charges and minimums | always | Answer from `helpDeliveryFacts()` |
| `COLLECTION` | Click & Collect | `offerCollection` | Answer: collection offered, its minimum |
| `REWARDS` | Rewards and points | `loyaltyEnabled` | Answer from `LoyaltyConfig`, link `/account/loyalty` |
| `DISCOUNT_CODES` | Discount codes | always | Neutral answer |
| `STORE_QUESTION` | the vendor's own question text | one per **active** `VendorFaq` | The vendor's answer, verbatim |
| `ORDER_STATUS` | Where is my order? | always | Link: `/account/orders` signed in, `/orders/lookup` otherwise |
| `ITEM_SWAP` | Swap an item in my order | always | **Handoff only** |
| `CANCEL_PAID_ORDER` | Cancel an order I've paid for | always | **Handoff only** |
| `OTHER` | Something else | always | **Handoff only** |

`ITEM_SWAP` and `CANCEL_PAID_ORDER` never offer an outcome: substitution and cancelling a paid
order cannot be resolved by anyone today (#606), so the bot must not imply otherwise. Their copy is
fixed in `requirements.md` so a validator can check it word for word.

### 4. WhatsApp handoff

Reuses the `wa.me` link shape `FloatingContact` already builds. The text is assembled by a pure
function that takes **only** the vendor name, the subject (topic label or FAQ question) and an
optional order number — it has no parameter through which a name, email, phone or address could
enter. Capped at **300 characters** after assembly (`?text=` passes through the shopper's OS and
some clients truncate silently; #1015 constraint 1). A signed-in shopper may pick one of their own
five most recent orders at this vendor; a guest cannot, and types the number into WhatsApp. The
panel says the summary starts a message and the conversation itself is not sent (#1015 constraint
3: a handoff, not a transfer).

### 5. Conversation log (#1014, option 2)

New `AssistantConversation`, modelled field for field on `SearchQueryLog` (#565):

- `vendorId`, `topic`, `openingQuestion`, `outcome` (`ANSWERED` / `HANDED_OFF` / `ABANDONED`,
  default `ABANDONED`), `ipHash`, `createdAt`, `updatedAt`.
- **No user link and no order number** — the #570 precedent, which keeps it out of
  `lib/repositories/data-rights.ts`'s export and erasure scope.
- **`openingQuestion` is never shopper-written.** The server derives it: the fixed label for a
  topic, or the vendor's own active FAQ question looked up by id **and** vendor. A client cannot
  send text that lands in this column, so the "no free text" decision is enforced on the wire, not
  only in the UI.
- A row is created on the shopper's **first** choice in a panel session. Showing an answer moves it
  to `ANSWERED`; tapping the handoff moves it to `HANDED_OFF` (terminal). A session that never
  reaches either stays `ABANDONED`.
- Cost control on a public write, the `list-normalisation-rate-limit` shape: at most 20 new rows per
  vendor and hashed IP in 10 minutes, counted on this table itself. **A refused write does not
  break the assistant** — the shopper still gets answers and the handoff; only the log row is
  skipped. A 1% sweep deletes rows older than 90 days.
- Writes use only childless `create`, singular `update` and `deleteMany`, so all run over
  `getPrisma()`; no `updateMany`, no websocket client (`CLAUDE.md` Database rules).

### 6. Staff page `/staff/assistant` (admin only)

The switch, a notice when no WhatsApp number is set (linking `/staff/storefront`), and a read-only
report over the 90-day window: total conversations, counts by outcome, counts by topic and outcome,
and the ten opening questions most often handed off. Lands on all three required surfaces
(`PanelNav` admin tier, the hub, `docs/store-admin-guide/admin-tabs-guide.md`) and renders
`PanelRefusal` on refusal. `/staff/faqs`'s intro and its guide section gain one sentence saying its
answers also appear in the help assistant.

### 7. Privacy page

`/privacy` section 5 gains one paragraph stating what the assistant records (topic, how it ended,
a hashed network address), that it is not linked to the shopper, and that it is deleted after 90
days.

## Deliberately excluded

- **Free-text questions and AI answers.** Owner decision at Gate 1. A later slice can add grounded
  free-text answers over the same facts and FAQs; the AI groundwork (#1016 model config, #1017
  per-vendor metering) is already in production.
- **Any shopper-written text in the log or in the `wa.me` URL.** Follows from the above.
- **Writing FAQ answers.** That is #1021, owner work, best done after the assistant has run on one
  vendor and the report shows what shoppers ask.
- **A conversation transcript, staff inbox or assignment model.** #1014's rescope removed them; the
  destination is WhatsApp.
- **Guest order selection.** A guest has no session-bound order list; they type the number into
  WhatsApp themselves.
- **Disclosing the existing search query log on `/privacy`.** Found while writing this spec: the
  privacy page does not mention `SearchQueryLog` either. Same class, pre-existing, out of scope —
  to be filed as its own issue at Build rather than widened into this slice.
- **Turning the assistant on anywhere.** Enabling it per vendor is an owner action after release.

## Open items carried forward

- **#1021** — vendor answers, owner-gated, informed by this slice's report.
- **Enabling the assistant in production** — owner decision per vendor; production verification
  for this slice is that nothing changes while every vendor is off.
- **Free-text / AI answers** — a later `/propose`, once the report shows the guided topics' gaps.
