/**
 * The Feature Catalogue's content (#1374): a demo reference of what the platform really does today.
 *
 * A PLAIN MODULE, NOT `"use server"` — a server-action file may export only async functions, so a
 * constant here would 500 every caller while `build` stays green (`CLAUDE.md`).
 *
 * HOW IT IS ORGANISED (Pyramid Principle): ROLE -> BUSINESS AREA -> FEATURE. Each feature opens with
 * its BLUF (`what`: purpose and value first), then `value` (the business benefit) and `demo` (the
 * talking point). Nothing is marketing copy: an entry exists only because the route or control it
 * names exists, and `tests/feature-catalogue.test.ts` fails if a named route is missing or a menu
 * page is left out.
 *
 * STATUS IS HONEST. `live` = works end to end in the code. `partial` = real but conditional (a
 * per-store switch, a missing owner-gated credential) — `note` says exactly what is missing.
 * `unavailable` = asked about, but not built or not usable today — listed so nobody promises it.
 *
 * COPY IS NEUTRAL. Vendors sell different things, so no vendor name or product example appears here.
 *
 * HOW TO KEEP IT TRUE: when a feature ships or is retired, edit its entry in the same commit. A
 * `/staff/*` page added to the menu fails the test until it is catalogued here.
 */

export type FeatureRole = "customer" | "admin" | "staff" | "platform";
export type FeatureStatus = "live" | "partial" | "unavailable";

export interface Feature {
  name: string;
  /** BLUF: what it does and why, in one or two sentences, purpose first. */
  what: string;
  /** The business value or benefit. */
  value: string;
  /** One short sentence to say while demonstrating it. */
  demo: string;
  /** The route it is shown at, or `null` where it is a behaviour rather than a page. */
  route: string | null;
  status: FeatureStatus;
  /** Required for `partial` and `unavailable`: what is missing, and who must act. */
  note?: string;
}

export interface FeatureArea {
  id: string;
  label: string;
  features: readonly Feature[];
}

export interface RoleCatalogue {
  role: FeatureRole;
  label: string;
  /** The role's bottom line: who they are and what the platform gives them. */
  bottomLine: string;
  /** Who can open the pages in this section. */
  access: string;
  areas: readonly FeatureArea[];
}

export const STATUS_LABEL: Record<FeatureStatus, string> = {
  live: "Live",
  partial: "Partial",
  unavailable: "Unavailable",
};

export const CATALOGUE_BOTTOM_LINE =
  "One multi-store platform lets a shop sell online, run its day-to-day operations and be managed centrally, with each store's branding, delivery rules and offers coming from its own settings. Four roles use it: customers buy, staff fulfil and maintain the catalogue, store admins configure and measure the store, and platform admins run the platform.";

