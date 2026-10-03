import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Measure the storefront at real phone and tablet widths:
 * `npx tsx scripts/verify-mobile-layout.ts --base <url> --path <path> --widths 360,390,768 [--add-first [--then <path>]]`.
 *
 * ## Why this exists (#960, #961, #962)
 *
 * Desktop Chrome cannot be narrower than 501px, so every "mobile" measurement before this was taken
 * at 501px and anything at 320–430px was inferred. A same-origin iframe of a set width does not
 * work either: `next.config.mjs` sends `X-Frame-Options` and `frame-ancestors 'none'`. This drives
 * the locally installed Chrome headless over the DevTools protocol and sets the viewport with
 * `Emulation.setDeviceMetricsOverride`, which is a real layout at that width with `mobile: true`.
 * It uses Node's built-in `WebSocket` (Node 22+) and adds no dependency.
 *
 * ## It measures; it does not judge
 *
 * It prints one JSON object per width and exits 0 when every page loaded. It has no thresholds and
 * prints no PASS/FAIL. The thresholds live in the slice's `requirements.md`, so a validator compares
 * numbers instead of trusting a script's own verdict.
 *
 * Each run uses a fresh, throwaway browser profile, so it starts with an empty guest cart.
 * `--add-first` clicks the first card's Add button once (at the first width), waits for the cart
 * stepper, reloads, and keeps that cart for the remaining widths.
 *
 * `--then <path>` (#958, #959) needs `--add-first`. Once the item is in the cart, every width (the
 * first included) is measured at `<path>` instead of `--path`. That is how it reaches `/checkout`,
 * which redirects an empty cart to `/cart`.
 *
 * ## What it reads
 *
 * Stable hooks added for it: `[data-header-banner]`, `[data-header-location]` and
 * `[data-product-grid]`; for checkout, `[data-checkout-form]`, `[data-checkout-total]`,
 * `[data-checkout-summary]` and `[data-checkout-summary-total]`. Every printed object also lists
 * each visible form input's `autocomplete` attribute (`formInputs`). The sticky header is the page's `header` element. It is not a
 * replacement for `#440`'s Playwright harness.
 */

const HEIGHT = 844;
const SCROLL_Y = 600;

interface Args {
  base: string;
  path: string;
  widths: number[];
  addFirst: boolean;
  then: string | null;
}

function parseArgs(argv: string[]): Args {
  const value = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const base = value("--base");
  const path = value("--path");
  const then = value("--then") ?? null;
  const addFirst = argv.includes("--add-first");
  const widths = (value("--widths") ?? "")
    .split(",")
    .map((w) => Number(w.trim()))
    .filter((w) => Number.isInteger(w) && w > 0);
  if (!base || !path || widths.length === 0 || (then !== null && !addFirst)) {
    console.error(
      "Usage: npx tsx scripts/verify-mobile-layout.ts --base <url> --path <path> --widths 360,390 [--add-first [--then <path>]]",
    );
    process.exit(2);
  }
  // Git Bash (MSYS) rewrites a bare `/categories/x` argument into `C:/Program Files/Git/categories/x`
  // before Node sees it, which turns the URL into a DNS failure that looks like a layout result
  // with every value null. Refuse it loudly; a path without the leading slash is never rewritten.
  for (const [flag, given] of [
    ["--path", path],
    ["--then", then],
  ] as const) {
    if (given !== null && /^[A-Za-z]:[\\/]/.test(given)) {
      console.error(
        `${flag} looks like a Windows path (${given}): Git Bash rewrote it. Pass it without the leading slash (categories/x) or set MSYS_NO_PATHCONV=1.`,
      );
      process.exit(2);
    }
  }
  const absolute = (p: string) => (p.startsWith("/") ? p : `/${p}`);
  return {
    base: base.replace(/\/$/, ""),
    path: absolute(path),
    widths,
    addFirst,
    then: then === null ? null : absolute(then),
  };
}

