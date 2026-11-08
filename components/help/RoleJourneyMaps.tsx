"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons/Icon";
import { IconMedallion } from "@/components/icons/IconMedallion";
import type { Icon3DName } from "@/components/icons/Icon3D";
import type { IconName } from "@/components/icons/registry";

export type UserJourneyRole = "customer" | "staff" | "store-admin" | "platform-admin";

interface StepItem {
  number: number;
  title: string;
  route?: string;
  bluf: string;
  actions: string[];
  keyOutcome: string;
}

interface RoleJourneyData {
  id: UserJourneyRole;
  title: string;
  badge: string;
  icon: IconName;
  icon3d?: Icon3DName;
  tint?: "action" | "accent" | "danger";
  goal: string;
  startingPoint: string;
  features: { name: string; route?: string; description: string }[];
  steps: StepItem[];
  checklist: string[];
}

const JOURNEYS: Record<UserJourneyRole, RoleJourneyData> = {
  customer: {
    id: "customer",
    title: "Customer (Shopper)",
    badge: "Public & Shopper",
    icon: "shopping-bag",
    icon3d: "view-shopper",
    tint: "action",
    goal: "Discover products, verify local delivery eligibility, build baskets, apply discounts and promotions, checkout securely, and track orders.",
    startingPoint: "Store homepage (e.g. aheed.merqify.com or srimart.merqify.com).",
    features: [
      {
        name: "Catalogue & Search",
        route: "/categories",
        description:
          "Browse departments, filter by dietary requirements (Halal, Organic), and search live stock.",
      },
      {
        name: "Shopping Lists",
        route: "/shop-your-list",
        description: "Paste a shopping list or ingredients recipe for instant multi-item matching.",
      },
      {
        name: "Cart & Delivery Tracker",
        route: "/cart",
        description:
          "Real-time delivery progress bar, minimum order checks, and free delivery thresholds.",
      },
      {
        name: "Checkout",
        route: "/checkout",
        description:
          "Express guest checkout or account sign-in with saved addresses and Stripe payment.",
      },
      {
        name: "Order Tracking & Lookup",
        route: "/orders/lookup",
        description:
          "Instant status updates from Confirmed -> Preparing -> Out for Delivery -> Delivered.",
      },
    ],
    steps: [
      {
        number: 1,
        title: "Discover Storefront & Trust Badges",
        route: "/",
        bluf: "Arrive on the store homepage with tenant branding, operating hours, and active promotions.",
        actions: [
          "Check local delivery postcode eligibility via the top navigation bar.",
          "Browse department highlights, active banners, and customer feedback.",
        ],
        keyOutcome: "Confirmed delivery eligibility and established store credibility.",
      },
      {
        number: 2,
        title: "Explore Catalogue & Select Items",
        route: "/categories",
        bluf: "Find groceries using department navigation, search filters, or the quick Shop-Your-List tool.",
        actions: [
          "Filter by brand, category, or dietary preferences.",
          "Inspect pack sizes, net content, pricing, and allergen details.",
          "Click Add to Cart (stock limits and inventory availability are verified live).",
        ],
        keyOutcome: "Desired items added to basket with live stock assurance.",
      },
      {
        number: 3,
        title: "Review Cart & Fulfilment Thresholds",
        route: "/cart",
        bluf: "Inspect cart items and progress towards free delivery or minimum order requirements.",
        actions: [
          "Adjust quantities or remove items using quantity steppers.",
          "Review delivery fee and see how much more is needed for free delivery.",
        ],
        keyOutcome: "Basket meets minimum order requirements and customer is ready to proceed.",
      },
      {
        number: 4,
        title: "Checkout & Slot Selection",
        route: "/checkout",
        bluf: "Enter delivery details, pick a delivery window or collection slot, and apply promo codes.",
        actions: [
          "Select your preferred fulfilment option (such as home delivery).",
          "Select preferred delivery date and time slot.",
          "Enter optional discount code or coupon.",
          "Pay securely via Stripe card elements.",
        ],
        keyOutcome: "Payment authorized and order confirmed with immediate reference number.",
      },
      {
        number: 5,
        title: "Order Tracking & Customer Support",
        route: "/orders/lookup",
        bluf: "Track live order fulfillment status and communicate with the store if questions arise.",
        actions: [
          "View live order lifecycle (Confirmed -> Preparing -> Out for Delivery -> Delivered).",
          "Contact store via WhatsApp support for quick queries or substitutions.",
          "Share feedback on /feedback after receiving groceries.",
        ],
        keyOutcome: "Order delivered successfully and shopper leaves verified feedback.",
      },
    ],
    checklist: [
      "Delivery postcode entered and verified",
      "Cart meets store minimum order value",
      "Fulfilment time slot selected",
      "Payment processed securely via Stripe",
      "Order confirmation email and tracking link received",
    ],
  },
  staff: {
    id: "staff",
    title: "Store Staff",
    badge: "Store Operations",
    icon: "clipboard-list",
    icon3d: "view-staff",
    tint: "action",
    goal: "Fulfill incoming customer orders, manage live stock availability and shelf counts, assign brands, handle item substitutions, moderate feedback, and follow operational runbooks.",
    startingPoint: "Staff Portal at /staff/orders.",
    features: [
      {
        name: "Live Orders Queue",
        route: "/staff/orders",
        description:
          "Work pending orders, print packing lists, and transition order fulfillment states.",
      },
      {
        name: "Live Inventory & Quick Toggles",
        route: "/staff/inventory",
        description:
          "Instantly toggle items out of stock, adjust quantities (+1/-1), or verify stock tracking modes.",
      },
      {
        name: "Product & Brand Lookup",
        route: "/staff/products",
        description:
          "Filter products by brand, department, and stock status to answer customer queries accurately.",
      },
      {
        name: "Customer Feedback Moderation",
        route: "/staff/feedback",
        description:
          "Review customer ratings and approve legitimate reviews for storefront publication.",
      },
      {
        name: "Operational Runbook",
        route: "/staff/runbook",
        description:
          "Standard operating procedures (SOPs) for packing, delivery disputes, and customer care.",
      },
    ],
    steps: [
      {
        number: 1,
        title: "Sign In & Access Operations Hub",
        route: "/staff",
        bluf: "Sign in with staff credentials and switch to Staff View in the top navigation.",
        actions: [
          "Authenticate via /login with store staff account.",
          "Review overview metrics, active stock alerts, and pending order counts on /staff.",
        ],
        keyOutcome: "Authenticated in the store staff environment.",
      },
      {
        number: 2,
        title: "Process Orders in the Queue",
        route: "/staff/orders",
        bluf: "Review incoming orders, verify delivery time slots, and begin order preparation.",
        actions: [
          "Open orders in CONFIRMED status.",
          "Advance status to PREPARING to signal packing has commenced.",
          "Pick items according to order packing list.",
        ],
        keyOutcome: "Items picked and packed accurately.",
      },
      {
        number: 3,
        title: "Manage Stock & Out-of-Stock Items",
        route: "/staff/inventory",
        bluf: "Adjust availability if an item is depleted from store shelves.",
        actions: [
          "Toggle product stock off with one click in /staff/inventory to hide or disable on storefront.",
          "Use quick increment/decrement buttons (+1, -1, +10) to update shelf counts.",
          "Contact customer via WhatsApp if a substitution is required.",
        ],
        keyOutcome: "Inventory remains accurate and prevents unfillable orders.",
      },
      {
        number: 4,
        title: "Dispatch & Complete Orders",
        route: "/staff/orders",
        bluf: "Hand over parcel to driver or prepare for customer collection.",
        actions: [
          "Advance status to OUT_FOR_DELIVERY when driver departs or courier collects.",
          "Mark DELIVERED upon completed delivery or customer collection.",
        ],
        keyOutcome: "Order cycle complete; customer notified by email.",
      },
      {
        number: 5,
        title: "Moderate Customer Feedback",
        route: "/staff/feedback",
        bluf: "Check new customer reviews submitted through the storefront.",
        actions: [
          "Review rating, comments, and verified purchase status.",
          "Click Approve to publish on the homepage or Reject for spam/abuse.",
        ],
        keyOutcome: "Authentic feedback made visible to shoppers.",
      },
    ],
    checklist: [
      "Pending orders checked every 15 minutes",
      "Out-of-stock items toggled off immediately in /staff/inventory",
      "Orders marked Out for Delivery upon dispatch",
      "Customer reviews moderated daily",
      "Runbook SOPs consulted for non-standard situations",
    ],
  },
  "store-admin": {
    id: "store-admin",
    title: "Store Admin",
    badge: "Store Management",
    icon: "store",
    icon3d: "view-admin",
    tint: "action",
    goal: "Autonomously manage store branding, delivery postcodes, catalogue creation, brand management, visual asset curation, pricing, discounts, loyalty programmes, team staff, and publication controls.",
    startingPoint: "Admin Portal at /staff/storefront and /staff/onboarding.",
    features: [
      {
        name: "Storefront & Branding",
        route: "/staff/storefront",
        description:
          "Upload logos, set square marks, customize brand color palettes, and manage themes.",
      },
      {
        name: "Brand Management",
        route: "/staff/brands",
        description:
          "Create brands, upload authentic logos or URLs, inspect linked products in quick-view drawer, and unassign products.",
      },
      {
        name: "Visual Asset Gallery",
        route: "/staff/icons",
        description:
          "Curate and generate commercial 3D icons, realistic category photos, and brand logos with live activation and medallion previews.",
      },
      {
        name: "Delivery Areas & Postcodes",
        route: "/staff/delivery-areas",
        description: "Define delivery outcodes, minimum basket amounts, and delivery fees.",
      },
      {
        name: "Catalogue & Stock Management",
        route: "/staff/products",
        description:
          "Create and edit listings, set pence pricing, configure stock modes (Tracked, Untracked, Infinite), and control storefront visibility.",
      },
      {
        name: "Product & Stock Import",
        route: "/staff/products/import",
        description:
          "Upload Excel spreadsheets to bulk-create or update categories, barcodes, and prices.",
      },
      {
        name: "Offers & Loyalty",
        route: "/staff/loyalty",
        description:
          "Configure points earn/redeem rates, customer discount coupons, and referral bonuses.",
      },
      {
        name: "Team & Staff Access",
        route: "/staff/team",
        description: "Invite operational staff and grant Staff or Admin permissions.",
      },
    ],
    steps: [
      {
        number: 1,
        title: "Complete Onboarding Readiness",
        route: "/staff/onboarding",
        bluf: "Review launch readiness scores across Profile, Hours, Delivery, Slots, Products, and Team.",
        actions: [
          "Track completion percentage toward 100% launch readiness.",
          "Consult the interactive Staff Onboarding Guide tab for step-by-step procedures.",
          "Address any missing configuration sections highlighted in red.",
        ],
        keyOutcome: "Store achieves full launch readiness.",
      },
      {
        number: 2,
        title: "Brand Storefront & Manage Themes",
        route: "/staff/storefront",
        bluf: "Customise your storefront look and feel with logos, marks, and colour palettes.",
        actions: [
          "Upload square mark (used for favicon, mobile app icons, and social sharing).",
          "Select a global preset theme or customize and save custom themes.",
          "Delete unwanted saved custom themes with the Delete Theme button.",
          "Save operating hours and holiday closures.",
        ],
        keyOutcome: "Distinctive, branded storefront with accurate operating hours.",
      },
      {
        number: 3,
        title: "Configure Delivery Zones & Fulfilment",
        route: "/staff/delivery-areas",
        bluf: "Establish where you deliver and set fee structures.",
        actions: [
          "Add delivery postcode outcodes (e.g., E1, E2, E3).",
          "Set minimum order values and free delivery thresholds.",
          "Configure standard delivery and click-and-collect time slots in /staff/fulfilment.",
        ],
        keyOutcome: "Postcode validation active at checkout.",
      },
      {
        number: 4,
        title: "Create & Manage Brands",
        route: "/staff/brands",
        bluf: "Organise manufacturer and producer brands to power storefront facet filters.",
        actions: [
          "Click Add Brand to create new brand entities with name and auto-generated slug.",
          "Upload authentic brand logo files via the upload button or enter image URLs.",
          "Click Quick View on any brand row to open the side drawer inspecting all linked products.",
          "Unassign individual products from a brand directly inside the quick-view drawer if needed.",
        ],
        keyOutcome:
          "Brand ledger populated with authentic logos and verified product associations.",
      },
      {
        number: 5,
        title: "Curate Category Icons & Visual Asset Gallery",
        route: "/staff/icons",
        bluf: "Generate, review, and activate photorealistic category photos and commercial 3D icons.",
        actions: [
          "Navigate to /staff/icons to review visual assets across Departments, Navigation, Trust, and Brands.",
          "Generate new candidate imagery for any category (commercial studio photo or 3D icon style).",
          "Click Activate on a candidate to make it the live primary icon (updates Category.imageKey instantly).",
          "Click Deactivate to revert to the default static icon without deleting the generated candidate.",
          "Inspect any asset in the large modal with tint controls (action, accent, danger) and live surface mapping.",
        ],
        keyOutcome:
          "Polished, brand-aligned visual assets active across all storefront navigation surfaces.",
      },
      {
        number: 6,
        title: "Build Catalogue, Assign Brands & Set Stock Modes",
        route: "/staff/products",
        bluf: "Create or edit product listings with mandatory fields, attributes, and inventory tracking.",
        actions: [
          "Create products on /staff/products/new or edit existing rows on /staff/products/[id].",
          "Ensure required fields are complete: Product Name, Category, and Base Price in integer pence.",
          "Assign Brand from the searchable brand selector and specify net content (e.g. 500 g, 1 L).",
          "Configure Stock Tracking: select TRACKED (with numerical quantity and low-stock threshold), UNTRACKED (always in stock), or INFINITE.",
          "Configure dietary badges (Halal, Fresh, Organic, Vegetarian, Gluten-Free, HMC Certification).",
        ],
        keyOutcome:
          "Accurate product records with complete metadata, brand links, and stock rules.",
      },
      {
        number: 7,
        title: "Control Visibility & Storefront Publication Rules",
        route: "/staff/products",
        bluf: "Verify dependencies and publish items to the customer-facing store.",
        actions: [
          "Toggle the Active switch to ON (isActive: true) to make an item eligible for storefront publication.",
          "Verify publication criteria: valid price > 0, parent category is active, and stock count is verified.",
          "Stock Safeguard Check: The system strictly prevents activating a product while stock mode is UNKNOWN (enter verified count first).",
          "In-Stock vs Out-of-Stock: In TRACKED mode, items with quantity > 0 show 'Add to Cart'; items with quantity = 0 remain browsable with an 'Out of Stock' badge.",
        ],
        keyOutcome: "Verified products published live and purchasable by shoppers.",
      },
      {
        number: 8,
        title: "Promotions, Loyalty & Team Management",
        route: "/staff/loyalty",
        bluf: "Engage shoppers with loyalty rewards, discount codes, and invite staff members.",
        actions: [
          "Create seasonal discount codes in /staff/discounts.",
          "Enable loyalty points with custom earn/redeem values.",
          "Invite team members at /staff/team with appropriate STAFF or ADMIN roles.",
          "Author store FAQs at /staff/faqs to assist shoppers.",
        ],
        keyOutcome: "Promotional tools and operational team fully operational.",
      },
    ],
    checklist: [
      "Store profile, logo, and square mark uploaded",
      "Operating hours and holiday exceptions saved",
      "Delivery postcode prefixes and minimums defined",
      "Brands created with authentic logos in /staff/brands",
      "Category icons curated and activated in /staff/icons",
      "Products created with verified stock counts and active parent categories",
      "Stock safeguards checked (no products left in UNKNOWN stock mode)",
      "At least one staff member invited",
      "FAQs authored for customer self-service",
    ],
  },
  "platform-admin": {
    id: "platform-admin",
    title: "Platform Admin",
    badge: "Platform Governance",
    icon: "shield-alert",
    icon3d: "secure-checkout",
    tint: "accent",
    goal: "Oversee multi-tenant infrastructure, verify tenant onboarding readiness, manage domain routing, monitor Neon PostgreSQL latency, review error logs, and govern AI budgets.",
    startingPoint: "Platform Administration hub at /staff/platform/vendors.",
    features: [
      {
        name: "Tenant Directory",
        route: "/staff/platform/vendors",
        description:
          "List all store tenants, status (Active/Suspended), catalogue counts, and canonical hosts.",
      },
      {
        name: "Multi-Tenant Onboarding Rollup",
        route: "/staff/platform/onboarding",
        description: "Rollup of launch readiness across all platform tenants.",
      },
      {
        name: "Domain Registry & Routing",
        route: "/staff/platform/domains",
        description: "Verify hostname mappings in VendorDomain and Cloudflare Worker routes.",
      },
      {
        name: "System Health & Database Latency",
        route: "/staff/platform/health",
        description: "Live Neon PostgreSQL round-trip latency and worker isolate health.",
      },
      {
        name: "Error Event Log",
        route: "/staff/errors",
        description: "Inspect the 50 most recent server-side exceptions and status digests.",
      },
      {
        name: "Global AI Usage & Budgets",
        route: "/staff/ai-usage",
        description: "Monitor daily Cloudflare Workers AI neuron consumption across all stores.",
      },
    ],
    steps: [
      {
        number: 1,
        title: "Authenticate with Platform Admin Credentials",
        route: "/login",
        bluf: "Log in with an account having global Role.ADMIN.",
        actions: [
          "Authenticate via Better Auth using global platform administrator credentials.",
          "Access /staff to view the platform-level navigation cards.",
        ],
        keyOutcome: "Elevated platform governance session established.",
      },
      {
        number: 2,
        title: "Audit Tenant Directory & Readiness",
        route: "/staff/platform/vendors",
        bluf: "Monitor store tenants and review onboarding completion across the platform.",
        actions: [
          "Check tenant directory for active stores and their catalogue counts.",
          "Inspect multi-tenant onboarding rollup at /staff/platform/onboarding.",
        ],
        keyOutcome: "All tenants tracked for operational health and compliance.",
      },
      {
        number: 3,
        title: "Manage Host Domains & Cloudflare Routing",
        route: "/staff/platform/domains",
        bluf: "Verify tenant custom domains and Cloudflare edge routes.",
        actions: [
          "Confirm domain mapping exists in VendorDomain table.",
          "Ensure host pattern is covered by wrangler.toml edge routes.",
        ],
        keyOutcome: "Host traffic accurately dispatched to correct tenant database records.",
      },
      {
        number: 4,
        title: "Inspect Latency & Error Logs",
        route: "/staff/platform/health",
        bluf: "Monitor Neon Postgres pooled connection latency and server error logs.",
        actions: [
          "Check live database round-trip times in /staff/platform/health.",
          "Review server-side error digest and stack traces in /staff/errors.",
        ],
        keyOutcome: "Platform performance verified and zero unhandled exceptions.",
      },
      {
        number: 5,
        title: "Govern AI Allowance & Resource Limits",
        route: "/staff/ai-usage",
        bluf: "Control daily Workers AI quotas for product title normalisation and assistant features.",
        actions: [
          "Audit daily neuron consumption against the 1,000,000 threshold.",
          "Switch between Cloudflare Workers AI free and paid tiers as needed.",
        ],
        keyOutcome: "Infrastructure costs maintained within budget limits.",
      },
    ],
    checklist: [
      "Platform admin role verified across all tenant domains",
      "Canonical domains mapped in VendorDomain and Cloudflare DNS",
      "Neon Postgres pooled connections responsive (<350ms warm)",
      "Zero unhandled exceptions in /staff/errors",
      "Global AI neuron consumption within daily budget",
    ],
  },
};

