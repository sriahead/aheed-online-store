---
id: store-admin-tabs-guide
title: "Store Admin Management Guide"
audience: [store-admin]
type: runbook
status: approved
version: "2.1.0"
updated: "2026-09-06"
visibility: internal
summary: "How to use every owner-only page in the Store Admin Panel: catalogue, categories, brands, bundles, promotions, discounts, loyalty, storefront, delivery areas, reports, customers, search dictionary and team access."
tags: ["admin", "guide", "ui", "configuration", "vendor"]
---

# Store Admin Management Guide

This guide covers every page a **store admin** can open, one section per menu item. Your staff can
open four pages — Inventory, Orders, Payment Issues and the Runbook — and those are described in the
Staff Daily Operations Playbook rather than repeated here. You can open those four as well.

**Two things this panel does not do, so you are not looking for a control that is not there:**

- **There is no refund control anywhere in this panel.** Refunding a customer is done directly in
  your payment provider's own dashboard, outside this application. Nothing here will move money back
  to a customer, and nothing here records that you did.
- **There is no way to invite someone to join your team.** A colleague must register their own
  account on the shop first, exactly as a customer would. Once they have, you can give that account
  a role from the Team & Access page.

## Catalogue — `/staff/products`

**Purpose:** The list of everything your shop sells, and the place where products are created and
edited. This is the record of the product; the day-to-day stock figure lives under Inventory.

**Who can access:** Store admins only

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

## Categories — `/staff/categories`

**Purpose:** The departments shoppers browse by, and the subcategories under them.

**Who can access:** Store admins only

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

**Who can access:** Store admins only

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

## Bundles — `/staff/bundles`

**Purpose:** Curated multi-product deals, such as a weekly meat box or a breakfast set.

**Who can access:** Store admins only

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

## Promotions — `/staff/promotions`

**Purpose:** Department campaign banners — the headline, image and link that front a department.

**Who can access:** Store admins only

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

## Discount codes — `/staff/discounts`

**Purpose:** Money-off codes customers type at checkout.

**Who can access:** Store admins only

**What you can do:** Create a code, review the codes you have, and deactivate one.

**Typical workflow:** You decide on an offer. Create the code with either a percentage or a fixed
amount off, set a minimum basket value if you want one, set the dates it runs, cap how many times it
can be used, and save. When the offer ends, deactivate it.

**Important fields and filters:** A code is either a percentage or a fixed amount, not both. You can
set a minimum basket, a start and end date, an overall usage cap and a per-customer cap.

**Common mistakes and limitations:** A code that is deactivated stops working for new orders but does
not affect orders already placed with it. Set a usage cap on anything you share publicly — a code
with no cap can be shared far beyond the audience you intended. Percentage discounts apply to the
basket, so check the interaction with a low minimum before publishing a large percentage.

**What happens after changes are saved:** The code works at checkout immediately, and deactivating
one stops it immediately.

## Loyalty — `/staff/loyalty`

**Purpose:** How customers earn points, what points are worth, and the tiers that reward your best
customers.

**Who can access:** Store admins only

**What you can do:** Set the earn rate, set the redemption value, and define tiers with spend
thresholds and point multipliers.

**Typical workflow:** You set this up once and revisit it rarely. Decide how many points a pound
earns, what a point is worth when spent, then add tiers such as Silver and Gold with the spend needed
to reach each and the multiplier it grants.

**Important fields and filters:** The earn rate and redemption value are the two figures that decide
what the scheme costs you. Tier thresholds are measured on customer spend; the multiplier applies to
points earned once a customer is in that tier.

**Common mistakes and limitations:** Changing the redemption value changes what **already-earned**
points are worth, not just future ones — customers holding a balance are affected immediately, so
treat a reduction carefully. The Reports page shows your outstanding points liability, which is worth
reading before you raise the earn rate.

**What happens after changes are saved:** New settings apply to checkouts from that point onward, and
the redemption value applies to every existing balance.

## Storefront — `/staff/storefront`

