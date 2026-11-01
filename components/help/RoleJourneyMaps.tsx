"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons/Icon";
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
    goal: "Fulfill incoming customer orders, manage live stock availability, handle item substitutions, moderate feedback, and follow operational runbooks.",
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
          "Instantly toggle items out of stock or update shelf availability during rushes.",
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
          "Review overview metrics and pending order counts on /staff.",
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
      "Out-of-stock items toggled off immediately",
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
    goal: "Autonomously manage store branding, delivery postcodes, catalogue imports, pricing, discounts, loyalty programmes, team staff, and FAQs.",
    startingPoint: "Admin Portal at /staff/storefront and /staff/onboarding.",
    features: [
      {
        name: "Storefront & Branding",
        route: "/staff/storefront",
        description:
          "Upload logos, set square marks, customize brand color palettes, and manage themes.",
      },
      {
        name: "Delivery Areas & Postcodes",
        route: "/staff/delivery-areas",
        description: "Define delivery outcodes, minimum basket amounts, and delivery fees.",
      },
      {
        name: "Fulfilment Schedules",
        route: "/staff/fulfilment",
        description: "Set daily delivery windows, collection slots, and order lead times.",
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
        title: "Build Catalogue & Set Pricing",
        route: "/staff/products",
        bluf: "Populate inventory through manual entry or bulk spreadsheet upload.",
        actions: [
          "Import stock list spreadsheet at /staff/products/import.",
          "Review AI net-content suggestions in /staff/net-content.",
          "Set product pricing in pence and assign categories.",
        ],
        keyOutcome: "Comprehensive catalogue ready for shopper browsing.",
      },
      {
        number: 5,
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
      "Products imported with valid prices and categories",
      "At least one staff member invited",
      "FAQs authored for customer self-service",
    ],
  },
  "platform-admin": {
    id: "platform-admin",
    title: "Platform Admin",
    badge: "Platform Governance",
    icon: "shield-alert",
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
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                isSelected
                  ? "bg-white text-primary shadow-sm font-semibold border border-black/10"
                  : "text-black/70 hover:text-black hover:bg-black/5"
              }`}
            >
              <Icon name={item.icon} className="w-4 h-4" />
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
              <span className="p-2.5 rounded-xl bg-primary/10 text-primary">
                <Icon name={journey.icon} className="w-6 h-6" />
              </span>
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

                  <div className="text-xs font-medium text-action-tint bg-action-tint/10 px-3 py-1.5 rounded-lg inline-block">
                    <strong>Outcome:</strong> {step.keyOutcome}
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