export function RoleJourneyMaps({ detectedRole = "customer" }: { detectedRole?: UserJourneyRole }) {
  const [activeRole, setActiveRole] = useState<UserJourneyRole>(detectedRole);
  const journey = JOURNEYS[activeRole];

  return (
    <section aria-labelledby="journey-maps-heading" className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 id="journey-maps-heading" className="text-2xl font-bold text-black/90">
            Platform User Journey Maps
          </h2>
          <p className="text-sm text-black/60 mt-1">
            End-to-end guidance, steps, features, and checklists for every user role on the
            platform.
          </p>
        </div>
      </div>

      {/* Role Switcher Tabs */}
      <div
        role="tablist"
        aria-label="User Roles"
        className="flex flex-wrap gap-2 p-1.5 bg-black/5 rounded-2xl border border-black/10"
      >
        {(Object.keys(JOURNEYS) as UserJourneyRole[]).map((roleKey) => {
          const item = JOURNEYS[roleKey];
          const isSelected = activeRole === roleKey;
          const isDetected = detectedRole === roleKey;

          return (
            <button
              key={roleKey}
              role="tab"
              aria-selected={isSelected}
              onClick={() => setActiveRole(roleKey)}
              className={`flex items-center gap-2.5 px-3.5 py-2 rounded-xl font-medium text-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                isSelected
                  ? "bg-white text-primary shadow-sm font-semibold border border-black/10"
                  : "text-black/70 hover:text-black hover:bg-black/5"
              }`}
            >
              <IconMedallion
                {...(item.icon3d ? { icon3d: item.icon3d } : { icon: item.icon })}
                size={22}
                tint={item.tint ?? "action"}
                decorative
              />
              <span>{item.title}</span>
              {isDetected && (
                <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                  Your Role
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Journey Detail Card */}
      <div className="bg-white rounded-2xl border border-black/10 p-6 sm:p-8 space-y-8 shadow-sm">
        {/* Header & Goal */}
        <div className="border-b border-black/10 pb-6 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <IconMedallion
                {...(journey.icon3d ? { icon3d: journey.icon3d } : { icon: journey.icon })}
                size={44}
                tint={journey.tint ?? "action"}
                decorative
              />
              <div>
                <h3 className="text-xl font-bold text-black/90">{journey.title} Journey</h3>
                <span className="text-xs font-semibold text-black/60">{journey.badge}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 pt-2">
            <div className="p-4 rounded-xl bg-surface-muted border border-black/5 text-sm space-y-1">
              <span className="font-bold text-black/80 block">Goal:</span>
              <p className="text-black/70">{journey.goal}</p>
            </div>
            <div className="p-4 rounded-xl bg-surface-muted border border-black/5 text-sm space-y-1">
              <span className="font-bold text-black/80 block">Starting Point:</span>
              <p className="text-black/70">{journey.startingPoint}</p>
            </div>
          </div>
        </div>

        {/* Available Features Grid */}
        <div className="space-y-4">
          <h4 className="text-base font-bold text-black/90 flex items-center gap-2">
            <Icon name="boxes" className="w-4 h-4 text-primary" />
            Key Features &amp; Actions for this Role
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {journey.features.map((feat) => (
              <div
                key={feat.name}
                className="p-4 rounded-xl border border-black/10 bg-surface-muted hover:border-primary/30 transition-colors space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-sm text-black/90">{feat.name}</span>
                  {feat.route && (
                    <Link
                      href={feat.route}
                      className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-0.5"
                    >
                      <span>Open</span>
                      <Icon name="external-link" className="w-3 h-3" />
                    </Link>
                  )}
                </div>
                <p className="text-xs text-black/60 leading-relaxed">{feat.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Step-by-Step Flow */}
        <div className="space-y-4">
          <h4 className="text-base font-bold text-black/90 flex items-center gap-2">
            <Icon name="clipboard-list" className="w-4 h-4 text-primary" />
            Step-by-Step Walkthrough
          </h4>

          <div className="space-y-4">
            {journey.steps.map((step) => (
              <div
                key={step.number}
                className="p-5 rounded-xl border border-black/10 bg-white shadow-xs space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center justify-center w-7 h-7 rounded-full bg-primary text-white text-xs font-bold shrink-0">
                      {step.number}
                    </span>
                    <div>
                      <h5 className="font-bold text-sm text-black/90">{step.title}</h5>
                      <p className="text-xs text-black/60 mt-0.5">{step.bluf}</p>
                    </div>
                  </div>
                  {step.route && (
                    <Link
                      href={step.route}
                      className="text-xs font-semibold px-2.5 py-1 rounded-lg border border-black/10 bg-black/5 hover:bg-black/10 text-primary transition-colors shrink-0"
                    >
                      {step.route}
                    </Link>
                  )}
                </div>

                <div className="pl-10 space-y-2">
                  <ul className="list-disc list-inside text-xs text-black/70 space-y-1">
                    {step.actions.map((act, i) => (
                      <li key={i}>{act}</li>
                    ))}
                  </ul>

                  <div className="text-xs font-semibold text-action bg-action-tint border border-action/20 px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5">
                    <span className="font-bold">Outcome:</span>
                    <span>{step.keyOutcome}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Role Checklist */}
        <div className="p-5 rounded-xl border border-primary/20 bg-primary/5 space-y-3">
          <h4 className="text-sm font-bold text-primary flex items-center gap-2">
            <Icon name="badge-check" className="w-4 h-4" />
            {journey.title} Checklist
          </h4>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-black/80">
            {journey.checklist.map((item, idx) => (
              <li key={idx} className="flex items-center gap-2">
                <span className="w-4 h-4 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[10px] font-bold">
                  ✓
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
