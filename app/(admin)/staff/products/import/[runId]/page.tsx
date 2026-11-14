import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { requireVendorRole } from "@/lib/auth-rbac";
import { getStockImportRun } from "@/lib/stock-import-service";
import { PageContainer } from "@/components/layout/PageContainer";
import { PanelRefusal } from "@/components/staff/PanelRefusal";
import { StockImportReview } from "@/components/staff/stock-import/StockImportReview";
import type { ReviewProduct, ReviewRun } from "@/components/staff/stock-import/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Review stock import",
};

type Summary = {
  id: string;
  name: string;
  plu: string | null;
  basePrice: number;
  netContentAmount: number | null;
  netContentUnit: string | null;
  isActive: boolean;
} | null;

const UNIT: Record<string, string> = {
  GRAM: "g",
  KILOGRAM: "kg",
  MILLILITRE: "ml",
  LITRE: "L",
  EACH: " each",
};

function product(p: Summary): ReviewProduct | null {
  if (!p) return null;
  return {
    id: p.id,
    name: p.name,
    plu: p.plu,
    basePrice: p.basePrice,
    size:
      p.netContentAmount !== null && p.netContentUnit
        ? `${p.netContentAmount}${UNIT[p.netContentUnit] ?? ""}`
        : null,
    isActive: p.isActive,
  };
}

/** #1578 R4 — review, decide, apply and undo one uploaded file. */
export default async function StaffProductImportRunPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    return (
      <PanelRefusal
        title="Store admins only"
        message="You're signed in, but your account doesn't have permission to import this store's stock files."
      />
    );
  }
  const { runId } = await params;
  const run = await getStockImportRun(auth.vendorId, runId);
  if (!run) notFound();

  const view: ReviewRun = {
    id: run.id,
    fileName: run.fileName,
    status: run.status,
    createdAt: run.createdAt.toISOString(),
    createdBy: run.createdBy?.name ?? null,
    settingsChanged: run.settingsChanged,
    lines: run.lines.map((l) => ({
      id: l.id,
      key: l.key,
      rowNumber: l.rowNumber,
      sourceText: l.sourceText,
      suggestion: l.suggestion,
      decision: l.decision,
      confidence: l.confidence,
      reason: l.reason,
      cleanName: l.cleanName,
      brandName: l.brandName,
      categoryName: l.categoryName,
      sizeLabel: l.sizeLabel,
      pricePence: l.pricePence,
      target: product(l.targetProduct),
      runnerUp: product(l.runnerUpProduct),
      resultProduct: product(l.resultProduct),
      otherSizes: l.otherSizes,
      changeSummary: l.changeSummary,
      tillWords: l.tillWords,
      issues: l.issues,
      note: l.note,
      question: l.question,
      decidedBy: l.decidedBy?.name ?? null,
      decidedAt: l.decidedAt?.toISOString() ?? null,
      status: l.status,
      result: l.result,
      resultDetail: l.resultDetail,
    })),
  };

  return (
    <PageContainer width="standard">
      <div className="mb-6">
        <Link href="/staff/products/import" className="text-xs font-medium text-action">
          ← All imports
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-primary">{run.fileName}</h1>
        <p className="text-sm text-primary-muted">
          Checked{" "}
          {run.createdAt.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
          {run.createdBy ? ` by ${run.createdBy.name}` : ""} · {run.lines.length} lines
        </p>
      </div>
      <StockImportReview run={view} />
    </PageContainer>
  );
}
