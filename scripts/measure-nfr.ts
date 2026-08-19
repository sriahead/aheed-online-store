/**
 * P7d (#218) — NFR latency harness.
 *
 * Measures wall-clock **time to first byte** for a set of public routes and prints per-route
 * percentiles as JSON on stdout. Exists so `specs/mission.md`'s "API p95 < 400ms" stops being an
 * assertion and becomes a number anyone can re-take, the same way `scripts/verify-data-rights.ts`
 * made P7b's write paths reproducible.
 *
 * WHAT THIS MEASURES, AND WHAT IT DOES NOT. Every figure here is **client-observed**: the elapsed
 * time between this process writing a request and receiving the first response byte, from whatever
 * machine and connection runs it. That includes DNS, TLS, the network path to Cloudflare's edge and
 * the edge-to-origin hop. It is NOT the server-side p95 a Cloudflare dashboard reports, and
 * `docs/nfr-baseline.md` labels the two separately. Do not present one as the other.
 *
 * Deliberately HTTP-only: no Prisma, no repository imports, no session cookie, no database
 * credential. That is what lets it run in a fresh checkout, in CI, or on a machine that has never
 * been pointed at Neon (P7d requirements R4/R6).
 *
 *   npx tsx scripts/measure-nfr.ts --base https://staging.aheedfoodcentre.nocaped.com
 *   npm run nfr:measure -- --base <url> --samples 30
 */

import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { performance } from "node:perf_hooks";

/**
 * Default route set. Public and session-free by construction — an authenticated route would make
 * the harness need a credential and stop being runnable from a clean checkout.
 *
 * Slugs are real ones on the Aheed vendor, discovered from the deployed storefront rather than
 * guessed. A different vendor (or a reseeded database) needs `--routes`; a 404 shows up as an
 * `errors` count rather than being silently averaged into the percentiles.
 */
const DEFAULT_ROUTES = [
  "/",
  "/categories",
  "/categories/fruit-veg",
  "/products/basmati-rice-5kg",
  "/search?q=rice",
  "/api/health",
];

const DEFAULT_SAMPLES = 20;

interface RouteResult {
  route: string;
  samples: number;
  errors: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  minMs: number;
  maxMs: number;
  /** First request, excluded from the percentiles above — it absorbs cold start and TLS setup. */
  warmupMs: number | null;
  statuses: Record<string, number>;
}

function parseArgs(argv: string[]) {
  const args = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      args.set(key, "true");
    } else {
      args.set(key, next);
      i += 1;
    }
  }
  return args;
}

/**
 * One request, timed to the first response byte. Uses node:http(s) rather than fetch because fetch
 * resolves its promise after headers *and* stream setup, which blurs TTFB — and because undici
 * silently drops a caller-set Host header, a trap this repo has already paid for once (P3d).
 */
function timeRequest(url: string, timeoutMs: number): Promise<{ ms: number; status: number }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const send = parsed.protocol === "http:" ? httpRequest : httpsRequest;
    const startedAt = performance.now();

    const req = send(
      url,
      {
        method: "GET",
        headers: {
          // Identify the harness in Workers Logs so a latency spike can be told apart from real
          // traffic when someone reads the logs later.
          "user-agent": "aheed-nfr-harness/1.0 (+specs/2026-08-19-p7d-observability-nfr)",
          accept: "text/html,application/json;q=0.9,*/*;q=0.8",
        },
      },
      (res) => {
        const ms = performance.now() - startedAt;
        const status = res.statusCode ?? 0;
        // Drain, or the socket stays open and later samples queue behind it.
        res.resume();
        res.on("end", () => resolve({ ms, status }));
        res.on("error", reject);
      },
    );

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`timeout after ${timeoutMs}ms`));
    });
    req.on("error", reject);
    req.end();
  });
}

/** Nearest-rank percentile over an already-sorted ascending array. */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const rank = Math.ceil((p / 100) * sorted.length);
  const index = Math.min(Math.max(rank - 1, 0), sorted.length - 1);
  return Math.round(sorted[index] * 100) / 100;
}

async function measureRoute(
  base: string,
  route: string,
  samples: number,
  timeoutMs: number,
): Promise<RouteResult> {
  const url = new URL(route, base).toString();
  const durations: number[] = [];
  const statuses: Record<string, number> = {};
  let errors = 0;
  let warmupMs: number | null = null;

  // Warm-up, excluded from the percentiles. A Worker cold start is real but it is not what
  // "p95 under normal traffic" means, and one 900ms outlier in twenty samples moves p95 outright.
  try {
    const warm = await timeRequest(url, timeoutMs);
    warmupMs = Math.round(warm.ms * 100) / 100;
    statuses[String(warm.status)] = (statuses[String(warm.status)] ?? 0) + 1;
  } catch {
    errors += 1;
  }

  for (let i = 0; i < samples; i += 1) {
    try {
      const { ms, status } = await timeRequest(url, timeoutMs);
      statuses[String(status)] = (statuses[String(status)] ?? 0) + 1;
      // A non-2xx/3xx is not a latency sample — a fast 500 would flatter the percentiles.
      if (status >= 200 && status < 400) {
        durations.push(ms);
      } else {
        errors += 1;
      }
    } catch {
      errors += 1;
    }
  }

  const sorted = [...durations].sort((a, b) => a - b);

  return {
    route,
    samples: sorted.length,
    errors,
    p50Ms: percentile(sorted, 50),
    p95Ms: percentile(sorted, 95),
    p99Ms: percentile(sorted, 99),
    minMs: sorted.length ? Math.round(sorted[0] * 100) / 100 : 0,
    maxMs: sorted.length ? Math.round(sorted[sorted.length - 1] * 100) / 100 : 0,
    warmupMs,
    statuses,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const base = args.get("base");

  if (!base) {
    process.stderr.write(
      "usage: npx tsx scripts/measure-nfr.ts --base <url> [--samples N] [--routes /a,/b] [--timeout ms]\n",
    );
    process.exit(2);
  }

  const samples = Number(args.get("samples") ?? DEFAULT_SAMPLES);
  const timeoutMs = Number(args.get("timeout") ?? 15000);
  const routes = (args.get("routes")?.split(",").filter(Boolean) ?? DEFAULT_ROUTES).map((r) =>
    r.trim(),
  );

  if (!Number.isFinite(samples) || samples < 1) {
    process.stderr.write(`--samples must be a positive number, got ${args.get("samples")}\n`);
    process.exit(2);
  }

  // Progress goes to stderr so stdout stays a single parseable JSON document (R5).
  process.stderr.write(`measuring ${routes.length} routes x ${samples} samples against ${base}\n`);

  const results: RouteResult[] = [];
  for (const route of routes) {
    process.stderr.write(`  ${route} ... `);
    const result = await measureRoute(base, route, samples, timeoutMs);
    results.push(result);
    process.stderr.write(`p50=${result.p50Ms}ms p95=${result.p95Ms}ms errors=${result.errors}\n`);
  }

  const output = {
    measuredAt: new Date().toISOString(),
    base,
    samplesPerRoute: samples,
    measurement: "client-observed time-to-first-byte",
    note: "Not server-side latency. See docs/nfr-baseline.md for the distinction.",
    routes: results,
  };

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(1);
});