function findChrome(): string {
  const candidates = [
    process.env.CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].filter((p): p is string => Boolean(p));
  const found = candidates.find((p) => existsSync(p));
  if (!found) {
    console.error("No Chrome found. Set CHROME_PATH to a Chrome or Chromium executable.");
    process.exit(2);
  }
  return found;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type CdpMessage = { id?: number; method?: string; result?: unknown; error?: { message: string } };

class Cdp {
  private nextId = 0;
  private pending = new Map<number, (message: CdpMessage) => void>();
  private listeners = new Map<string, () => void>();

  constructor(private socket: WebSocket) {
    socket.onmessage = (event) => {
      const message = JSON.parse(String(event.data)) as CdpMessage;
      if (message.id !== undefined) {
        this.pending.get(message.id)?.(message);
        this.pending.delete(message.id);
      } else if (message.method) {
        this.listeners.get(message.method)?.();
      }
    };
  }

  /** Rejects after 30s: a call that never answers (e.g. evaluating mid-navigation) must fail loudly. */
  send(method: string, params: Record<string, unknown> = {}): Promise<CdpMessage> {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`DevTools call ${method} got no answer within 30s`));
      }, 30_000);
      this.pending.set(id, (message) => {
        clearTimeout(timer);
        resolve(message);
      });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  once(method: string, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.listeners.delete(method);
        resolve(false);
      }, timeoutMs);
      this.listeners.set(method, () => {
        clearTimeout(timer);
        this.listeners.delete(method);
        resolve(true);
      });
    });
  }

  async evaluate<T>(expression: string): Promise<T> {
    const response = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    const result = response.result as {
      result: { value: T };
      exceptionDetails?: { text: string };
    };
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  }
}

/** Runs inside the page. Everything it returns is a raw number, string, boolean or null. */
const MEASURE = `(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const shown = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return getComputedStyle(el).display !== "none" && r.width > 0 && r.height > 0;
  };
  const header = document.querySelector("header");
  const banner = document.querySelector("[data-header-banner]");
  const location = document.querySelector("[data-header-location]");
  const grid = document.querySelector("[data-product-grid]");

  window.scrollTo(0, 0);
  await sleep(300);
  const headerBottomAtTop = header ? header.getBoundingClientRect().bottom : null;
  const locationTopAtTop = shown(location) ? location.getBoundingClientRect().top : null;

  const cards = grid ? [...grid.children] : [];
  let gridColumns = 0;
  if (cards.length > 0) {
    const firstTop = Math.round(cards[0].getBoundingClientRect().top);
    const lefts = new Set(
      cards
        .filter((c) => Math.round(c.getBoundingClientRect().top) === firstTop)
        .map((c) => Math.round(c.getBoundingClientRect().left)),
    );
    gridColumns = lefts.size;
  }

  const size = (el, name) => {
    const r = el.getBoundingClientRect();
    return { name, width: Math.round(r.width), height: Math.round(r.height), displayed: shown(el) };
  };
  const firstCard = cards[0] ?? null;
  const controls = [
    ...(firstCard ? [...firstCard.querySelectorAll("button")] : []).map((b) =>
      size(b, b.getAttribute("aria-label") || b.textContent.trim()),
    ),
    ...(header ? [...header.querySelectorAll("nav a")] : []).map((a) =>
      size(a, a.getAttribute("href")),
    ),
  ];
  const readout = firstCard
    ? [...firstCard.querySelectorAll("[aria-label]")].find((el) =>
        el.getAttribute("aria-label").endsWith("in cart"),
      )
    : null;

  // #958 — every visible field's autocomplete token, exactly as written (null when absent).
  const formInputs = [...document.querySelectorAll("form input")]
    .filter((input) => input.type !== "hidden")
    .map((input) => ({
      id: input.id || null,
      name: input.getAttribute("name"),
      type: input.type,
      autocomplete: input.getAttribute("autocomplete"),
    }));

  // #959 — checkout headings, and where the total sits relative to the button. Document
  // coordinates (viewport box plus scrollY), so values compare regardless of scroll.
  const docBox = (el) => {
    const r = el.getBoundingClientRect();
    return { top: Math.round(r.top + window.scrollY), bottom: Math.round(r.bottom + window.scrollY) };
  };
  const checkoutForm = document.querySelector("[data-checkout-form]");
  let checkout = null;
  if (checkoutForm) {
    const totalRow = checkoutForm.querySelector("[data-checkout-total]");
    const submit = checkoutForm.querySelector("button[type=submit]");
    const summary = document.querySelector("[data-checkout-summary]");
    const summaryTotal = document.querySelector("[data-checkout-summary-total]");
    checkout = {
      headings: [...checkoutForm.querySelectorAll("h2")].map((h) => h.textContent.trim()),
      totalRow: totalRow
        ? { displayed: shown(totalRow), ...docBox(totalRow), text: totalRow.textContent.trim() }
        : null,
      submit: submit ? { ...docBox(submit), text: submit.textContent.trim() } : null,
      summaryTop: summary ? docBox(summary).top : null,
      summaryTotal: summaryTotal ? summaryTotal.textContent.trim() : null,
    };
  }

  window.scrollTo(0, ${SCROLL_Y});
  await sleep(400);
  const headerAfter = header ? header.getBoundingClientRect() : null;
  const bannerAfter = banner ? banner.getBoundingClientRect() : null;

  return {
    viewportWidth: window.innerWidth,
    scrollYAfterScroll: Math.round(window.scrollY),
    headerTopAfterScroll: headerAfter ? Math.round(headerAfter.top) : null,
    headerHeightAfterScroll: headerAfter ? Math.round(headerAfter.height) : null,
    bannerBottomAfterScroll: bannerAfter ? Math.round(bannerAfter.bottom) : null,
    headerBottomAtTop: headerBottomAtTop === null ? null : Math.round(headerBottomAtTop),
    locationTopAtTop: locationTopAtTop === null ? null : Math.round(locationTopAtTop),
    gridColumns,
    controls,
    firstCardStepperLabel: readout ? readout.getAttribute("aria-label") : null,
    formInputs,
    checkout,
  };
})()`;