**Purpose:** Your shop's own identity — its branding colours, logo and homepage copy — the delivery
rules every order is charged by, and the social and contact links shoppers use to reach you.

**Who can access:** Store admins only

**What you can do:** Pick a ready-made colour theme, set all eight of your brand colours
individually, upload your logo, edit the homepage hero subtitle and the notice in the header banner,
set your delivery fee, your free delivery threshold and your minimum order value, and enter your
Facebook page address, your Instagram profile address and your WhatsApp number.

**Typical workflow:** You do the branding at setup and when it changes. The quickest start is to
choose a theme from the **Select a theme** list and press **Apply Theme** — that fills all eight
colour fields for you, and you can then adjust any of them before saving. Otherwise set the colours
yourself, upload the logo, write the banner note, and check the shop's homepage afterwards.
Delivery rules are their own form lower down the page with its own Save button — changing your
delivery fee does not require touching your branding, and saving one does not save the other. Social
and contact links are a third form below that, again with its own Save button, so you can add a
Facebook page months after setting your colours without touching anything else.

**Important fields and filters:** Colours are applied across the whole shop, so change one and check
a product page as well as the homepage. There are eight of them and they do different jobs: the two
**primary** colours carry headings and text, **accent** and **danger** carry buttons and alerts,
**cream** is the page background, and the three **tint** colours are the pale backgrounds behind
badges and notices. Applying a theme overwrites all eight at once. The banner note is a short line
in the site header — a good place for opening hours over a bank holiday. The three delivery amounts
are entered in pounds:
**Delivery fee** is what a shopper pays for delivery; **Free delivery over** is the basket value at
which that fee is waived, and leaving it **blank** means free delivery is never offered — which is
not the same as entering `0`, because `0` would make every order qualify; **Minimum order** is the
basket value below which a shopper cannot check out, so enter `0.00` if you do not want one.
The three social and contact fields work differently from everything else on this page: **leaving
one blank hides that link entirely** rather than showing a default, so a shop with no Instagram
account simply has no Instagram icon in its footer. **Facebook page address** and **Instagram
profile address** must both be full web addresses starting with `https://`. **WhatsApp number** is
entered as digits only in international format — `447700900123`, not `+44 7700 900123` — and adds a
WhatsApp button to every storefront page.

**Common mistakes and limitations:** Colour choices affect the readability of text sitting on them.
After changing a brand colour, look at a real page rather than only the colour swatch. Because your
branding is applied on top of the site's defaults, a very light or very dark choice can reduce
contrast for shoppers. Two things about themes are worth knowing: **Apply Theme** replaces all
eight colours immediately, so anything you had typed in those fields is lost — apply the theme
first, then adjust. And a theme is only a starting point: once applied, your colours are your own
and editing one does not "break" the theme or switch you back to it. For delivery, the two mistakes
worth naming are entering `0` in the free
delivery field when you meant to leave it blank, and setting a minimum order above what a typical
basket comes to — that refuses shoppers at checkout rather than warning them earlier. Amounts are
pounds and pence with at most two decimal places; anything else is refused with the field marked,
and nothing is saved until every value is valid. For the social and contact fields, the three
mistakes worth naming are pasting a Facebook or Instagram address that starts with `http://`
instead of `https://`, which is refused with the field marked; typing a WhatsApp number with a plus
sign, spaces or dashes, which is also refused; and expecting a blank field to fall back to
something — it does not, it removes the link. As with delivery, nothing in this form is saved until
every value in it is valid.

**What happens after changes are saved:** Applied across the shop immediately. An uploaded logo may
take a short time to appear everywhere because images are cached. New delivery rules apply to the
next basket calculated — a shopper already partway through checkout may still see the previous fee
until their basket recalculates. Social and contact links appear in the footer, and the WhatsApp
button on every storefront page, as soon as they are saved; clearing a field removes them just as
quickly.

## Delivery areas — `/staff/delivery-areas`

**Purpose:** The postcode areas your shop delivers to. This is a hard gate on checkout, not a
guideline.

**Who can access:** Store admins only

**What you can do:** Add a postcode area prefix, and remove one.

