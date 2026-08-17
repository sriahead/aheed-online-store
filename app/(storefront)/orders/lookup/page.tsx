import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { getCurrentVendorId } from "@/lib/tenant";
import { getGuestOrderLookupService, type GuestLookupOrder } from "@/lib/repositories/orders";
import { checkOrderLookupRateLimit } from "@/lib/repositories/order-lookup-rate-limit";
import { formatPrice } from "@/components/product/format-price";
import { Package, Truck, CheckCircle2, Search, MapPin, AlertCircle } from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Track Your Order — Guest Order Lookup",
  description: "Track your grocery order status using your Order Number and Email.",
};

interface LookupPageProps {
  searchParams: Promise<{
    orderNumber?: string;
    email?: string;
  }>;
}

/**
 * Cloudflare always sets CF-Connecting-IP on a real request (staging/production
 * are never plain HTTP behind a proxy that would strip it — same reasoning
 * lib/auth-origin.ts's docstring gives for x-forwarded-proto). x-forwarded-for
 * is the fallback for `next dev`/local tooling, where lookups aren't internet-
 * facing and coarse-grained throttling is acceptable.
 */
async function resolveClientIp(): Promise<string> {
  const h = await headers();
  return h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export default async function OrderLookupPage({ searchParams }: LookupPageProps) {
  const { orderNumber = "", email = "" } = await searchParams;

  let orderResult: GuestLookupOrder | null = null;
  let errorMsg = null;
  let rateLimited = false;

  if (orderNumber.trim()) {
    const vendorId = await getCurrentVendorId();

    const { allowed } = await checkOrderLookupRateLimit(vendorId, await resolveClientIp());
    if (!allowed) {
      rateLimited = true;
    } else if (!email.trim()) {
      // requirements.md §4.1: Order Number + Email is the credential pair —
      // email is not an optional refinement, it IS half the credential.
      errorMsg = "Enter both your order number and the email used to place the order.";
    } else {
      const found = await getGuestOrderLookupService().find(orderNumber.trim(), email.trim());
      if (found) {
        orderResult = found;
      } else {
        errorMsg = "Order number and email combination did not match our records.";
      }
    }
  }

  const steps = [
    { status: "CONFIRMED", label: "Order Confirmed", desc: "Store staff preparing items" },
    {
      status: "OUT_FOR_DELIVERY",
      label: "Out for Delivery",
      desc: "En route with local delivery team",
    },
    { status: "DELIVERED", label: "Delivered", desc: "Handed safely to customer" },
  ];

  const getStepIndex = (status: string) => {
    if (status === "CONFIRMED" || status === "PENDING_PAYMENT") return 0;
    if (status === "OUT_FOR_DELIVERY") return 1;
    if (status === "DELIVERED") return 2;
    return 0;
  };

  const currentIndex = orderResult ? getStepIndex(orderResult.status) : 0;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 text-primary">
      <nav className="mb-6 text-xs text-primary/60">
        <Link href="/" className="hover:underline">
          Home
        </Link>{" "}
        / <span className="text-primary font-medium">Order Lookup</span>
      </nav>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="p-6 bg-primary text-white">
          <span className="text-[10px] uppercase tracking-wider font-bold text-emerald-200">
            Aheed Store Delivery Pipeline
          </span>
          <h1 className="text-xl font-extrabold mt-0.5">Track Your Order</h1>
        </div>

        {/* Lookup Form */}
        <form method="GET" className="p-6 border-b border-slate-100 bg-slate-50/50 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="orderNumber" className="block text-xs font-bold text-slate-700 mb-1">
                Order Number
              </label>
              <input
                type="text"
                id="orderNumber"
                name="orderNumber"
                defaultValue={orderNumber}
                placeholder="e.g. AHE-20260813-K4M2XQ"
                required
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label htmlFor="email" className="block text-xs font-bold text-slate-700 mb-1">
                Email Address
              </label>
              <input
                type="email"
                id="email"
                name="email"
                defaultValue={email}
                placeholder="shopper@example.com"
                required
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-primary/90 transition-colors"
          >
            <Search className="w-4 h-4" />
            <span>Track Order</span>
          </button>
        </form>

        {/* Rate-Limited State */}
        {rateLimited && (
          <div className="p-6 bg-red-50 text-red-900 flex items-start gap-3 border-b border-red-100">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div className="text-xs">
              <p className="font-bold">Too many attempts</p>
              <p className="mt-0.5 text-red-700">
                Too many lookup attempts. Please wait a minute and try again.
              </p>
            </div>
          </div>
        )}

        {/* Error State */}
        {errorMsg && (
          <div className="p-6 bg-red-50 text-red-900 flex items-start gap-3 border-b border-red-100">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div className="text-xs">
              <p className="font-bold">Lookup Failed</p>
              <p className="mt-0.5 text-red-700">{errorMsg}</p>
            </div>
          </div>
        )}

        {/* Order Details Result */}
        {orderResult && (
          <div className="p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <p className="text-xs text-slate-500 font-medium">Order Number</p>
                <p className="text-base font-extrabold text-primary">#{orderResult.orderNumber}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-500 font-medium">Status</p>
                <span className="inline-block rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-primary mt-0.5">
                  {orderResult.status}
                </span>
              </div>
            </div>

            {/* 3-Step Pipeline Visualizer */}
            <div className="relative space-y-6 pl-4 border-l-2 border-slate-200 my-4">
              {steps.map((step, idx) => {
                const isCompleted = idx <= currentIndex;
                const isCurrent = idx === currentIndex;

                return (
                  <div key={step.status} className="relative flex items-start gap-4">
                    <div
                      className={`absolute -left-[25px] top-0.5 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                        isCompleted
                          ? "bg-primary text-white ring-4 ring-emerald-100 shadow-sm"
                          : "bg-slate-200 text-slate-500"
                      }`}
                    >
                      {isCompleted ? <CheckCircle2 className="w-3.5 h-3.5" /> : idx + 1}
                    </div>

                    <div className="pl-2">
                      <h4
                        className={`font-bold text-sm leading-tight ${
                          isCurrent
                            ? "text-primary"
                            : isCompleted
                              ? "text-slate-800"
                              : "text-slate-400"
                        }`}
                      >
                        {step.label}
                      </h4>
                      <p className="text-xs text-slate-500 mt-0.5">{step.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Items Summary */}
            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-3">
              <h3 className="text-xs font-bold text-slate-900">Items Ordered</h3>
              <div className="space-y-2">
                {orderResult.items.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between text-xs text-slate-700"
                  >
                    <span>
                      {item.quantity} × {item.productName}
                    </span>
                    <span className="font-semibold text-slate-900">
                      {formatPrice(item.lineTotalPence)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="pt-2 border-t border-slate-200 flex justify-between font-bold text-sm text-slate-900">
                <span>Total Amount:</span>
                <span className="text-primary">{formatPrice(orderResult.totalPence)}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
