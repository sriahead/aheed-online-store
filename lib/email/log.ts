import type { EmailAdapter } from "./types";

/**
 * Log-only adapter (#1217): the default when no provider is configured (local dev, CI). Matches
 * the old "no key, log and continue" degradation — nothing leaves the process.
 */
export function createLogAdapter(): EmailAdapter {
  return {
    name: "log",
    async deliver() {
      return { status: "skipped", reason: "no email provider is configured (log only)" };
    },
  };
}