**Typical workflow:** You extend delivery to a new town. Add its postcode prefix here, and customers
in that area can immediately check out.

**Important fields and filters:** A prefix is the letters at the start of a postcode, such as `MK`.
It is matched against the start of the shopper's postcode.

**Common mistakes and limitations:** **A customer whose postcode does not match any prefix here
cannot complete checkout at all** — they can browse and fill a basket but will be refused at the end.
Removing an area is therefore an immediate loss of trade in it, not a soft change. You cannot remove
your last remaining area: with none left, every postcode would be undeliverable and no customer could
order. Prefixes are whole postcode areas, so you cannot currently include one district of an area
while excluding another.

**What happens after changes are saved:** Effective immediately for every shopper, including ones
already mid-basket.

## Reports — `/staff/reports`

**Purpose:** The numbers for your shop — sales, catalogue health and loyalty liability.

**Who can access:** Store admins only

**What you can do:** Read the figures. This page has no controls and nothing to edit.

**Typical workflow:** A weekly read. Check revenue and average basket, then look at the out-of-stock
and low-stock counts to see what needs reordering.

**Important fields and filters:** **Total revenue and total orders count only orders that were
actually paid for** — confirmed, out for delivery, and delivered. Abandoned checkouts and cancelled
orders are deliberately excluded, because including them once overstated revenue substantially.
Average basket value is derived from those same two figures. Low stock counts products at or below
their own threshold, and out-of-stock products are counted once rather than in both figures.

**Common mistakes and limitations:** These totals are for all time, not a selected period — there is
no date range on this page. The figures cannot currently be clicked through to the underlying orders,
so to see the orders behind a number, use the Orders page's own status filter. Note that the Orders
page's default view is narrower than the revenue figure here, so the two will not match unless you
filter deliberately.

**What happens after changes are saved:** Nothing is editable. Figures reflect the database at the
moment you loaded the page; refresh for current numbers.

## Customers — `/staff/customers`

**Purpose:** Who buys from your shop, what they have spent, and where they stand in the loyalty
scheme.

**Who can access:** Store admins only

**What you can do:** Browse the customer list and open a customer to see their detail.

**Typical workflow:** You want to understand your regulars, or check a specific customer's history
before a conversation with them.

**Important fields and filters:** The list carries contact details alongside spend and loyalty
standing, which is why it is restricted to store admins rather than being visible to staff.

**Common mistakes and limitations:** This is personal data. Open a customer's record when you have a
reason to, not out of curiosity, and do not export or forward it. Pages in this panel are marked as
not cacheable so they are not stored by browsers or proxies, but that protects the data in transit,
not what you do with it once you have read it. There is no control here to edit a customer's details
or adjust their points.

**What happens after changes are saved:** Nothing is editable from this page.

## Search dictionary — `/staff/search-synonyms`

**Purpose:** Teach the shop's search that two words mean the same thing, so a shopper typing
*bhindi* reaches okra.

**Who can access:** Store admins only

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

## Team & Access — `/staff/team`

**Purpose:** Give a colleague access to the panel, change their level of access, or take it away.

**Who can access:** Store admins only

**What you can do:** Grant the Staff role to a registered account by email address, and revoke access
from someone who has it.

**Typical workflow:** A new colleague starts. **Ask them to register an account on the shop
themselves first**, using the email address you will grant access to. Once they have registered, come
here, enter that email address, choose Staff, and save.

**Important fields and filters:** People are identified by the email address on their account, and
that account must already exist. The role options are Staff and Revoke access.

**Common mistakes and limitations:** **Entering the email of someone who has not registered fails
with "User not found"** — that is not a fault, it means they have not created their account yet.
**As a store admin you can grant the Staff role only.** Making someone a store admin requires a
platform administrator, so the Store Admin option does not appear for you. You also cannot change the
privileges of a platform administrator, and the system will not let the shop be left with no store
admin at all, so you cannot remove your own admin access if you are the last one.

**What happens after changes are saved:** Access changes immediately — the person sees the panel on
their next page load, or loses it. Every change is recorded in an audit log with who made it.
