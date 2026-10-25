import type { ProductRestriction } from "@/lib/cart-rules";
import type { RejectedRow } from "@/lib/catalogue-import/plan";
import type { DepartmentOutcome, DriftEntry } from "@/lib/catalogue-import/apply";

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