export const CUSTOMER: RoleCatalogue = {
  role: "customer",
  label: "Customer",
  bottomLine:
    "Shoppers find products quickly, check out as a guest or with an account, and come back for repeat orders.",
  access: "Anyone. Account features need a sign-in.",
  areas: [
    {
      id: "discover",
      label: "Discover",
      features: [
        {
          name: "Department and category browsing",
          what: "Lets shoppers browse the store by department and category product grids, so they can find what they want without searching.",
          value: "Shorter path from landing page to basket.",
          demo: "Open a department, then a category, and add a product from the grid.",
          route: "/categories",
          status: "live",
        },
        {
          name: "Product pages and quick view",
          what: "Shows a product's details, ratings and reviews with add-to-cart, plus a quick-view modal from listings.",
          value: "Shoppers decide on the spot, and reviews build trust.",
          demo: "Open a product, read the reviews, and add it to the basket.",
          route: null,
          status: "live",
        },
        {
          name: "Search with suggestions",
          what: "Finds products as the shopper types, with filters and suggestions drawn from the store's own search dictionary.",
          value:
            "Shoppers who search are closer to buying; the dictionary catches the words they actually use.",
          demo: "Start typing a product, pick a suggestion, then narrow the results with a filter.",
          route: "/search",
          status: "live",
        },
        {
          name: "Value bundles",
          what: "Presents multi-product deals that add all their items to the basket as ordinary lines.",
          value: "Raises basket size with offers the store controls.",
          demo: "Open a bundle and add it; show the lines it adds to the basket.",
          route: "/bundles",
          status: "live",
        },
        {
          name: "Multi-buy tier pricing",
          what: "Applies quantity-based prices (for example, a lower price per item at higher quantities) on product cards and in the cart.",
          value: "Encourages larger purchases without discount codes.",
          demo: "Raise a quantity in the cart and watch the unit price change.",
          route: null,
          status: "live",
        },
        {
          name: "Offers page",
          what: "Shows the store's active campaigns and offer products grouped by department, with a link to its community channel.",
          value: "One place to promote current deals.",
          demo: "Open Offers and point out the grouping by department.",
          route: "/whatsapp-offers",
          status: "partial",
          note: "Shows content only when an admin has created active campaigns. Chat-based re-ordering is not built (#695, needs Meta approval).",
        },
        {
          name: "Quick shop",
          what: "A shortcut page to the repeat-shopping tools; sign-in-only destinations send guests to log in.",
          value: "Faster repeat purchases.",
          demo: "Open Quick shop and show the shortcuts.",
          route: "/quick-shop",
          status: "live",
        },
      ],
    },
    {
      id: "buy",
      label: "Buy",
      features: [
        {
          name: "Cart for guests and accounts",
          what: "Keeps a basket for guests and signed-in customers, and merges a guest basket into the account at sign-in.",
          value: "No lost baskets when a shopper decides to sign in.",
          demo: "Add items as a guest, sign in, and show they are still there.",
          route: "/cart",
          status: "live",
        },
        {
          name: "Delivery area check",
          what: "Checks a postcode against the store's delivery areas and prices delivery, so shoppers outside the area are told before they pay.",
          value: "Fewer undeliverable orders.",
          demo: "Enter a postcode inside the area, then one outside it.",
          route: null,
          status: "live",
        },
        {
          name: "Checkout with slots and discount codes",
          what: "Takes an order as a guest or customer, with a delivery or collection slot and a discount code preview.",
          value: "A single, short path to a paid order that matches the store's capacity.",
          demo: "Go through checkout, pick a slot and apply a code.",
          route: "/checkout",
          status: "live",
        },
        {
          name: "Address lookup",
          what: "Suggests addresses from a postcode at checkout.",
          value: "Fewer typing errors and failed deliveries.",
          demo: "Type a postcode and pick an address.",
          route: null,
          status: "live",
        },
        {
          name: "Favourites",
          what: "Lets signed-in customers save products they like.",
          value: "Makes repeat buying easier.",
          demo: "Heart a product and open Favourites.",
          route: "/account/favourites",
          status: "live",
        },
        {
          name: "Shopping lists and Shop your list",
          what: "Saves lists, and turns a pasted list into matched products in the cart.",
          value: "Saves time on a weekly shop.",
          demo: "Paste a short list and review the matches.",
          route: "/shop-your-list",
          status: "live",
          note: "Matching quality on long or unusual lists has not been formally verified.",
        },
        {
          name: "Regulars and reorder",
          what: "Surfaces what a customer buys often and lets them reorder a past order in one step.",
          value: "Repeat orders in seconds.",
          demo: "Open a past order and reorder it.",
          route: "/account/regulars",
          status: "live",
        },
        {
          name: "Card payment",
          what: "Takes payment through a hosted card page, with signed payment notifications and a job that reconciles missed ones.",
          value: "Secure payment without the store handling card details.",
          demo: "Complete a test payment and show the order confirmed.",
          route: "/checkout",
          status: "partial",
          note: "Test keys only until live payment keys are set (#113, owner-gated). Do not take real money.",
        },
        {
          name: "Order emails",
          what: "Sends order confirmation and status emails.",
          value: "Customers know what is happening to their order.",
          demo: "Not for demonstration yet.",
          route: null,
          status: "unavailable",
          note: "No verified sending domain, so real inboxes do not receive these (#104, owner-gated).",
        },
      ],
    },
    {
      id: "account",
      label: "Account and loyalty",
      features: [
        {
          name: "Register, sign in and reset password",
          what: "Creates and secures customer accounts with email and password, and optionally Google sign-in.",
          value: "Accounts unlock history, lists and rewards.",
          demo: "Sign in as the demo customer.",
          route: "/login",
          status: "partial",
          note: "Google sign-in appears only where it is configured. Password-reset emails depend on the sending domain (#104).",
        },
        {
          name: "Account and order history",
          what: "Shows a customer's profile, past orders and each order's status.",
          value: "Fewer 'where is my order?' contacts.",
          demo: "Open an order and read its status.",
          route: "/account/orders",
          status: "live",
        },
        {
          name: "Guest order lookup",
          what: "Lets a guest look up an order without an account, with rate limiting.",
          value: "Support for customers who never register.",
          demo: "Look up an order with its number.",
          route: "/orders/lookup",
          status: "live",
        },
        {
          name: "Loyalty rewards",
          what: "Earns and redeems points with tiers and expiry, shown in the account and a rewards panel.",
          value: "Rewards repeat custom.",
          demo: "Open Loyalty and show points and tier.",
          route: "/account/loyalty",
          status: "partial",
          note: "A per-store switch, off by default. A store without it enabled does not show it.",
        },
        {
          name: "Reviews and ratings",
          what: "Lets signed-in customers rate and review products; ratings are summarised on the product page.",
          value: "Social proof that helps other shoppers decide.",
          demo: "Open a product and show its reviews and ratings.",
          route: null,
          status: "live",
        },
        {
          name: "Data rights",
          what: "Lets customers download or erase their own data.",
          value: "UK GDPR compliance without staff effort.",
          demo: "Open Your data and show the export.",
          route: "/account/data",
          status: "live",
        },
      ],
    },
    {
      id: "help",
      label: "Help and trust",
      features: [
        {
          name: "Help Centre",
          what: "Answers common delivery, payment and loyalty questions, including the store's own FAQs.",
          value: "Fewer repeat support questions.",
          demo: "Open Help and find a delivery answer.",
          route: "/help",
          status: "live",
        },
        {
          name: "Guided help assistant",
          what: "A scripted topic-and-answer helper that hands the shopper to the store's chat number. It is not an AI chatbot.",
          value: "Deflects simple questions and routes the rest.",
          demo: "Open the help button and pick a topic.",
          route: null,
          status: "partial",
          note: "A per-store switch, off by default, and it also needs a contact number.",
        },
        {
          name: "Floating contact button",
          what: "Gives site-wide links to phone, email or chat.",
          value: "Contact is always one tap away.",
          demo: "Tap the contact button on any page.",
          route: null,
          status: "live",
        },
        {
          name: "Feedback form",
          what: "Collects customers' feedback about the shop for moderation.",
          value: "Direct customer insight.",
          demo: "Submit feedback, then approve it in the panel.",
          route: "/feedback",
          status: "live",
        },
        {
          name: "Legal and credits pages",
          what: "Publishes privacy, terms and third-party credits pages.",
          value: "Meets legal and licensing duties.",
          demo: "Open the footer links.",
          route: "/privacy",
          status: "live",
        },
        {
          name: "Refunds, save for later and abandoned-cart emails",
          what: "Not built: there is no refund flow, no save-for-later and no abandoned-cart email.",
          value: "Do not promise these in a demo.",
          demo: "If asked, say they are not available yet.",
          route: null,
          status: "unavailable",
          note: "Refunds are undecided; the other two are deferred.",
        },
      ],
    },
  ],
};

