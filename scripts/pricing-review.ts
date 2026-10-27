/**
 * #1309 - the quarterly pricing review, as a markdown issue body on stdout.
 *
 *   npx tsx scripts/pricing-review.ts > body.md
 *
 * Run by .github/workflows/pricing-review.yml, which opens a GitHub issue with the output. It reads
 * only the pure registries and analysis: no database, no network, no AI and no credential, so it runs
 * on a bare runner with only GITHUB_TOKEN. The AI-assisted comparison against live pricing pages is the
 * "Refresh Recommendations" button on the dashboard, pressed by a person; the issue says so.
 *
 * Progress and errors go to stderr only, so stdout is exactly the issue body.
 */
import { buildCostReport } from "@/lib/running-costs";
import { analyse, COMMITTED } from "@/lib/pricing/committed";
import { RECOMMENDATION } from "@/lib/pricing/business-models";
import { PROPOSED_PLANS } from "@/lib/pricing/proposed-plans";
import { formatMoney, gbp } from "@/lib/pricing/money";

export const DASHBOARD_URL = "https://staging.aheedfoodcentre.nocaped.com/staff/platform/costs";

export function reviewBody(now: Date): string {
  const report = buildCostReport(COMMITTED.costItems, now);
  const analysis = analyse(COMMITTED, now);
  const lines: string[] = [];

  lines.push(
    `Quarterly review of platform costs, competitor pricing and the business model (#1309).`,
  );
  lines.push("");
  lines.push(`- Committed analysis date: ${RECOMMENDATION.reviewedOn}`);
  lines.push(`- Next review due: ${RECOMMENDATION.nextReviewDue}`);
  lines.push(`- Recommendation overdue: ${analysis.recommendationOverdue ? "yes" : "no"}`);
  lines.push(
    `- Recommendation disagrees with the current numbers: ${analysis.recommendationDisagrees ? "yes" : "no"}`,
  );
  lines.push("");

  lines.push("## Stale figures");
  if (analysis.stale.length === 0) lines.push("Nothing stale");
  for (const entry of analysis.stale) lines.push(`- ${entry.registry}: ${entry.id}`);
  lines.push("");

  lines.push("## Owner to confirm");
  if (report.ownerToConfirm.length === 0) lines.push("Nothing waiting for the owner");
  for (const id of report.ownerToConfirm) lines.push(`- ${id}`);
  lines.push("");

  lines.push("## Break-even (committed figures)");
  if (analysis.costPence === null) {
    lines.push("No exchange rate: GBP figures unavailable");
  } else {
    lines.push(`Platform cost: ${formatMoney(gbp(analysis.costPence))} per month.`);
    for (const plan of PROPOSED_PLANS) {
      const r = analysis.plans.find((p) => p.planId === plan.id);
      const text =
        r?.breakEvenVendors != null
          ? `${r.breakEvenVendors} vendor(s) at zero sales`
          : r?.breakEvenGmvPence != null
            ? `${formatMoney(gbp(r.breakEvenGmvPence))} of vendor sales per month`
            : "does not break even on commission (does not cover card fees)";
      lines.push(`- ${plan.name} (${plan.model}): ${text}`);
    }
  }
  lines.push("");

  lines.push("## What to do");
  lines.push(`1. Open ${DASHBOARD_URL} as a platform admin and press "Refresh Recommendations".`);
  lines.push("2. Review each unconfirmed suggestion and update the registries under `lib/` by PR.");
  lines.push(
    "3. Re-read the recommendation and set its `reviewedOn` in `lib/pricing/business-models.ts`.",
  );
  lines.push("");
  lines.push("Advisory only: nothing here changes live prices or subscriptions.");
  return lines.join("\n") + "\n";
}

function main(): void {
  console.error("pricing-review: building the quarterly review body");
  process.stdout.write(reviewBody(new Date()));
}

if (process.argv[1] && /pricing-review\.ts$/.test(process.argv[1])) {
  try {
    main();
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}
