---
id: staff-tabs-guide
title: "Staff Daily Operations Playbook"
audience: [staff]
type: runbook
status: approved
version: "2.1.0"
updated: "2026-09-12"
visibility: internal
summary: "How to use every page in the Staff Panel: picking and dispatching orders, managing catalogue products, categories, brands, bundles, promotions, inventory, search dictionary moderation, and finding the guides. One section per menu item."
tags: ["staff", "guide", "ui", "fulfillment", "inventory", "catalogue", "synonyms"]
---

# Staff Daily Operations Playbook

Welcome to the **Staff Panel**. This guide covers every page you can open, one section per menu
item. If a page is not listed here, your account cannot open it — the Store Admin Management Guide
covers the owner-only pages.

Your core operational pages are **Overview**, **Live Inventory & Availability**, **Fulfillment & Orders**,
**Catalogue** (Products, Categories, Brands, Bundles, Promotions), and **Search Dictionary**,
plus this **Runbook**. Configuration of storefront settings, payments, delivery areas, loyalty,
and discount codes belongs to a store admin.

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


## Categories — `/staff/categories`

**Purpose:** The departments shoppers browse by, and the subcategories under them.

**Who can access:** Staff and store admins

**What you can do:** Create a department, create a subcategory under a department, rename either,
change its web address, reorder it, and hide it from shoppers.

**Typical workflow:** You reorganise a section of the shop. Create the new department first, then its
subcategories, then move products into them from the Catalogue page.

**Important fields and filters:** The tree is **exactly two levels deep** — a department, and
subcategories under it. You cannot nest a subcategory inside another subcategory, and that limit is
deliberate rather than an oversight. Each category's web address must be unique across the shop.

**Common mistakes and limitations:** The list is currently ordered by sort order and then by name
across the whole shop rather than grouping each department with its own subcategories, so an indented
subcategory on screen may sit beneath a department it does not belong to. Read the "in *department*"
label under a subcategory's name rather than trusting its position in the list. Hiding a department
hides it from browsing but does not hide the products inside it from search.

**What happens after changes are saved:** The shop's navigation updates immediately. Products already
assigned to a category stay assigned to it through a rename.


## Brands — `/staff/brands`

**Purpose:** The brands shoppers can filter by, such as Shan or TRS.

**Who can access:** Staff and store admins

**What you can do:** Add a brand, rename it, and remove one.

**Typical workflow:** You start stocking a new brand. Add it here first, then set it on each of that
brand's products from the Catalogue page. Until at least one product carries a brand, the brand
filter has nothing to show and does not appear to shoppers.

**Important fields and filters:** A brand has a name shoppers see and a web address used in filter
links. Both must be unique within your shop.

**Common mistakes and limitations:** Creating a brand does nothing visible on its own — a brand with
no products behind it is invisible in the shop. The work that makes it appear is setting the brand on
products. Avoid creating near-duplicates ("TRS" and "T.R.S."), because shoppers will see both as
separate filter options.

**What happens after changes are saved:** The brand becomes available in the Catalogue product form
straight away, and appears as a shopper-facing filter once a product carries it.


## Promotions — `/staff/promotions`

**Purpose:** Department campaign banners — the headline, image and link that front a department.

**Who can access:** Staff and store admins

**What you can do:** Write a campaign headline and subtitle for a department, upload a banner image,
set a link, and schedule when it runs.

**Typical workflow:** You are running a seasonal push on a department. Pick the department, write the
headline, upload the banner, set the dates, and save.

**Important fields and filters:** **Only top-level departments can carry a campaign.** A campaign is
rendered on the department hero, and that only ever displays top-level departments, so there is
nowhere for a subcategory campaign to appear.

**Common mistakes and limitations:** A campaign's headline and subtitle are free text, so a typo goes
live exactly as typed — read it back before saving. Scheduling a campaign does not switch anything
else off; if two departments both run campaigns, both display on their own pages. The real product
price callout is always shown alongside your campaign copy and cannot be suppressed by it.

**What happens after changes are saved:** The banner appears on that department's page as soon as its
schedule allows.


## Bundles — `/staff/bundles`

**Purpose:** Curated multi-product deals, such as a weekly meat box or a breakfast set.

**Who can access:** Staff and store admins

