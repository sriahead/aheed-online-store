import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * #1482 (owner, 2026-11-10): staging must never mail a real customer by accident; production mails
 * anyone. `EMAIL_RECIPIENT_MODE` is the only switch (`lib/email/policy.ts` — anything but "open",
 * including unset, is allowlist mode, so only `EMAIL_ALLOWED_RECIPIENTS` receive mail). This pins the
 * split per Worker environment in `wrangler.toml`, because #1459 once set "open" on staging and
 * #1478 copied it into the dedicated cell.
 */

const toml = readFileSync("wrangler.toml", "utf8");

/** The `[env.<name>.vars]` table's body, up to the next table header. */
function varsBlock(env: string): string {
  const header = `[env.${env}.vars]`;
  const start = toml.indexOf(header);
  expect(start, `${header} exists`).toBeGreaterThan(-1);
  const rest = toml.slice(start + header.length);
  const next = rest.search(/^\[/m);
  return next === -1 ? rest : rest.slice(0, next);
}

function recipientMode(env: string): string | undefined {
  const match = /^EMAIL_RECIPIENT_MODE\s*=\s*"([^"]*)"/m.exec(varsBlock(env));
  return match?.[1];
}

describe("email recipient mode per environment (#1482)", () => {
  it.each(["staging", "afc-staging"])("%s leaves it unset (allowlist only)", (env) => {
    expect(recipientMode(env)).toBeUndefined();
  });

  it.each(["production", "afc-production"])("%s is open (mails anyone)", (env) => {
    expect(recipientMode(env)).toBe("open");
  });

  it("the top-level (no env) vars do not open it either", () => {
    const topLevel = toml.slice(0, toml.indexOf("[env."));
    expect(topLevel).not.toMatch(/^EMAIL_RECIPIENT_MODE\s*=\s*"open"/m);
  });
});