export const ADMIN: RoleCatalogue = {
  role: "admin",
  label: "Admin",
  bottomLine:
    "Store admins configure how the store trades, who works in it, and how well it is doing.",
  access: "Store admins (and platform admins). Staff are refused.",
  areas: [
    {
      id: "money",
      label: "Orders, payments and fulfilment",
      features: [
        {
          name: "Fulfilment slots",
          what: "Sets delivery and collection time slots and express collection hours.",
          value: "Matches promised times to real capacity.",
          demo: "Add a slot window and show it at checkout.",
          route: "/staff/fulfilment",
          status: "partial",
          note: "Customers see no slots until windows are created and the store's slot switches are on.",
        },
        {
          name: "Payment issues",
          what: "Lists refused payment events and the orders they may have left stranded, with recovery actions.",
          value: "Catches revenue that would otherwise be lost silently.",
          demo: "Open a refused payment and show the recovery actions.",
          route: "/staff/payments",
          status: "live",
        },
      ],
    },
    {
      id: "offers",
      label: "Offers and loyalty",
      features: [
        {
          name: "Discount codes",
          what: "Creates, reviews and deactivates the store's discount codes.",
          value: "Targeted promotions without developer help.",
          demo: "Create a code and apply it at checkout.",
          route: "/staff/discounts",
          status: "live",
        },
        {
          name: "Loyalty settings",
          what: "Sets earn and redemption rates, tier thresholds and multipliers.",
          value: "Controls the cost and appeal of the rewards scheme.",
          demo: "Change a rate and show the customer view.",
          route: "/staff/loyalty",
          status: "live",
        },
      ],
    },
    {
      id: "customers",
      label: "Customers and content",
      features: [
        {
          name: "Customers",
          what: "Lists customers who have paid an order, with what they spend and their loyalty standing.",
          value: "Shows who the best customers are.",
          demo: "Open Customers and read spend and loyalty standing.",
          route: "/staff/customers",
          status: "live",
        },
        {
          name: "Help Centre answers",
          what: "Edits the store's own answers shown on the Help Centre.",
          value: "Answers the questions this store's shoppers really ask.",
          demo: "Edit an answer and show it on Help.",
          route: "/staff/faqs",
          status: "live",
        },
        {
          name: "Help assistant settings",
          what: "Turns the storefront help assistant on or off and shows what shoppers ask it.",
          value: "Controls support routing and reveals common questions.",
          demo: "Switch the assistant on and show the topics.",
          route: "/staff/assistant",
          status: "partial",
          note: "Off by default per store; also needs a contact number.",
        },
      ],
    },
    {
      id: "setup",
      label: "Store setup",
      features: [
        {
          name: "Import stock file",
          what: "Uploads a stock sheet, previews it, and imports products and categories.",
          value: "Loads a catalogue in bulk instead of one product at a time.",
          demo: "Upload a sample sheet and review the preview.",
          route: "/staff/products/import",
          status: "live",
        },
        {
          name: "Onboarding readiness",
          what: "Audits the store's configuration and reports how ready it is to go live.",
          value: "A checklist that prevents a half-configured launch.",
          demo: "Open the dashboard and point out an item that needs attention.",
          route: "/staff/onboarding",
          status: "live",
        },
        {
          name: "Storefront branding",
          what: "Sets the store's branding, logo and shopfront configuration, including the marketing-consent setting.",
          value: "Each store looks and speaks as itself.",
          demo: "Change the logo and show the storefront header.",
          route: "/staff/storefront",
          status: "live",
        },
        {
          name: "Delivery areas",
          what: "Defines the postcode areas the store delivers to, and shows recent refusals.",
          value: "Delivery promises match what the store can serve.",
          demo: "Add an area and test a postcode at checkout.",
          route: "/staff/delivery-areas",
          status: "live",
        },
        {
          name: "Team and access",
          what: "Grants Staff or Admin access to registered customers by email and lists the team.",
          value: "Staff get only the access they need.",
          demo: "Show the team table and the role form.",
          route: "/staff/team",
          status: "live",
          note: "A store admin cannot grant the Store Admin role; only a platform admin can.",
        },
        {
          name: "AI allowance",
          what: "Shows how much of today's AI budget the store has used, by feature.",
          value: "No surprise when an AI button stops working.",
          demo: "Open the page and read today's remaining budget.",
          route: "/staff/ai-usage",
          status: "live",
        },
      ],
    },
    {
      id: "insight",
      label: "Insights",
      features: [
        {
          name: "Reports",
          what: "Shows sales, order counts, average basket, catalogue health and loyalty liability.",
          value: "A quick read on how the store is trading.",
          demo: "Open Reports and drill from a status row into its orders.",
          route: "/staff/reports",
          status: "live",
        },
        {
          name: "Refunds in the panel",
          what: "Not built: there is no in-panel refund action.",
          value: "Do not promise it in a demo.",
          demo: "If asked, say refunds are not available yet.",
          route: null,
          status: "unavailable",
          note: "Refunds are an undecided product question.",
        },
      ],
    },
  ],
};

