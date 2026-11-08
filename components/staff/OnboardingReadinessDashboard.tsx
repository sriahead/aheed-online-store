"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons/Icon";
import type {
  VendorReadinessReport,
  ReadinessCategory,
  ReadinessSetting,
  SettingStatus,
  SettingOwner,
} from "@/lib/vendor-readiness-service";

interface OnboardingReadinessDashboardProps {
  report: VendorReadinessReport;
  isPlatformAdmin?: boolean;
  canViewChecklist?: boolean;
}

export function OnboardingReadinessDashboard({
  report,
  isPlatformAdmin = false,
  canViewChecklist = false,
}: OnboardingReadinessDashboardProps) {
  const [dashboardTab, setDashboardTab] = useState<"guide" | "audit">("guide");
  const [filter, setFilter] = useState<"ALL" | "MISSING" | "CONFIGURED" | "PLANNED">("ALL");
  const [roleFilter, setRoleFilter] = useState<"ALL" | SettingOwner>("ALL");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const hasAdminAccess = Boolean(isPlatformAdmin || canViewChecklist);
  const isAuditView = Boolean(hasAdminAccess && dashboardTab === "audit");

  const getStatusBadge = (status: SettingStatus) => {
    switch (status) {
      case "CONFIGURED":
        return (
          <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
            ✓ Configured
          </span>
        );
      case "MISSING":
        return (
          <span className="inline-flex items-center rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-800">
            ⚠ Missing
          </span>
        );
      case "OPTIONAL":
        return (
          <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
            Optional
          </span>
        );
      case "PLANNED":
        return (
          <span className="inline-flex items-center rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-semibold text-sky-800">
            ✦ Planned Feature
          </span>
        );
    }
  };

  const getReadinessBadge = () => {
    switch (report.readinessStatus) {
      case "LAUNCH_READY":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-4 py-1.5 text-sm font-bold text-white shadow-sm">
            <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
            Ready for Storefront Launch
          </span>
        );
      case "NEEDS_ATTENTION":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500 px-4 py-1.5 text-sm font-bold text-white shadow-sm">
            <span className="h-2 w-2 rounded-full bg-white" />
            Needs Attention Before Launch
          </span>
        );
      case "IN_PROGRESS":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-600 px-4 py-1.5 text-sm font-bold text-white shadow-sm">
            <span className="h-2 w-2 rounded-full bg-white" />
            Onboarding In Progress
          </span>
        );
    }
  };

  const filterItem = (item: ReadinessSetting) => {
    if (roleFilter !== "ALL" && item.owner !== roleFilter) return false;
    if (filter === "ALL") return true;
    if (filter === "MISSING") return item.status === "MISSING";
    if (filter === "CONFIGURED") return item.status === "CONFIGURED";
    if (filter === "PLANNED") return item.status === "PLANNED";
    return true;
  };

  return (
    <div className="space-y-8 pb-12">
      {/* Overview Card */}
      <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
                {report.vendorName}
              </h1>
              {hasAdminAccess && getReadinessBadge()}
            </div>
            <p className="text-sm text-slate-600">
              Host:{" "}
              <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-800">
                {report.canonicalHost || "Unmapped"}
              </code>{" "}
              • Vendor ID:{" "}
              <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-800">
                {report.vendorSlug}
              </code>
            </p>
            <div className="pt-1">
              <Link
                href="/staff/runbook?doc=getting-started-onboarding"
                className="inline-flex items-center gap-1 text-xs font-semibold text-action hover:underline"
              >
                View Store Onboarding &amp; Launch Readiness Guide →
              </Link>
            </div>
          </div>

          {hasAdminAccess ? (
            <div className="flex flex-col items-start gap-4 lg:items-end">
              <div className="text-left lg:text-right">
                <div className="text-3xl font-black text-slate-900">
                  {report.overallCompletion}%
                </div>
                <div className="text-xs font-medium text-slate-500">
                  {report.configuredRequiredSettings} of {report.totalRequiredSettings} required
                  items complete
                </div>
              </div>

              {/* Responsibility Breakdown */}
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-2.5 py-1 font-semibold text-blue-800 border border-blue-200">
                  Store Operator: {report.vendorConfiguredCount} / {report.vendorRequiredCount}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-purple-50 px-2.5 py-1 font-semibold text-purple-800 border border-purple-200">
                  Platform Admin: {report.platformConfiguredCount} / {report.platformRequiredCount}
                </span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-start gap-2 lg:items-end">
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700">
                Staff Onboarding &amp; Operations Guide
              </span>
            </div>
          )}
        </div>

        {/* Overall Progress Bar (Store Admin & Platform Admin; benchmark link removed) */}
        {hasAdminAccess && (
          <div className="mt-6 space-y-2">
            <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full transition-all duration-500 ${
                  report.overallCompletion === 100
                    ? "bg-emerald-600"
                    : report.overallCompletion >= 60
                      ? "bg-amber-500"
                      : "bg-rose-600"
                }`}
                style={{ width: `${report.overallCompletion}%` }}
              />
            </div>
          </div>
        )}

        {/* Navigation Tabs: Staff Guide vs Launch Audit */}
        {hasAdminAccess && (
          <div className="mt-8 border-t border-slate-100 pt-6">
            <div className="flex flex-wrap gap-2 border-b border-black/10 pb-px">
              <button
                type="button"
                onClick={() => setDashboardTab("guide")}
                className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-bold transition ${
                  dashboardTab === "guide"
                    ? "border-action text-action bg-action/5 rounded-t-xl"
                    : "border-transparent text-primary-muted hover:text-primary"
                }`}
              >
                <Icon name="book-open" className="h-4 w-4" />
                Step-by-Step Staff Onboarding Guide
              </button>
              <button
                type="button"
                onClick={() => setDashboardTab("audit")}
                className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-bold transition ${
                  dashboardTab === "audit"
                    ? "border-action text-action bg-action/5 rounded-t-xl"
                    : "border-transparent text-primary-muted hover:text-primary"
                }`}
              >
                <Icon name="list-checks" className="h-4 w-4" />
                Launch Readiness Checklist ({report.overallCompletion}%)
              </button>
            </div>
          </div>
        )}

        {isAuditView ? (
          /* Filter Navigation */
          <div className="mt-6 space-y-4 border-t border-slate-100 pt-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              {/* Status Filter */}
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setFilter("ALL")}
                  className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition ${
                    filter === "ALL"
                      ? "bg-slate-900 text-white shadow-sm"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  All Items
                </button>
                <button
                  onClick={() => setFilter("MISSING")}
                  className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition ${
                    filter === "MISSING"
                      ? "bg-rose-700 text-white shadow-sm"
                      : "bg-rose-50 text-rose-700 hover:bg-rose-100"
                  }`}
                >
                  Action Required (Missing)
                </button>
                <button
                  onClick={() => setFilter("CONFIGURED")}
                  className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition ${
                    filter === "CONFIGURED"
                      ? "bg-emerald-700 text-white shadow-sm"
                      : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                  }`}
                >
                  Configured
                </button>
                <button
                  onClick={() => setFilter("PLANNED")}
                  className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition ${
                    filter === "PLANNED"
                      ? "bg-sky-700 text-white shadow-sm"
                      : "bg-sky-50 text-sky-700 hover:bg-sky-100"
                  }`}
                >
                  Planned / External
                </button>
              </div>

              {/* Role / Ownership Filter */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-semibold text-slate-500 mr-1">Owner:</span>
                <button
                  onClick={() => setRoleFilter("ALL")}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                    roleFilter === "ALL"
                      ? "bg-slate-800 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  All Roles
                </button>
                <button
                  onClick={() => setRoleFilter("VENDOR_OPERATOR")}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                    roleFilter === "VENDOR_OPERATOR"
                      ? "bg-blue-600 text-white"
                      : "bg-blue-50 text-blue-700 hover:bg-blue-100"
                  }`}
                >
                  Store Operator
                </button>
                <button
                  onClick={() => setRoleFilter("PLATFORM_ADMIN")}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                    roleFilter === "PLATFORM_ADMIN"
                      ? "bg-purple-600 text-white"
                      : "bg-purple-50 text-purple-700 hover:bg-purple-100"
                  }`}
                >
                  Platform Admin
                </button>
              </div>
            </div>

            <div className="text-xs text-slate-400">
              Last evaluated: {new Date(report.evaluatedAt).toLocaleTimeString()}
            </div>
          </div>
        ) : (
          <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
            <span>Operational onboarding guide for store staff and managers</span>
            {hasAdminAccess && (
              <button
                onClick={() => setDashboardTab("audit")}
                className="font-semibold text-action hover:underline"
              >
                Switch to Audit Checklist ({report.overallCompletion}% complete) →
              </button>
            )}
          </div>
        )}
      </div>

      {!isAuditView ? (
        /* Sequential Staff Onboarding Guide */
        <div className="space-y-6">
          {/* Step 1 */}
          <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">
                  1
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    System Access &amp; Staff Navigation
                  </h3>
                  <p className="text-xs text-slate-500">
                    How to authenticate and navigate between storefront and operations
                  </p>
                </div>
              </div>
              <Link
                href="/staff"
                className="inline-flex items-center gap-1 rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-200 transition"
              >
                Open Operations Hub →
              </Link>
            </div>
            <div className="mt-4 space-y-2 text-sm text-slate-600">
              <p>
                • <strong>Sign In:</strong> Log in at{" "}
                <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">/login</code> using your
                registered store staff credentials.
              </p>
              <p>
                • <strong>Role Switcher:</strong> Use the interactive role switcher in the top
                navigation bar to toggle between <strong>Shopper View</strong> (customer storefront)
                and <strong>Staff View</strong> (back-office management).
              </p>
              <p>
                • <strong>Operations Hub:</strong> Open{" "}
                <Link href="/staff" className="text-action underline">
                  /staff
                </Link>{" "}
                for daily metrics, quick order counters, and catalog shortcuts.
              </p>
            </div>
          </div>

          {/* Step 2 */}
          <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">
                  2
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Storefront Profile, Operating Hours &amp; Fulfilment
                  </h3>
                  <p className="text-xs text-slate-500">
                    Configure trading details, delivery postcodes, and collection lead times
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Link
                  href="/staff/storefront"
                  className="inline-flex items-center gap-1 rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-200 transition"
                >
                  Storefront →
                </Link>
                <Link
                  href="/staff/delivery-areas"
                  className="inline-flex items-center gap-1 rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-200 transition"
                >
                  Delivery Areas →
                </Link>
              </div>
            </div>
            <div className="mt-4 space-y-2 text-sm text-slate-600">
              <p>
                • <strong>Profile &amp; Hours:</strong> In{" "}
                <Link href="/staff/storefront" className="text-action underline">
                  /staff/storefront
                </Link>
                , verify trading name, customer care WhatsApp number, weekly hours, and holiday
                overrides.
              </p>
              <p>
                • <strong>Delivery Postcodes:</strong> In{" "}
                <Link href="/staff/delivery-areas" className="text-action underline">
                  /staff/delivery-areas
                </Link>
                , add covered postcode outcodes (e.g. <code>MK1</code>, <code>MK2</code>). Customers
                outside these zones are prevented from placing delivery orders.
              </p>
              <p>
                • <strong>Fees &amp; Thresholds:</strong> Set standard delivery fees (e.g. £3.49),
                minimum order amounts (e.g. £15.00), and free delivery thresholds (e.g. £30.00).
              </p>
            </div>
          </div>

          {/* Step 3 */}
          <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">
                  3
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Brand Creation &amp; Management
                  </h3>
                  <p className="text-xs text-slate-500">
                    Organise brands, upload logos, and manage product associations
                  </p>
                </div>
              </div>
              <Link
                href="/staff/brands"
                className="inline-flex items-center gap-1 rounded-xl bg-action px-3.5 py-1.5 text-xs font-bold text-white shadow-sm hover:opacity-95 transition"
              >
                Open Brand Manager →
              </Link>
            </div>
            <div className="mt-4 space-y-2 text-sm text-slate-600">
              <p>
                • <strong>Why Brands Matter:</strong> Brands power the primary filter facet on
                customer search and department browsing.
              </p>
              <p>
                • <strong>Create Brands:</strong> Go to{" "}
                <Link href="/staff/brands" className="text-action underline">
                  /staff/brands
                </Link>
                , click <strong>Add Brand</strong>, and enter the manufacturer name (e.g.{" "}
                <em>TRS</em>, <em>Fudco</em>, <em>East End</em>).
              </p>
              <p>
                • <strong>Upload Logos:</strong> Click the upload button on any brand row to upload
                authentic logo artwork (<code>.png</code>, <code>.webp</code>, <code>.jpg</code>) or
                paste a direct image URL.
              </p>
              <p>
                • <strong>Product Quick-View Drawer:</strong> Click <strong>Quick View</strong> on
                any brand row to inspect all currently linked products with live prices and stock.
                If an item was linked by mistake, click <strong>Unassign</strong> inside the drawer
                to instantly unlink it.
              </p>
            </div>
          </div>

          {/* Step 4 */}
          <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">
                  4
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Category Visual Assets &amp; Icon Gallery
                  </h3>
                  <p className="text-xs text-slate-500">
                    Curate, generate, and activate department photos and 3D icons
                  </p>
                </div>
              </div>
              <Link
                href="/staff/icons"
                className="inline-flex items-center gap-1 rounded-xl bg-action px-3.5 py-1.5 text-xs font-bold text-white shadow-sm hover:opacity-95 transition"
              >
                Open Visual Asset Gallery →
              </Link>
            </div>
            <div className="mt-4 space-y-2 text-sm text-slate-600">
              <p>
                • <strong>Visual Asset Studio:</strong> In{" "}
                <Link href="/staff/icons" className="text-action underline">
                  /staff/icons
                </Link>
                , view all imagery across Departments, 3D System Slots, Flat Icons, and Brand Logos.
              </p>
              <p>
                • <strong>Generate Candidate Imagery:</strong> Select any category or system slot,
                choose your preferred style (<strong>Realistic Commercial Photo</strong> or{" "}
                <strong>3D Tactile Icon</strong>), and click <strong>Generate Asset</strong>.
              </p>
              <p>
                • <strong>Activate vs Deactivate:</strong> Click <strong>Activate</strong> on any
                candidate to make it the live primary icon (immediately updates{" "}
                <code>Category.imageKey</code> and renders across storefront navigation). Click{" "}
                <strong>Deactivate</strong> to revert to default static icons without deleting the
                artwork.
              </p>
              <p>
                • <strong>Quick View:</strong> Click any asset to preview it in a high-resolution
                320px circular medallion with theme tint selectors (Action, Accent, Danger) and
                affected storefront surfaces.
              </p>
            </div>
          </div>

          {/* Step 5 */}
          <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">
                  5
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Stock Creation, Editing &amp; Managing Attributes
                  </h3>
                  <p className="text-xs text-slate-500">
                    Configure mandatory fields, brand assignments, VAT rates, and stock modes
                  </p>
                </div>
              </div>
              <Link
                href="/staff/products"
                className="inline-flex items-center gap-1 rounded-xl bg-action px-3.5 py-1.5 text-xs font-bold text-white shadow-sm hover:opacity-95 transition"
              >
                Open Product Catalogue →
              </Link>
            </div>
            <div className="mt-4 space-y-2 text-sm text-slate-600">
              <p>
                • <strong>Product Editor:</strong> Open{" "}
                <Link href="/staff/products/new" className="text-action underline">
                  /staff/products/new
                </Link>{" "}
                or edit an existing item at{" "}
                <Link href="/staff/products" className="text-action underline">
                  /staff/products
                </Link>
                .
              </p>
              <p>
                • <strong>Mandatory Fields:</strong> Every product requires a{" "}
                <strong>Product Name</strong>, an active <strong>Category</strong>, and a positive{" "}
                <strong>Base Price</strong> (entered in integer pence, e.g. £2.99 is entered as{" "}
                <code>299</code>).
              </p>
              <p>
                • <strong>Brand Assignment:</strong> Pick the brand from the dropdown selector to
                link the product to storefront facet filters.
              </p>
              <p>
                • <strong>Net Content &amp; Unit Pricing:</strong> Enter net content amount and unit
                (e.g. <code>500 g</code>, <code>1 L</code>). The system automatically calculates
                unit pricing required by UK trade regulations.
              </p>
              <p>
                • <strong>VAT Compliance:</strong> Select <code>0%</code> (Zero-rated for domestic
                human food) or <code>20%</code> (Standard-rated for confectionery, alcohol, and
                non-food).
              </p>
              <p>
                • <strong>Stock Modes:</strong>
                <br />– <strong>TRACKED:</strong> Maintains numerical shelf inventory and decrements
                on completed orders.
                <br />– <strong>UNTRACKED:</strong> Always available to order without inventory
                limits.
                <br />– <strong>INFINITE:</strong> Guaranteed unlimited stock for staple lines.
              </p>
            </div>
          </div>

          {/* Step 6 */}
          <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">
                  6
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Controlling Visibility &amp; Storefront Publication Rules
                  </h3>
                  <p className="text-xs text-slate-500">
                    Prerequisites and safeguards that determine whether an item appears on the
                    website
                  </p>
                </div>
              </div>
              <Link
                href="/staff/inventory"
                className="inline-flex items-center gap-1 rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-200 transition"
              >
                Live Inventory Toggles →
              </Link>
            </div>
            <div className="mt-4 space-y-3 text-sm text-slate-600">
              <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 text-amber-900 text-xs">
                <strong>⚠️ Strict Stock Safeguard (#1449):</strong> The system strictly refuses to
                activate any product whose stock status is <code>UNKNOWN</code>. An operator must
                enter a verified numerical stock quantity or select an active stock mode (TRACKED or
                UNTRACKED) before the item can be published.
              </div>

              <div className="overflow-x-auto pt-2">
                <table className="w-full text-left text-xs border border-slate-200 rounded-lg overflow-hidden">
                  <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                    <tr>
                      <th className="p-2.5">Publication Criterion</th>
                      <th className="p-2.5">Required Setting</th>
                      <th className="p-2.5">Storefront Effect</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr>
                      <td className="p-2.5 font-semibold text-slate-900">Active Toggle</td>
                      <td className="p-2.5">
                        <code>isActive === true</code>
                      </td>
                      <td className="p-2.5">
                        Master publication switch. If false, item is completely hidden.
                      </td>
                    </tr>
                    <tr>
                      <td className="p-2.5 font-semibold text-slate-900">Parent Category</td>
                      <td className="p-2.5">
                        <code>category.isActive === true</code>
                      </td>
                      <td className="p-2.5">
                        If the parent department is inactive, all nested products are hidden.
                      </td>
                    </tr>
                    <tr>
                      <td className="p-2.5 font-semibold text-slate-900">Base Price</td>
                      <td className="p-2.5">
                        <code>basePrice &gt; 0</code>
                      </td>
                      <td className="p-2.5">
                        Prevents unpriced £0.00 items from appearing at checkout.
                      </td>
                    </tr>
                    <tr>
                      <td className="p-2.5 font-semibold text-slate-900">Stock Count</td>
                      <td className="p-2.5">Verified quantity &gt; 0</td>
                      <td className="p-2.5">
                        Shows active &quot;Add to Cart&quot; button. If 0 in TRACKED mode, shows
                        &quot;Out of Stock&quot; badge.
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Step 7 */}
          <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">
                  7
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Orders, Delivery &amp; Fulfilment Operations
                  </h3>
                  <p className="text-xs text-slate-500">
                    Process daily incoming orders, configure slot schedules, and monitor payment
                    health
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href="/staff/orders"
                  className="inline-flex items-center gap-1 rounded-xl bg-action px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:opacity-95 transition"
                >
                  Orders Queue →
                </Link>
                <Link
                  href="/staff/fulfilment"
                  className="inline-flex items-center gap-1 rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-200 transition"
                >
                  Fulfilment Settings →
                </Link>
              </div>
            </div>
            <div className="mt-4 space-y-2 text-sm text-slate-600">
              <p>
                • <strong>Orders Queue Workflow:</strong> Open{" "}
                <Link href="/staff/orders" className="text-action underline">
                  /staff/orders
                </Link>{" "}
                to monitor live incoming orders. Orders progress through sequential states:{" "}
                <code>PLACED</code> → <code>CONFIRMED</code> → <code>PREPARING</code> →{" "}
                <code>READY_FOR_COLLECTION</code> or <code>OUT_FOR_DELIVERY</code> →{" "}
                <code>COMPLETED</code>. Inspect picking lists, customer address details, and
                delivery instructions for each order.
              </p>
              <p>
                • <strong>Slot Booking Schedules &amp; Capacity:</strong> In{" "}
                <Link href="/staff/fulfilment" className="text-action underline">
                  /staff/fulfilment
                </Link>
                , configure recurring delivery and collection slots, specify order capacity limits
                per window to avoid bottlenecking, and define weekly schedules.
              </p>
              <p>
                • <strong>Booking Cut-Off Buffers:</strong> Enforce lead-time cut-offs (e.g. 60
                minutes) ensuring customers cannot book time slots that have already started or
                start too soon for staff to pick and pack.
              </p>
              <p>
                • <strong>Payment Issues &amp; Stranded Orders:</strong> In{" "}
                <Link href="/staff/payments" className="text-action underline">
                  /staff/payments
                </Link>
                , review payment gateway authorization logs, check for refused or pending charges,
                and assist shoppers whose payments encountered banking errors.
              </p>
            </div>
          </div>

          {/* Step 8 */}
          <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">
                  8
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Offers, Loyalty &amp; Promotions Configuration
                  </h3>
                  <p className="text-xs text-slate-500">
                    Configure voucher promo codes, department campaigns, bundle deals, and loyalty
                    tiers
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href="/staff/discounts"
                  className="inline-flex items-center gap-1 rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-200 transition"
                >
                  Discounts →
                </Link>
                <Link
                  href="/staff/promotions"
                  className="inline-flex items-center gap-1 rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-200 transition"
                >
                  Promotions →
                </Link>
                <Link
                  href="/staff/bundles"
                  className="inline-flex items-center gap-1 rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-200 transition"
                >
                  Bundles →
                </Link>
                <Link
                  href="/staff/loyalty"
                  className="inline-flex items-center gap-1 rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-200 transition"
                >
                  Loyalty →
                </Link>
              </div>
            </div>
            <div className="mt-4 space-y-2 text-sm text-slate-600">
              <p>
                • <strong>Discount Voucher Codes:</strong> In{" "}
                <Link href="/staff/discounts" className="text-action underline">
                  /staff/discounts
                </Link>
                , create promotional codes customers enter at checkout. Specify percentage off or
                fixed amount in pence, minimum basket spend, start and end dates, overall redemption
                caps, and per-shopper usage limits.
              </p>
              <p>
                • <strong>Department Campaigns &amp; Banners:</strong> In{" "}
                <Link href="/staff/promotions" className="text-action underline">
                  /staff/promotions
                </Link>
                , publish headline promotional banners across department pages highlighting seasonal
                lines, holiday discounts, and bulk purchases.
              </p>
              <p>
                • <strong>Multi-Product Meal Bundles:</strong> In{" "}
                <Link href="/staff/bundles" className="text-action underline">
                  /staff/bundles
                </Link>
                , create curated packages (e.g. dinner sets, fruit boxes, family bundles) with fixed
                bundle pricing and linked catalogue components to boost basket sizes.
              </p>
              <p>
                • <strong>Customer Loyalty Scheme:</strong> In{" "}
                <Link href="/staff/loyalty" className="text-action underline">
                  /staff/loyalty
                </Link>
                , configure the earn rate (points earned per £1 spent), redemption value (monetary
                worth of points applied at checkout), customer tier thresholds (Bronze, Silver,
                Gold), and point multipliers. Switching loyalty off cleanly hides rewards across the
                storefront while keeping accumulated shopper balances safe.
              </p>
            </div>
          </div>

          {/* Step 9 */}
          <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">
                  9
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Customers, Reviews &amp; Content Moderation
                  </h3>
                  <p className="text-xs text-slate-500">
                    Moderate customer reviews, configure search synonyms, maintain help FAQs, and
                    view customer histories
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href="/staff/feedback"
                  className="inline-flex items-center gap-1 rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-200 transition"
                >
                  Reviews Moderation →
                </Link>
                <Link
                  href="/staff/search-synonyms"
                  className="inline-flex items-center gap-1 rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-200 transition"
                >
                  Search Synonyms →
                </Link>
                <Link
                  href="/staff/faqs"
                  className="inline-flex items-center gap-1 rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-200 transition"
                >
                  Help FAQs →
                </Link>
                <Link
                  href="/staff/customers"
                  className="inline-flex items-center gap-1 rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-200 transition"
                >
                  Customers →
                </Link>
              </div>
            </div>
            <div className="mt-4 space-y-2 text-sm text-slate-600">
              <p>
                • <strong>Customer Review Moderation:</strong> In{" "}
                <Link href="/staff/feedback" className="text-action underline">
                  /staff/feedback
                </Link>
                , review shopper product ratings and text feedback. All customer reviews remain in a
                pending queue and are never visible on the public storefront until approved by store
                staff.
              </p>
              <p>
                • <strong>Shopper Search Dictionary:</strong> In{" "}
                <Link href="/staff/search-synonyms" className="text-action underline">
                  /staff/search-synonyms
                </Link>
                , add regional spellings, colloquial ingredient terms, and brand aliases to ensure
                customer searches never return empty results.
              </p>
              <p>
                • <strong>Help Centre &amp; FAQs:</strong> In{" "}
                <Link href="/staff/faqs" className="text-action underline">
                  /staff/faqs
                </Link>
                , maintain answers to customer questions regarding delivery policies, collection
                points, return policies, and store operating hours.
              </p>
              <p>
                • <strong>Customer Accounts &amp; Spend Profiles:</strong> In{" "}
                <Link href="/staff/customers" className="text-action underline">
                  /staff/customers
                </Link>
                , view registered shopper accounts, lifetime order values, order frequencies, and
                loyalty standing.
              </p>
              <p>
                • <strong>Storefront Help Assistant:</strong> In{" "}
                <Link href="/staff/assistant" className="text-action underline">
                  /staff/assistant
                </Link>
                , enable or disable the interactive storefront chat assistant and inspect common
                queries to identify content gaps.
              </p>
            </div>
          </div>
        </div>
      ) : (
        /* The Launch Readiness Categories Summary Grid & Items Checklist */
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {report.categories.map((cat) => {
              const isSelected = activeCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(isSelected ? null : cat.id)}
                  className={`flex flex-col justify-between rounded-xl border p-4 text-left transition ${
                    isSelected
                      ? "border-slate-900 bg-slate-900 text-white shadow-md"
                      : "border-black/10 bg-white hover:border-slate-300 hover:shadow-sm"
                  }`}
                >
                  <div>
                    <div
                      className={`text-xs font-bold uppercase tracking-wide ${
                        isSelected ? "text-slate-300" : "text-slate-500"
                      }`}
                    >
                      Category
                    </div>
                    <div
                      className={`mt-1 text-sm font-bold ${
                        isSelected ? "text-white" : "text-slate-900"
                      }`}
                    >
                      {cat.name}
                    </div>
                  </div>

                  <div className="mt-4 flex items-end justify-between">
                    <div>
                      <div
                        className={`text-2xl font-black ${
                          isSelected ? "text-white" : "text-slate-900"
                        }`}
                      >
                        {cat.completionPercentage}%
                      </div>
                      <div
                        className={`text-[11px] ${isSelected ? "text-slate-300" : "text-slate-500"}`}
                      >
                        {cat.configuredRequired}/{cat.totalRequired} required
                      </div>
                    </div>

                    <div
                      className={`h-2 w-16 overflow-hidden rounded-full ${
                        isSelected ? "bg-slate-800" : "bg-slate-100"
                      }`}
                    >
                      <div
                        className={`h-full ${
                          cat.completionPercentage === 100
                            ? "bg-emerald-500"
                            : cat.completionPercentage >= 60
                              ? "bg-amber-400"
                              : "bg-rose-500"
                        }`}
                        style={{ width: `${cat.completionPercentage}%` }}
                      />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Detailed Checklist Tables */}
          <div className="space-y-6">
            {report.categories
              .filter((cat) => !activeCategory || cat.id === activeCategory)
              .map((category) => {
                const filteredItems = category.items.filter(filterItem);
                if (filteredItems.length === 0 && filter !== "ALL") return null;

                return (
                  <div
                    key={category.id}
                    className="overflow-hidden rounded-2xl border border-black/10 bg-white shadow-sm"
                  >
                    <div className="border-b border-slate-100 bg-slate-50/70 p-5 sm:px-6">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <h2 className="text-base font-bold text-slate-900 sm:text-lg">
                            {category.name}
                          </h2>
                          <p className="text-xs text-slate-600">{category.description}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-semibold text-slate-700">
                            {category.configuredRequired} of {category.totalRequired} required items
                          </span>
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                              category.completionPercentage === 100
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-amber-100 text-amber-800"
                            }`}
                          >
                            {category.completionPercentage}%
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="divide-y divide-slate-100">
                      {filteredItems.map((item) => (
                        <div
                          key={item.id}
                          className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:px-6 hover:bg-slate-50/50 transition"
                        >
                          <div className="space-y-1.5 sm:max-w-md lg:max-w-xl">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-bold text-slate-900">{item.name}</span>
                              {getStatusBadge(item.status)}
                              {item.owner === "PLATFORM_ADMIN" ? (
                                <span className="rounded bg-purple-50 px-1.5 py-0.5 text-[10px] font-bold text-purple-700 uppercase border border-purple-200">
                                  Platform Admin
                                </span>
                              ) : (
                                <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-700 uppercase border border-blue-200">
                                  Store Operator
                                </span>
                              )}
                              {item.required && !item.isPlanned && (
                                <span className="rounded bg-rose-50 px-1.5 py-0.2 text-[10px] font-bold text-rose-700 uppercase">
                                  Required
                                </span>
                              )}
                            </div>

                            <div className="text-xs text-slate-600">
                              <span className="font-semibold text-slate-700">Current: </span>
                              {item.currentValue ? (
                                <span className="font-medium text-slate-900">
                                  {item.currentValue}
                                </span>
                              ) : (
                                <span className="italic text-rose-600">Not configured</span>
                              )}
                            </div>

                            <div className="text-xs text-slate-500">
                              <span className="font-semibold text-slate-600">Benchmark: </span>
                              <span className="text-slate-600">{item.referenceValue}</span>
                            </div>

                            <div className="text-[11px] text-slate-400">
                              Rule: {item.validationRule}
                            </div>
                          </div>

                          <div className="shrink-0 pt-2 sm:pt-0">
                            {item.editHref ? (
                              <Link
                                href={item.editHref}
                                className="inline-flex items-center gap-1 rounded-xl bg-slate-900 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-slate-800 transition"
                              >
                                Configure →
                              </Link>
                            ) : item.isPlanned ? (
                              <span className="text-xs font-medium text-slate-400">
                                Managed in Cloudflare / Upstream
                              </span>
                            ) : (
                              <span className="text-xs font-medium text-slate-400">
                                Automatic / System
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
          </div>
        </>
      )}
    </div>
  );
}
