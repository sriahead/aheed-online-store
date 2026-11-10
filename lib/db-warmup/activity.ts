import { getCloudflareContext } from "@opennextjs/cloudflare";
import { markWarmupActivity } from "@/lib/job-signals";

/**
 * #1491 R6a — record that a signed-in request was served, so the scheduler keeps the database warm for
 * `activityMinutes` after it. KV only (via `lib/job-signals.ts`, the one module allowed to touch the
 * namespace), throttled there, and never able to fail the request.
 *
 * Handed to `ctx.waitUntil` so the request does not wait on KV and the Worker does not cancel the
 * write when the response ends (an un-awaited promise on Workers can be dropped). Outside a Worker
 * context (Node script, unit test) it is simply awaited by nobody and resolves on its own.
 */
export function recordWarmupActivity(now: Date = new Date()): void {
  const pending = markWarmupActivity(now);
  try {
    getCloudflareContext().ctx.waitUntil(pending);
  } catch {
    void pending;
  }
}
