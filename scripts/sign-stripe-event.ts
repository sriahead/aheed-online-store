/**
 * Posts a validly-signed Stripe Checkout event at a running webhook endpoint
 * (P9.1, #429).
 *
 *   npx tsx scripts/sign-stripe-event.ts \
 *     --url http://localhost:8787/api/webhooks/stripe \
 *     --secret whsec_... \
 *     --type checkout.session.completed \
 *     --order AHE-20260829-K4M2XQ \
 *     --session cs_test_... \
 *     --amount 2346 \
 *     --currency gbp
 *
 * WHY THIS EXISTS RATHER THAN `stripe trigger` OR A UNIT TEST
 *
 * #429's whole claim is that a correctly-signed event which does NOT correspond
 * to an order's stored payment cannot move that order. Neither of the obvious
 * tools can produce that input:
 *
 * - `stripe listen` forwards only what Stripe itself generated, so it can never
 *   deliver a genuine signature over a deliberately mismatched session id.
 * - A unit test constructs the event object by hand, which reproduces whatever
 *   shape the test author assumed. CLAUDE.md records that failure mode twice at
 *   real cost — the `23505`/`P2002` adapter divergence, and the `updateMany`
 *   HTTP-mode crash that four rounds of reasoning missed and one live script
 *   found immediately.
 *
 * We hold the signing secret locally, so we can sign a payload we chose. That is
 * the only way to exercise the refusal paths end to end, through the real route,
 * the real adapter and real Postgres.
 *
 * The signature format mirrors `lib/stripe-webhook.ts`'s verifier exactly:
 * HMAC-SHA256 over `${timestamp}.${rawBody}`, emitted as `t=<unix>,v1=<hex>`.
 * The body posted is the same string that was signed — re-serialising parsed
 * JSON changes bytes and the HMAC would never match.
 *
 * Prints the response status and body. Writes nothing to any database itself;
 * every effect is whatever the route decides to perform.
 */

import { createHmac } from "node:crypto";

interface Args {
  url: string;
  secret: string;
  type: string;
  order: string;
  session: string;
  amount?: string;
  currency?: string;
}

function parseArgs(argv: string[]): Args {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    if (!key?.startsWith("--")) continue;
    out[key.slice(2)] = argv[i + 1] ?? "";
  }
  for (const required of ["url", "secret", "type", "order", "session"]) {
    if (!out[required]) {
      throw new Error(`missing --${required}. See the usage block at the top of this file.`);
    }
  }
  return out as unknown as Args;
}

/**
 * The narrow slice of a Checkout Session `parseCheckoutEvent` actually reads.
 *
 * `payment_status: "paid"` is set for `checkout.session.completed` deliberately:
 * the route breaks out early on anything else, so without it a mismatched-binding
 * probe would be swallowed by that pre-existing guard and appear to pass for
 * entirely the wrong reason.
 */
function buildBody(args: Args): string {
  const session: Record<string, unknown> = {
    id: args.session,
    object: "checkout_session",
    client_reference_id: args.order,
    metadata: { orderNumber: args.order },
  };
  if (args.type === "checkout.session.completed") session.payment_status = "paid";
  if (args.amount !== undefined) session.amount_total = Number(args.amount);
  if (args.currency !== undefined) session.currency = args.currency;

  return JSON.stringify({
    id: `evt_local_${Date.now()}`,
    object: "event",
    type: args.type,
    data: { object: session },
  });
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const body = buildBody(args);

  // Inside the verifier's 300s tolerance by construction.
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", args.secret).update(`${timestamp}.${body}`).digest("hex");

  const response = await fetch(args.url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "stripe-signature": `t=${timestamp},v1=${signature}`,
    },
    body,
  });

  console.log(`type:    ${args.type}`);
  console.log(`order:   ${args.order}`);
  console.log(`session: ${args.session}`);
  console.log(`status:  ${response.status}`);
  console.log(`body:    ${await response.text()}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