/** Clicks the first card's Add button. Its accessible name is its text ("Add") until #956. */
const CLICK_FIRST_ADD = `(() => {
  const card = document.querySelector("[data-product-grid]")?.children[0];
  const button = card
    ? [...card.querySelectorAll("button")].find((b) => b.textContent.trim() === "Add")
    : null;
  if (!button) return false;
  button.click();
  return true;
})()`;

const HAS_STEPPER = `(() => {
  const card = document.querySelector("[data-product-grid]")?.children[0];
  return Boolean(card && [...card.querySelectorAll("[aria-label]")].some((el) =>
    el.getAttribute("aria-label").endsWith("in cart")));
})()`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const profile = mkdtempSync(join(tmpdir(), "verify-mobile-layout-"));
  const port = 9300 + Math.floor(Math.random() * 500);
  const chrome = spawn(
    findChrome(),
    [
      "--headless=new",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "about:blank",
    ],
    { stdio: "ignore" },
  );

  // Belt and braces: whatever stalls, the run ends with exit 1 and a reason, never a silent hang
  // holding Chrome (an orphaned run was seen to block a concurrent `npm run preview` build).
  const watchdog = setTimeout(
    () => {
      console.error("verify-mobile-layout: timed out; killing Chrome.");
      chrome.kill();
      process.exit(1);
    },
    60_000 + 60_000 * args.widths.length,
  );

  let exitCode = 0;
  try {
    let targets: { type: string; webSocketDebuggerUrl: string }[] = [];
    for (let i = 0; i < 60 && targets.length === 0; i++) {
      try {
        targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      } catch {
        await sleep(250);
      }
    }
    const page = targets.find((t) => t.type === "page");
    if (!page) throw new Error("Chrome started but exposed no page target.");

    const socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.onopen = resolve;
      socket.onerror = reject;
    });
    const cdp = new Cdp(socket);
    await cdp.send("Page.enable");

    const load = async (path: string) => {
      const loaded = cdp.once("Page.loadEventFired", 30_000);
      await cdp.send("Page.navigate", { url: `${args.base}${path}` });
      if (!(await loaded)) throw new Error(`Timed out loading ${args.base}${path}`);
      await sleep(1500); // let client islands hydrate
      const landed = await cdp.evaluate<string>("location.href");
      if (landed.startsWith("chrome-error:")) {
        throw new Error(`Could not load ${args.base}${path} (Chrome error page).`);
      }
    };

    let added = false;
    for (const width of args.widths) {
      await cdp.send("Emulation.setDeviceMetricsOverride", {
        width,
        height: HEIGHT,
        deviceScaleFactor: 2,
        mobile: true,
      });
      await load(added && args.then ? args.then : args.path);

      if (args.addFirst && !added) {
        if (!(await cdp.evaluate<boolean>(CLICK_FIRST_ADD))) {
          throw new Error("--add-first: no Add button in the first card");
        }
        for (let i = 0; i < 40 && !(await cdp.evaluate<boolean>(HAS_STEPPER)); i++) {
          await sleep(250);
        }
        added = true;
        await load(args.then ?? args.path);
      }

      console.log(JSON.stringify(await cdp.evaluate(MEASURE)));
    }
    socket.close();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    exitCode = 1;
  } finally {
    clearTimeout(watchdog);
    chrome.kill();
    await sleep(500);
    try {
      rmSync(profile, { recursive: true, force: true });
    } catch {
      // Chrome can hold the profile briefly after exit on Windows; a stale temp dir is harmless.
    }
  }
  process.exit(exitCode);
}

void main();