**What you can do:** Create a bundle, give it a name and tagline, choose the products and quantities
inside it, upload an image, and control the order bundles appear in.

**Typical workflow:** You decide to promote a weekly box. Create the bundle, add each product with
the quantity a customer receives, add an image, and save.

**Important fields and filters:** Every product in a bundle must already exist in your catalogue. The
quantity is how many of that product the customer gets, not a stock figure. **There is no price field
to set** — the price shown to a shopper is always the live sum of the products' own current prices,
recalculated on every view.

**Common mistakes and limitations:** Because the price is always live, changing a product's own price
changes every bundle containing it immediately, with nothing to review or re-save on the bundle
itself. Removing a product from the catalogue that a bundle still references will leave that bundle
incomplete, and a product going out of stock drops it from the bundle until it returns.

**What happens after changes are saved:** The bundle appears in the shop's bundle listing
immediately.






## Catalogue — `/staff/products`

**Purpose:** The list of everything your shop sells, and the place where products are created and
edited. This is the record of the product; the day-to-day stock figure lives under Inventory.

**Who can access:** Staff and store admins

**What you can do:** Add a product, edit its name, description, price and unit label, record its net
content so the shop can work out a real price per kilo or litre, set its department, choose its
brand, mark dietary and provenance flags, feature it on the homepage, and manage its photographs.

**Typical workflow:** A new line arrives. Create the product, fill in name, price and unit label,
add the net content if the item is sold by weight or volume, choose the department it belongs in,
upload a photo, then set its opening stock. After that, staff keep the stock figure current from the
Inventory page and you only return here when something about the product itself changes.

**Important fields and filters:** Price is entered in pounds and pence. The unit label is what the
shopper sees next to the price, so make it match how you actually sell the item. **Net content
amount** and **Net content unit** are the pair that matter for pricing law: fill both in — for
example `500` and `Grams` — and the shop works out the price per kilogram itself and shows that
instead of your unit label, so it can never drift from the price you charge. Leave them empty and
nothing changes: the product goes on showing the unit label you typed. The amount is a whole number
in the unit you pick, so enter half a kilo as `500` grams rather than `0.5` kilograms. **Unlike the
shop itself, this list shows switched-off products too** — that is deliberate, because otherwise you
could never find a product to switch back on.

**Common mistakes and limitations:** A product must be assigned to a department, and it can sit in a
top-level department or in one of its subcategories. Both are valid, so check you have picked the one
shoppers will browse. Marking a product as HMC certified requires the certificate reference and
verification date; the flag cannot be set without them, and that is intentional. Net content is
all-or-nothing — an amount with no unit, or a unit with no amount, is refused with the field marked,
because neither half prices anything on its own. It also describes **one** pack: a 1kg bag and a 5kg
bag are two separate products here, not two sizes of one. Switching a product off hides it from
shoppers but does not delete it or affect orders already placed.

**What happens after changes are saved:** The change is live immediately — the storefront, the
department listing and the product's own page all update. Existing orders are unaffected: they keep
the price and details captured when the customer ordered.





## Search dictionary — `/staff/search-synonyms`

**Purpose:** Teach the shop's search that two words mean the same thing, so a shopper typing
*bhindi* reaches okra.

**Who can access:** Staff and store admins

**What you can do:** Add a synonym by hand, edit or remove one, and approve or reject the entries the
system proposes from searches that found nothing.

**Typical workflow:** You notice customers searching for a word your product names do not use. Add
that word as an alias pointing at the term your catalogue actually uses. Periodically, review the
proposed entries and approve the ones that make sense.

**Important fields and filters:** An entry maps an **alias** (what the shopper types) to a
**canonical** term (what your catalogue calls it). Approved entries **widen** a search: the shopper's
own word always stays in the query, so an entry can add results but can never silently replace what
they asked for.

**Common mistakes and limitations:** A synonym pointing at a word that appears in no product name
does nothing. Proposals come from real failed searches and are suggestions, not facts — read each one
before approving, because an incorrect mapping will surface products a shopper did not ask for. This
page is not currently linked from the panel navigation, so reach it from this guide's address or a
bookmark.

**What happens after changes are saved:** Approved entries affect shopper searches immediately;
rejected proposals are removed from the queue.



