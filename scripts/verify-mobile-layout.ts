import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Measure the storefront at real phone and tablet widths:
 * `npx tsx scripts/verify-mobile-layout.ts --base <url> --path <path> --widths 360,390,768 [--add-first [--then <path>]] [--open-location] [--open-filters] [--open-cart] [--open-quick-view] [--block-urls <pattern>]`.
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
 *
 * #956 adds `documentScrollWidth` (`document.documentElement.scrollWidth`) to every object, and,
 * with `--add-first`, `cartFeedback` to the first width's: the `[data-cart-feedback]` region's text
 * and its message's `left`/`right`, read as soon as the region fills after the click (it empties
 * 4 s later), or `null` if it never filled within 10 s.
 *
 * #964 adds three things:
 * - `tapTargets`: every `a`, `button`, `summary` and visible `input` that carries
 *   `data-tap-surface` or sits inside an element that does, as `{ surface, name, width, height,
 *   displayed }`. `surface` is the nearest `data-tap-surface` value, the element's own included.
 *   `name` is the `aria-label`, else the trimmed text, else the `name` attribute.
 * - `firstCardTop`: the first `[data-product-grid]` child's top in document coordinates, read at
 *   scroll 0, or `null` with no grid.
 * - `--open-location`: before measuring each width, calls `showModal()` on the first
 *   `dialog[data-location-dialog]` whose parent is displayed (the header mounts `LocationControl`
 *   twice, one per breakpoint), then waits 300 ms.
 *
 * #979 and #655 add:
 * - `tapTargets` also covers `select`. A checkbox or radio inside a `label` is reported with the
 *   label's box and name, plus `hitArea: "label"`, because the label is what a finger hits.
 * - `scrollerArrows`: per displayed `[data-tap-surface="scroller-arrow"]`, `{ name,
 *   circleCentreOffset }`, the distance from the top of the arrow's parent (the row) to the centre
 *   of its visible circle (the button's first element child).
 * - `--open-filters`: before measuring, sets `open` on every `details` that holds the mobile filter
 *   `<summary>` (`[data-tap-surface="filter-panel"]`), then waits 300 ms.
 * - `--open-cart`: clicks the floating cart button (`aria-haspopup="dialog"`, label starting
 *   `Cart,`) and waits up to 5 s for `[data-tap-surface="cart-drawer-close"]` to show. Combines with
 *   `--add-first`.
 * - `--open-quick-view`: clicks the first card's `Quick view …` button and waits up to 10 s for
 *   `[data-tap-surface="quick-view-close"]` to show, then 1 s more for its content.
 * - `--block-urls <pattern>`: blocks matching requests with `Network.setBlockedURLs` before the first
 *   navigation (pass `<cdnBase>/*` to make every stored image fail). Before measuring each width it
 *   sets `loading="eager"` on every `img` and waits 2 s, so lazy images are requested too.
 * - `displayed` (and every other "shown" check in the measurement) is now also false when
 *   `checkVisibility()` says so: a closed `<details>` keeps laying out its content, so before this
 *   the filter form inside the closed mobile panel read as displayed.
 * - `brokenImages`, always printed: `{ alt, src }` for each `img` with a non-empty `src` that is
 *   `complete` with `naturalWidth` 0, which is how a browser shows a broken-image icon.
 */

const HEIGHT = 844;
const SCROLL_Y = 600;

interface Args {
  base: string;
  path: string;
  widths: number[];
  addFirst: boolean;
  then: string | null;
  openLocation: boolean;
  openFilters: boolean;
  openCart: boolean;
  openQuickView: boolean;
  blockUrls: string | null;
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
  const openLocation = argv.includes("--open-location");
  const openFilters = argv.includes("--open-filters");
  const openCart = argv.includes("--open-cart");
  const openQuickView = argv.includes("--open-quick-view");
  const blockUrls = value("--block-urls") ?? null;
  const widths = (value("--widths") ?? "")
    .split(",")
    .map((w) => Number(w.trim()))
    .filter((w) => Number.isInteger(w) && w > 0);
  if (
    !base ||
    !path ||
    widths.length === 0 ||
    (then !== null && !addFirst) ||
    (argv.includes("--block-urls") && !blockUrls)
  ) {
    console.error(
      "Usage: npx tsx scripts/verify-mobile-layout.ts --base <url> --path <path> --widths 360,390 [--add-first [--then <path>]] [--open-location] [--open-filters] [--open-cart] [--open-quick-view] [--block-urls <pattern>]",
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
    openLocation,
    openFilters,
    openCart,
    openQuickView,
    blockUrls,
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
    // #979 — a closed <details> lays its content out (content-visibility: hidden) without showing
    // it, so a non-zero box is not enough; checkVisibility() also refuses that case.
    if (el.checkVisibility && !el.checkVisibility()) return false;
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
  const firstChild = grid ? grid.children[0] : null;
  const firstCardTop = firstChild
    ? Math.round(firstChild.getBoundingClientRect().top + window.scrollY)
    : null;

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
  // #964 — every tappable element in a marked surface. #979 adds select, and measures a checkbox
  // or radio by its wrapping label, which is the box a finger actually hits.
  const tapTargets = [
    ...document.querySelectorAll(
      ["a", "button", "summary", "select", "input:not([type=hidden])"]
        .flatMap((tag) => [tag + "[data-tap-surface]", "[data-tap-surface] " + tag])
        .join(", "),
    ),
  ].map((el) => {
    const surface = el.closest("[data-tap-surface]").getAttribute("data-tap-surface");
    const label =
      el.tagName === "INPUT" && (el.type === "checkbox" || el.type === "radio")
        ? el.closest("label")
        : null;
    if (label) {
      const r = label.getBoundingClientRect();
      return {
        surface,
        name: label.textContent.trim(),
        width: Math.round(r.width),
        height: Math.round(r.height),
        displayed: shown(label),
        hitArea: "label",
      };
    }
    const r = el.getBoundingClientRect();
    return {
      surface,
      name: el.getAttribute("aria-label") || el.textContent.trim() || el.getAttribute("name"),
      width: Math.round(r.width),
      height: Math.round(r.height),
      displayed: shown(el),
    };
  });
  // #979 — where each arrow's visible circle sits within its row.
  const scrollerArrows = [...document.querySelectorAll('[data-tap-surface="scroller-arrow"]')]
    .filter((el) => shown(el))
    .map((el) => {
      const circle = el.firstElementChild ?? el;
      const c = circle.getBoundingClientRect();
      const row = el.parentElement.getBoundingClientRect();
      return {
        name: el.getAttribute("aria-label"),
        circleCentreOffset: Math.round(c.top + c.height / 2 - row.top),
      };
    });
  // #655 — an image the browser gave up on: loaded (complete) with no pixels.
  const brokenImages = [...document.querySelectorAll("img")]
    .filter((img) => img.getAttribute("src") && img.complete && img.naturalWidth === 0)
    .map((img) => ({ alt: img.getAttribute("alt"), src: img.getAttribute("src") }));
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
    documentScrollWidth: document.documentElement.scrollWidth,
    scrollYAfterScroll: Math.round(window.scrollY),
    headerTopAfterScroll: headerAfter ? Math.round(headerAfter.top) : null,
    headerHeightAfterScroll: headerAfter ? Math.round(headerAfter.height) : null,
    bannerBottomAfterScroll: bannerAfter ? Math.round(bannerAfter.bottom) : null,
    headerBottomAtTop: headerBottomAtTop === null ? null : Math.round(headerBottomAtTop),
    locationTopAtTop: locationTopAtTop === null ? null : Math.round(locationTopAtTop),
    gridColumns,
    firstCardTop,
    controls,
    tapTargets,
    scrollerArrows,
    brokenImages,
    firstCardStepperLabel: readout ? readout.getAttribute("aria-label") : null,
    formInputs,
    checkout,
  };
})()`;

/**
 * Clicks the first card's Add button, found by its visible text ("Add"). Since #956 its accessible
 * name is "Add <product> to cart", but its text content is still "Add".
 */
const CLICK_FIRST_ADD = `(() => {
  const card = document.querySelector("[data-product-grid]")?.children[0];
  const button = card
    ? [...card.querySelectorAll("button")].find((b) => b.textContent.trim() === "Add")
    : null;
  if (!button) return false;
  button.click();
  return true;
})()`;

/** #956 — the shared cart-feedback region, once it has text: its text and horizontal extent. */
const READ_CART_FEEDBACK = `(() => {
  const region = document.querySelector("[data-cart-feedback]");
  const text = region ? region.textContent.trim() : "";
  if (!text) return null;
  const pill = region.firstElementChild ?? region;
  const box = pill.getBoundingClientRect();
  return { text, left: Math.round(box.left), right: Math.round(box.right) };
})()`;

/** #964 — opens the displayed LocationControl's dialog; false when there is none. */
const OPEN_LOCATION = `(() => {
  const dialog = [...document.querySelectorAll("dialog[data-location-dialog]")].find((d) => {
    const parent = d.parentElement;
    const r = parent.getBoundingClientRect();
    return getComputedStyle(parent).display !== "none" && r.width > 0 && r.height > 0;
  });
  if (!dialog) return false;
  if (!dialog.open) dialog.showModal();
  return true;
})()`;

/** #979 — opens the mobile filter disclosure(s); false when the page has none. */
const OPEN_FILTERS = `(() => {
  const panels = [...document.querySelectorAll("details")].filter((d) =>
    d.querySelector('[data-tap-surface="filter-panel"]'),
  );
  panels.forEach((d) => { d.open = true; });
  return panels.length > 0;
})()`;

/** #979 — clicks the floating cart button; false when there is none. */
const OPEN_CART = `(() => {
  const button = [...document.querySelectorAll('button[aria-haspopup="dialog"]')].find((b) =>
    (b.getAttribute("aria-label") || "").startsWith("Cart,"),
  );
  if (!button) return false;
  button.click();
  return true;
})()`;

/** #979 — clicks the first card's Quick View button; false when there is none. */
const OPEN_QUICK_VIEW = `(() => {
  const card = document.querySelector("[data-product-grid]")?.children[0];
  const button = card
    ? [...card.querySelectorAll("button")].find((b) =>
        (b.getAttribute("aria-label") || "").startsWith("Quick view "),
      )
    : null;
  if (!button) return false;
  button.click();
  return true;
})()`;

/** Whether an element matching the selector is displayed. */
const isDisplayed = (selector: string) => `(() => {
  const el = document.querySelector(${JSON.stringify(selector)});
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return getComputedStyle(el).display !== "none" && r.width > 0 && r.height > 0;
})()`;

/** #655 — asks every lazy image to load now, so a blocked one fails before measuring. */
const EAGER_IMAGES = `(() => {
  document.querySelectorAll("img").forEach((img) => img.setAttribute("loading", "eager"));
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
    if (args.blockUrls) {
      await cdp.send("Network.enable");
      await cdp.send("Network.setBlockedURLs", { urls: [args.blockUrls] });
    }

    /** Polls until the selector is displayed; throws naming the flag if it never is. */
    const waitDisplayed = async (selector: string, timeoutMs: number, flag: string) => {
      for (let waited = 0; waited <= timeoutMs; waited += 250) {
        if (await cdp.evaluate<boolean>(isDisplayed(selector))) return;
        await sleep(250);
      }
      throw new Error(`${flag}: ${selector} was not displayed within ${timeoutMs / 1000}s`);
    };

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
    let cartFeedback: unknown = null;
    let printedFeedback = false;
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
        // #956 — the region fills only once the server action returns, and empties 4 s later, so
        // it is read the moment it has text.
        for (let i = 0; i < 100 && cartFeedback === null; i++) {
          cartFeedback = await cdp.evaluate(READ_CART_FEEDBACK);
          if (cartFeedback === null) await sleep(100);
        }
        for (let i = 0; i < 40 && !(await cdp.evaluate<boolean>(HAS_STEPPER)); i++) {
          await sleep(250);
        }
        added = true;
        await load(args.then ?? args.path);
      }

      if (args.openLocation) {
        if (!(await cdp.evaluate<boolean>(OPEN_LOCATION))) {
          throw new Error("--open-location: no displayed LocationControl dialog");
        }
        await sleep(300);
      }

      if (args.openFilters) {
        if (!(await cdp.evaluate<boolean>(OPEN_FILTERS))) {
          throw new Error("--open-filters: no filter disclosure on the page");
        }
        await sleep(300);
      }

      if (args.openCart) {
        if (!(await cdp.evaluate<boolean>(OPEN_CART))) {
          throw new Error("--open-cart: no floating cart button on the page");
        }
        await waitDisplayed('[data-tap-surface="cart-drawer-close"]', 5_000, "--open-cart");
      }

      if (args.openQuickView) {
        if (!(await cdp.evaluate<boolean>(OPEN_QUICK_VIEW))) {
          throw new Error("--open-quick-view: no Quick view button in the first card");
        }
        await waitDisplayed('[data-tap-surface="quick-view-close"]', 10_000, "--open-quick-view");
        await sleep(1000);
      }

      if (args.blockUrls) {
        await cdp.evaluate<boolean>(EAGER_IMAGES);
        await sleep(2000);
      }

      const measured = await cdp.evaluate<Record<string, unknown>>(MEASURE);
      // Printed on the width whose click produced it; every other width has none to report.
      const feedbackHere = args.addFirst && !printedFeedback;
      if (feedbackHere) printedFeedback = true;
      console.log(JSON.stringify(feedbackHere ? { ...measured, cartFeedback } : measured));
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
