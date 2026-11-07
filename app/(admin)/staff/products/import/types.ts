import type { ProductRestriction } from "@/lib/cart-rules";
import type { RejectedRow } from "@/lib/catalogue-import/plan";
import type { DepartmentOutcome, DriftEntry } from "@/lib/catalogue-import/apply";

export interface EnrichedPreviewProduct {
  sourceRow: number;
  plu: string;
  name: string;
  category: string;
  brand: string | null;
  brandSource?: string | null;
  netContent: string | null;
  unitPriceLabel: string | null;
  pricePence: number;
  restriction: ProductRestriction | null;
  warnings?: string[];
}

export interface PreviewSummary {
  fileName: string;
  totalGridRows: number;
  dataRowCount: number;
  headerSourceRow: number;
  candidateAdditions: number;
  candidateCategories: number;
  matchingExistingProducts: number;
  rejectedCount: number;
  rejectedRows: RejectedRow[];
  unreviewedDepartments: { department: string; rows: number }[];
  restrictionCounts: Record<ProductRestriction, number>;
  enrichedBrandsCount: number;
  enrichedNetContentCount: number;
  reviewWarningsCount: number;
  reviewWarnings: {
    sourceRow: number;
    plu: string;
    name: string;
    type: string;
    message: string;
  }[];
  previewProducts: EnrichedPreviewProduct[];
}

export type ValidateActionResponse =
  | {
      ok: true;
      preview: PreviewSummary;
    }
  | {
      ok: false;
      error: string;
    };

export interface ApplyReceiptSummary {
  categoriesCreated: number;
  productsCreated: number;
  productsUpdated: number;
  existingUnchanged: number;
  restrictionTightened: number;
  failedDepartments: number;
  departments: DepartmentOutcome[];
  drift: DriftEntry[];
}

export type ApplyActionResponse =
  | {
      ok: true;
      receipt: ApplyReceiptSummary;
    }
  | {
      ok: false;
      error: string;
    };
