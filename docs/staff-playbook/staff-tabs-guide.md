---
id: staff-tabs-guide
title: "Staff Daily Operations Playbook"
audience: [staff]
type: runbook
status: approved
version: "2.0.0"
updated: "2026-09-06"
visibility: internal
summary: "How to use every page in the Staff Panel: picking and dispatching orders, keeping stock honest, clearing stranded payments, and finding the guides. One section per menu item."
tags: ["staff", "guide", "ui", "fulfillment", "inventory", "payments"]
---

# Staff Daily Operations Playbook

Welcome to the **Staff Panel**. This guide covers every page you can open, one section per menu
item. If a page is not listed here, your account cannot open it — the Store Admin Management Guide
covers the owner-only pages.

Your four pages are **Overview**, **Live Inventory & Availability**, **Fulfillment & Orders** and
**Payment Issues**, plus this **Runbook**. Everything else in the panel belongs to a store admin.

## Overview

The **Overview** is the panel's front door. It tells you how many orders are waiting for someone to
act on them, and gives you a card for each page you can reach.

If a card is missing that a colleague has, that is because their account is a store admin and yours
is staff. That is normal and not a fault.

## Live Inventory & Availability — `/staff/inventory`

**Purpose:** Keep what the website says is in stock matching what is actually on the shelf. This is
the page you use most, and the one that most directly stops a customer ordering something you cannot
pick.

**Who can access:** Staff and store admins

**What you can do:** Adjust a product's stock quantity, and switch a product on or off for
shoppers. You cannot change a price, a name, a photo or which department a product sits in — those
are owner decisions and live under Catalogue.

**Typical workflow:** You spot a gap on the shelf during a shift. Search for the product by name,
correct its quantity to what is really there, and carry on. If the item has gone entirely and you do
not expect it back today, switch it off rather than setting it to zero — a switched-off product
disappears from the shop instead of showing as unavailable.

**Important fields and filters:** There is a single search box that matches on the product name. The
page loads the first 100 products and does not paginate, so **use the search box rather than
scrolling** if you cannot see what you need — a large catalogue will not all be on screen.

**Common mistakes and limitations:** The system already reduces stock automatically when a customer
orders. You do not need to deduct picked items by hand, and doing so will take the count too low.
Only correct a figure when you have physically checked it. Setting a quantity to zero still leaves
the product listed as out of stock; switching it off removes it from the shop entirely.

**What happens after changes are saved:** The change is live for shoppers immediately — the
storefront and the product's own page both refresh. There is no separate publish step and no undo,
so re-check a figure before you leave the row.

## Fulfillment & Orders — `/staff/orders`

**Purpose:** Your work queue. This is where paid orders are picked, dispatched and marked delivered,
and where you look up an order when a customer calls.

**Who can access:** Staff and store admins

**What you can do:** Move an order to its next status, move several at once, search past orders, and
open any order for its full history.

**Typical workflow:** Open the page and you land on the **action queue** — only orders that need
someone to do something, newest first. Pick an order, then move it from *Confirmed* to *Out for
delivery*, and to *Delivered* once it arrives. When several orders go out on the same run, tick them
and use the bulk control rather than advancing each one.

**Important fields and filters:** With no filters set, the page deliberately shows **only orders
awaiting action** — delivered and cancelled orders are hidden so the queue stays a worklist. To see
anything else you must choose a status explicitly, including "All statuses". The search box matches
an order number or a customer email. Results are paged 20 at a time, and the page link carries your
current filter with it.

**Common mistakes and limitations:** An order sitting in *Pending payment* is not yours to advance —
the customer's payment never completed, and there is no control to push it forward. Those are
handled on the Payment Issues page. If you filter to a status and then think the store has lost
orders, check the filter first: leaving the queue is an explicit act, so it is easy to forget you are
still in a filtered view. The banner at the top tells you which view you are in.

**What happens after changes are saved:** The status change is recorded immediately with your name
against it and appears in the order's history. The customer sees the new status on their own order
page. Status moves cannot be undone from this page, so read the order number before you act on a bulk
selection.

## Payment Issues — `/staff/payments`

**Purpose:** Find orders where the payment did not complete cleanly, and get them unstuck. Without
this page an affected order sits in *Pending payment* forever, quietly holding its stock.

**Who can access:** Staff and store admins

**What you can do:** See each payment event the system refused, re-check it against the payment
provider, and recover the order it left stranded.

**Typical workflow:** A customer says they paid but their order still shows as awaiting payment.
Open this page, find their order, and use the reconcile control to ask the payment provider what
really happened. If the payment did go through, recover the order so it moves on to *Confirmed* and
reaches your picking queue.

**Important fields and filters:** The page lists the 50 most recent refusals for this store. Each row
shows the order it relates to and the amount, so you can match a customer's phone enquiry to a row
quickly.

**Common mistakes and limitations:** This page shows payments the system actively **refused**, not
every order stuck in *Pending payment*. An order whose payment notification simply never arrived is
picked up automatically by a scheduled check instead, so a missing row does not mean nothing is
wrong. Escalate rather than cancelling an order the customer insists they paid for. Refusals that
could not be matched to any order do not appear here at all — they are kept for investigation and are
not something you can action.

**What happens after changes are saved:** Reconciling asks the payment provider and updates the order
to match reality — it never assumes. Recovering a genuinely paid order moves it into the normal flow,
where it shows up in Fulfillment & Orders like any other confirmed order. Running the same action
twice is safe and will not double-charge or double-confirm anything.

## Internal Operational Runbook — `/staff/runbook`

**Purpose:** The guides for running the shop, including this one. Read-only.

**Who can access:** Staff and store admins

**What you can do:** Read the operational guides for your role. Choose a document from the list on
the left and it opens on the right.

**Typical workflow:** You hit something you have not done before — an unusual order, a stock
question — and check the relevant guide here before asking.

**Important fields and filters:** The tabs above the list filter by who a document is written for.
**All** shows everything available to you; **Staff** shows this playbook; **Store admin** shows the
owner's guide, which you can read even though you cannot open all the pages it describes. A tab only
appears when there is at least one document behind it, so the set of tabs you see is the set that
actually has content.

**Common mistakes and limitations:** These documents are guidance, not a live view of the shop —
nothing here shows current stock or orders. If a guide and the actual page disagree, trust the page
and report the guide so it can be corrected.

**What happens after changes are saved:** Nothing is editable here. Documents change when someone
updates them and the site is redeployed.

## Customer data and loyalty

- **Loyalty points** are earned and deducted automatically at checkout. You do not manage them by
  hand, and there is no control on any staff page to adjust a customer's balance.
- **Security.** Customer names, addresses and emails are confidential. Look up a customer's order
  only when you are actively helping them with it.
- **Refunds are not issued from this panel.** If a customer needs money back, escalate to a store
  admin — there is no refund control anywhere in the staff or admin pages.
