/** #1578 — the review screen's serialisable view of an import run (dates as ISO strings). */

export interface ReviewProduct {
  id: string;
  name: string;
  plu: string | null;
  basePrice: number;
  size: string | null;
  isActive: boolean;
}

export interface ReviewLine {
  id: string;
  key: string;
  rowNumber: number;
  sourceText: string;
  suggestion: string;
  decision: string;
  confidence: string;
  reason: string;
  cleanName: string;
  brandName: string | null;
  categoryName: string;
  sizeLabel: string | null;
  pricePence: number | null;
  target: ReviewProduct | null;
  runnerUp: ReviewProduct | null;
  resultProduct: ReviewProduct | null;
  otherSizes: string;
  changeSummary: string;
  tillWords: string;
  issues: string;
  note: string;
  question: string;
  decidedBy: string | null;
  decidedAt: string | null;
  status: string;
  result: string | null;
  resultDetail: string;
}

export interface ReviewRun {
  id: string;
  fileName: string;
  status: string;
  createdAt: string;
  createdBy: string | null;
  settingsChanged: boolean;
  lines: ReviewLine[];
}
