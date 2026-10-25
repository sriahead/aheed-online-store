"use client";

import { useState } from "react";
import Link from "next/link";
import type {
  VendorReadinessReport,
  ReadinessCategory,
  ReadinessSetting,
  SettingStatus,
  SettingOwner,
} from "@/lib/vendor-readiness-service";

interface OnboardingReadinessDashboardProps {
  report: VendorReadinessReport;
}

export function OnboardingReadinessDashboard({ report }: OnboardingReadinessDashboardProps) {
  const [filter, setFilter] = useState<"ALL" | "MISSING" | "CONFIGURED" | "PLANNED">("ALL");
  const [roleFilter, setRoleFilter] = useState<"ALL" | SettingOwner>("ALL");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

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
              {getReadinessBadge()}
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
          </div>

          <div className="flex flex-col items-start gap-4 lg:items-end">
            <div className="text-left lg:text-right">
              <div className="text-3xl font-black text-slate-900">{report.overallCompletion}%</div>
              <div className="text-xs font-medium text-slate-500">
                {report.configuredRequiredSettings} of {report.totalRequiredSettings} required items
                complete
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
        </div>

        {/* Overall Progress Bar */}
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
          <p className="text-xs text-slate-500">
            Benchmarked against canonical operational profile:{" "}
            <span className="font-semibold text-slate-700">
              https://aheedfoodcentre.nocaped.com/
            </span>
          </p>
        </div>

        {/* Filter Navigation */}
        <div className="mt-8 space-y-4 border-t border-slate-100 pt-6">
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
      </div>

      {/* Categories Summary Grid */}
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
                            <span className="font-medium text-slate-900">{item.currentValue}</span>
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
    </div>
  );
}