export const STAFF: RoleCatalogue = {
  role: "staff",
  label: "Staff",
  bottomLine:
    "Staff run the day: they work the order queue and keep the catalogue, stock and promotions correct.",
  access: "Staff and store admins.",
  areas: [
    {
      id: "orders",
      label: "Orders",
      features: [
        {
          name: "Orders",
          what: "Works the order queue, searches past orders, and opens one for its full history.",
          value: "Orders are picked, packed and delivered without missed steps.",
          demo: "Open an order and move it to its next status.",
          route: "/staff/orders",
          status: "live",
        },
      ],
    },
    {
      id: "catalogue",
      label: "Catalogue and stock",
      features: [
        {
          name: "Products",
          what: "Adds products, corrects prices, and sets what is in stock.",
          value: "The shop front stays accurate.",
          demo: "Edit a price and show it on the storefront.",
          route: "/staff/products",
          status: "live",
        },
        {
          name: "Live inventory and availability",
          what: "Adjusts stock levels and switches product availability quickly.",
          value: "Stops sales of what is not on the shelf.",
          demo: "Mark a product unavailable and refresh its page.",
          route: "/staff/inventory",
          status: "partial",
          note: "Shows the first 100 products only; there is no pagination yet. Use search.",
        },
        {
          name: "Categories",
          what: "Manages the departments shoppers browse by and their order.",
          value: "Shoppers find things where they expect them.",
          demo: "Reorder a department and show the menu change.",
          route: "/staff/categories",
          status: "live",
        },
        {
          name: "Brands",
          what: "Manages the brands shoppers can filter by and which products carry them.",
          value: "Better filtering and discovery.",
          demo: "Add a brand to a product and filter by it.",
          route: "/staff/brands",
          status: "live",
        },
        {
          name: "Product filters",
          what: "Defines the store's own filters, such as colour or size, and their values.",
          value: "Filters that fit what this store sells.",
          demo: "Add a filter value and use it in a category.",
          route: "/staff/attributes",
          status: "live",
        },
        {
          name: "Net content review",
          what: "Lets staff check AI-suggested pack sizes before they reach a product.",
          value: "Faster data entry with a human check.",
          demo: "Open a suggested pack size and review it.",
          route: "/staff/net-content",
          status: "live",
        },
        {
          name: "Visual asset gallery",
          what: "Browses, previews and manages category images and interface icons.",
          value: "A consistent look across the catalogue.",
          demo: "Open the gallery and preview an image.",
          route: "/staff/icons",
          status: "live",
        },
      ],
    },
    {
      id: "offers",
      label: "Offers",
      features: [
        {
          name: "Promotions",
          what: "Runs department campaigns and the banners that front them.",
          value: "Features deals where shoppers browse.",
          demo: "Open a campaign and show its live state.",
          route: "/staff/promotions",
          status: "live",
        },
        {
          name: "Bundles",
          what: "Creates multi-product deals with their pricing and contents.",
          value: "Larger baskets from curated deals.",
          demo: "Create a bundle and view it on the storefront.",
          route: "/staff/bundles",
          status: "live",
        },
      ],
    },
    {
      id: "customers",
      label: "Customers and search",
      features: [
        {
          name: "Customer feedback",
          what: "Moderates customer feedback; nothing appears on the storefront until it is approved.",
          value: "Protects the store's reputation.",
          demo: "Approve a piece of feedback and show it appear.",
          route: "/staff/feedback",
          status: "live",
        },
        {
          name: "Search dictionary",
          what: "Maps the words shoppers use to the store's product names.",
          value: "Searches that used to find nothing now sell.",
          demo: "Add a synonym and run the search.",
          route: "/staff/search-synonyms",
          status: "live",
        },
        {
          name: "Runbook",
          what: "Gives staff an in-panel guide to store procedures.",
          value: "Consistent operations and quicker onboarding.",
          demo: "Open the runbook and search for a procedure.",
          route: "/staff/runbook",
          status: "live",
        },
      ],
    },
  ],
};

