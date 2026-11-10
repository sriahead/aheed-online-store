import { getPrisma } from "@/lib/db";
import { markWarmupPing } from "@/lib/job-signals";

/**
 * #1491 R9 — one trivial query on the main database, then the last-ping marker. Kept apart from
 * `lib/db-warmup-service.ts` so the ping route imports nothing that reads vendors, hours or the
 * reference database. It never writes the activity marker: a ping is not activity, or it would keep
 * itself alive forever.
 */
export async function warmDatabase(now: Date = new Date()): Promise<{ ok: true; ms: number }> {
  const started = Date.now();
  await getPrisma().healthCheck.findFirst({ select: { id: true } });
  const ms = Date.now() - started;
  await markWarmupPing(now);
  return { ok: true, ms };
}