export const PLATFORM: RoleCatalogue = {
  role: "platform",
  label: "Platform Admin",
  bottomLine:
    "Platform admins run the shared platform across all stores. Today these pages are read-only dashboards; there is no in-app tooling to create or change a store.",
  access: "Platform admins only.",
  areas: [
    {
      id: "overview",
      label: "Platform oversight",
      features: [
        {
          name: "Platform overview",
          what: "Shows platform-wide figures and links to every operator control.",
          value: "One starting point for running the platform.",
          demo: "Open the overview and follow a card.",
          route: "/staff/platform",
          status: "live",
        },
        {
          name: "Vendors and tenants",
          what: "Lists the registered stores with their addresses and an onboarding link.",
          value: "See every store on the platform at a glance.",
          demo: "Open the list and visit a store's address.",
          route: "/staff/platform/vendors",
          status: "partial",
          note: "Read-only: no create, edit or suspend.",
        },
        {
          name: "Onboarding roll-up",
          what: "Shows each store's launch-readiness status in one table.",
          value: "Spots which stores need attention before launch.",
          demo: "Point out a store that needs attention.",
          route: "/staff/platform/onboarding",
          status: "live",
        },
        {
          name: "Domain registry",
          what: "Lists every host and custom domain the platform serves.",
          value: "Clear view of where each store is reachable.",
          demo: "Open the registry and follow a link.",
          route: "/staff/platform/domains",
          status: "partial",
          note: "Read-only: domains cannot be added or verified here yet (#1329).",
        },
      ],
    },
    {
      id: "operations",
      label: "Operations and health",
      features: [
        {
          name: "System health",
          what: "Checks database connectivity, latency and environment diagnostics.",
          value: "Confirms the platform is up before a demo.",
          demo: "Open it and read the database check.",
          route: "/staff/platform/health",
          status: "live",
        },
        {
          name: "Error events",
          what: "Lists recent server-side errors across all stores.",
          value: "Problems are seen before customers report them.",
          demo: "Open the list and read the latest event.",
          route: "/staff/errors",
          status: "live",
        },
        {
          name: "Platform settings",
          what: "Shows the status of routing, email sender, payments and shared infrastructure.",
          value: "A clear picture of what is configured.",
          demo: "Open it and point out any planned item.",
          route: "/staff/platform/settings",
          status: "partial",
          note: "Status display only; nothing is editable, and some items are marked planned.",
        },
      ],
    },
    {
      id: "business",
      label: "Business",
      features: [
        {
          name: "Costs, pricing and business model",
          what: "Shows running costs with live usage, competitor and proposed pricing, profitability and a what-if tool, with a printable view and CSV export.",
          value: "Informs pricing with real cost data.",
          demo: "Refresh the review, change a what-if, and export the CSV.",
          route: "/staff/platform/costs",
          status: "live",
          note: "No realised revenue yet: the platform has not traded, so profit figures are projections.",
        },
        {
          name: "Feature Catalogue",
          what: "This page: a structured reference of what the platform does for each role.",
          value: "A shared script for demonstrations.",
          demo: "Use it to choose what to show next.",
          route: "/staff/feature-catalogue",
          status: "live",
        },
        {
          name: "Multi-store foundation",
          what: "Serves each store from its own host with its own branding, roles and data separation.",
          value: "One platform serves many stores.",
          demo: "Show two stores' hosts side by side.",
          route: null,
          status: "live",
        },
        {
          name: "Store creation, billing and domain tooling",
          what: "Not built: no create, suspend or edit store, no self-serve sign-up, no per-store billing and no domain verification.",
          value: "Do not promise these in a demo.",
          demo: "If asked, say these are planned.",
          route: null,
          status: "unavailable",
          note: "Planned under the platform move and launch work (P12).",
        },
      ],
    },
  ],
};

export const CATALOGUE: readonly RoleCatalogue[] = [CUSTOMER, ADMIN, STAFF, PLATFORM];

/** Every feature of a role, flattened. */
export function featuresOf(role: RoleCatalogue): Feature[] {
  return role.areas.flatMap((area) => [...area.features]);
}

/** Counts by status across a set of roles. */
export function statusCounts(roles: readonly RoleCatalogue[]): Record<FeatureStatus, number> {
  const counts: Record<FeatureStatus, number> = { live: 0, partial: 0, unavailable: 0 };
  for (const role of roles) for (const f of featuresOf(role)) counts[f.status] += 1;
  return counts;
}
