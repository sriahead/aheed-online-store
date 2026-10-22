import Link from "next/link";
import { headers, cookies } from "next/headers";

import { getAuth } from "@/lib/auth";
import { requireVendorRole } from "@/lib/auth-rbac";
import { getEnv } from "@/lib/config";
import { composePublicUrl } from "@/lib/storage";
import { markUrls } from "@/lib/vendor-icons";
import { isDiallablePhone, telHref } from "@/lib/footer-contact-form";
import { HeaderBrand } from "./HeaderBrand";
import { getCurrentVendorProfile } from "@/lib/vendor-service";
import { getRequestCartSummary } from "@/lib/cart-summary";
import { isPostcodeDeliverable } from "@/lib/delivery-eligibility-service";
import { DELIVERY_POSTCODE_COOKIE } from "@/lib/delivery-cookie";
import { CartDrawerShell } from "@/components/cart/CartDrawerShell";
import { CartContents } from "@/components/cart/CartContents";
import { LocationControl } from "./LocationControl";
import { getFulfilmentMethod } from "@/lib/fulfilment-service";
import { getShopperDeliveryRules } from "@/lib/delivery-pricing-service";
import { bannerHeadlineText } from "@/components/layout/banner-headline";
import { DepartmentSearchBar } from "./DepartmentSearchBar";
import { toSearchDepartments } from "./search-departments";
import { ShoppingListLink } from "./ShoppingListLink";
import { getCategoryRepository } from "@/lib/categories-service";
import { ViewSwitcher } from "./ViewSwitcher";
import { Icon } from "@/components/icons/Icon";

/**
 * Storefront header — a Server Component (no "use client"), so it reads the
 * session and renders auth state with zero client JS, matching the
 * progressive-enhancement pattern used everywhere since P2a.
 */

export async function Header({
  isPortal = false,
}: {
  isPortal?: boolean;
  /**
   * P8.5f: whether this is the storefront's landing route (`/`). #1131: the
   * header no longer renders differently there — the "Shop List" link it used
   * to hide is the landing page's Quick Shop entry now — so `Header` reads
   * nothing from it. It stays on the props because it is the route groups'
   * seam into the header (`StorefrontChrome`), and re-deriving it later would
   * mean re-plumbing three layouts. Passed explicitly by whichever layout
   * renders `Header` — `app/(landing)/layout.tsx` passes `true`,
   * `app/(storefront)/layout.tsx` and `app/(admin)/layout.tsx` don't, same
   * pattern `isPortal` already uses. Not derived from a request header: a
   * layout in the App Router cannot see which page it wraps, and the earlier
   * approach (a root `proxy.ts` annotating the request) is unbuildable on this
   * project's pinned `@opennextjs/cloudflare` — Next 16 forces Proxy files onto
   * the Node.js runtime and forbids opting out, and the Cloudflare adapter
   * rejects any Node-runtime middleware outright (`process.exit(1)`, confirmed
   * against both `npm run preview` and a real `staging` deploy). See
   * `specs/architecture.md` §2.1.
   */
  isLanding?: boolean;
} = {}) {
  const requestHeaders = await headers();
  const session = await (await getAuth()).api.getSession({ headers: requestHeaders });
  const user = session?.user as { name: string } | undefined;
  const firstName = user?.name?.split(" ")[0];

  let isStaffOrAdmin = false;
  let canSeeAdmin = false;
  if (user) {
    const staffCheck = await requireVendorRole("STAFF", "ADMIN");
    isStaffOrAdmin = staffCheck.ok;
    canSeeAdmin =
      staffCheck.ok && (staffCheck.via === "platform-admin" || staffCheck.via === "ADMIN");
  }

  const cookieStore = await cookies();
  let currentTier: "staff" | "admin" = "staff";
  if (canSeeAdmin) {
    const saved = cookieStore.get("admin-tier")?.value;
    if (saved === "admin" || saved === "staff") {
      currentTier = saved;
    } else {
      currentTier = "admin";
    }
  }

  const profile = await getCurrentVendorProfile();
  const name = profile?.name ?? "";
  const localityName = profile?.localityName ?? "";
  const bannerNote = profile?.bannerNote ?? null;

  // #1077 — the store's phone number in the banner (owner testing, triage item 2). The value is
  // `VendorConfig.contactPhone` (#1055), already editable at /staff/storefront, so nothing here is
  // a literal.
  //
  // The SAME guard the footer applies, and for the same reason: a bracketed placeholder such as
  // "[YOUR PHONE]" is a legal stored value (`lib/footer-contact-form.ts`), and only a value that
  // passes `isDiallablePhone` may become an href. The footer renders a non-diallable value as text;
  // this banner renders NOTHING for it — one terse promo line is not the place to show a shopper an
  // unfilled placeholder, and #239's rule is that a missing value hides its element.
  const bannerPhone = profile?.contactPhone ?? null;
  const bannerPhoneHref =
    bannerPhone && isDiallablePhone(bannerPhone) ? telHref(bannerPhone) : null;

  // P8.5f: the checker moved here from the homepage hero. Only the postcode is
  // stored; the verdict is recomputed every render against the vendor's CURRENT
  // prefixes, so extending a delivery area doesn't leave a shopper holding a
  // stale "we don't deliver to you".
  // #764: the verdict now comes from the one delivery-eligibility service rather than this
  // component calling `isDeliverable` itself. The badge's behaviour is unchanged — `deliverable`
  // is computed from the vendor's current prefixes either way — but the header and checkout can no
  // longer drift apart, which is the failure this consolidation exists to prevent.
  const deliveryPrefixes = profile?.deliveryPrefixes ?? [];
  const storedPostcode = cookieStore.get(DELIVERY_POSTCODE_COOKIE)?.value ?? null;
  const deliverable = storedPostcode ? await isPostcodeDeliverable(storedPostcode) : null;
  const offerCollection = profile?.offerCollection ?? false;

  // #748 — one resolved answer for the whole render. Both LocationControl
  // instances and the cart drawer read this same value, so they cannot disagree.
  const fulfilmentMethod = await getFulfilmentMethod();
  // #890 — the drawer's minimum and free-delivery prompts use this shopper's own area's rules.
  const deliveryRules = await getShopperDeliveryRules(profile, fulfilmentMethod);

  // P8.5a (#345): routed through the request-memoised reader so the header and
  // a product grid on the same page share ONE getSummary() call. The identity
  // guard and the EMPTY_CART fallback moved inside it unchanged.
  const cartSummary = await getRequestCartSummary();
  // #239: this fallback was itself Aheed copy ("vine tomatoes, halal lamb
  // chops, basmati, lentils"). It only fires when no vendor resolves at all —
  // fetchVendorProfile already substitutes DEFAULT_SEARCH_PLACEHOLDER for a
  // vendor with none — but a platform default naming one vendor's trade is the
  // same defect this slice exists to remove.
  const searchPlaceholder = profile?.searchPlaceholder ?? "Search products…";
  // #1131 — the search bar's department selector. The vendor's visible categories straight from the
  // database (request-memoised, so a page that also reads the tree shares the one query), which is
  // what makes a new department appear and a hidden one disappear with no code change. #1169 — the
  // whole tree, so subcategories are offered under their department. The portal renders no search
  // bar, so it skips the read.
  const searchDepartments = isPortal
    ? []
    : toSearchDepartments(await getCategoryRepository().listTree());
  const { CDN_BASE_URL } = getEnv();
  const logoUrl =
    profile?.logoStorageKey && CDN_BASE_URL
      ? composePublicUrl(CDN_BASE_URL, profile.logoStorageKey)
      : null;

  // #1069 — the mark's 192px PNG for the header below `md`, or null.
  const markUrl = markUrls(profile?.markStorageKey, CDN_BASE_URL)?.icon192 ?? null;

  // #960 — three SIBLINGS, not one sticky <header> wrapping everything. The whole header used to
  // be sticky, and at phone widths that pinned 234px (a third of the screen) over the product
  // grid. Only the logo/nav row and the phone search row stay pinned now; the trust banner and
  // the phone location row scroll away with the page.
  //
  // They must be siblings: a `position: sticky` element sticks only within its parent's box, so a
  // sticky row inside a non-sticky <header> would scroll off with it. The parent here is the
  // layout's full-height flex column (StorefrontChrome / the admin layout), so the <header>
  // sticks for the whole page. `display: contents` on an outer <header> was rejected: it has a
  // history of dropping element semantics in shipped browsers, and this is the banner landmark.
  // The data-header-* attributes are stable hooks for scripts/verify-mobile-layout.ts.
  return (
    <>
      {/* Top Banner - Delivery Promise & Trust bar (scrolls away) */}
      <div data-header-banner="" className="bg-primary text-white text-xs py-1.5 px-4">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
          {/* P7.5c+f (#239): both lines used to be Aheed's. The first named a
              trade ("Local Grocery & Self-Delivery") and the second was a
              literal halal claim, so SriMart — an electronics shop in Reading —
              advertised certified halal meat. The first is now derived from
              vendor data alone; the second is that vendor's own bannerNote, and
              renders nothing at all when they have none. */}
          <div className="flex items-center gap-4 text-white/90">
            <span className="flex items-center gap-1 font-medium text-white">
              <Icon name="sparkles" className="w-3.5 h-3.5 text-amber-300" />
              {/* #1078 — the vendor's own headline, or the line derived from its name and area. */}
              {bannerHeadlineText({
                bannerHeadline: profile?.bannerHeadline ?? null,
                name,
                localityName,
                offerCollection: profile?.offerCollection ?? false,
              })}
            </span>
            {bannerNote && (
              <>
                <span className="hidden md:inline text-white/50">|</span>
                <span className="hidden md:inline-flex items-center gap-1">
                  <Icon name="map-pin" className="w-3.5 h-3.5 text-action-tint" />
                  {bannerNote}
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-3 text-xs">
            {/* #1077 — deliberately NOT hidden below `md` like bannerNote above. A phone number is
                least useful on the one device that can dial it, and this banner scrolls away rather
                than staying pinned (#960), so the extra wrapped line costs no sticky height. */}
            {bannerPhoneHref && (
              <a
                href={bannerPhoneHref}
                aria-label={`Call ${name}`}
                className="flex items-center gap-1 text-white/80 hover:text-white px-2 py-0.5 rounded font-medium text-[11px]"
              >
                <Icon name="phone" className="w-3 h-3 text-action-tint" />
                <span>{bannerPhone}</span>
              </a>
            )}
            <Link
              href="/help"
              className="flex items-center gap-1 text-white/80 hover:text-white px-2 py-0.5 rounded font-medium text-[11px]"
            >
              <Icon name="circle-question-mark" className="w-3 h-3 text-action-tint" />
              <span>Help Guide</span>
            </Link>
          </div>
        </div>
      </div>

      <header className="sticky top-0 z-40 bg-white border-b border-black/10 shadow-sm">
        {/* Main Nav Header */}
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          {/* Brand Logo. h-10 overflow-clip caps this container at the logo's own
            height so a third-party browser extension's content script injecting
            an element inside it (confirmed: Coupert, #333) cannot stretch it and
            reflow the row. Deliberately NOT applied to the row or <nav> below —
            ViewSwitcher's dropdown (components/layout/ViewSwitcher.tsx) renders
            below the row via `absolute top-full` and an ancestor overflow-clip
            would cut it off. */}
          {/* #982 — `min-w-0` replaces `shrink-0` here. `shrink-0` was not what protected the
            Coupert case above (that is `h-10 overflow-clip`), but it did forbid this block from
            giving way, so a long logo-less wordmark widened the whole page instead of clipping.
            The logo itself now carries `shrink-0`, so the logo path keeps its exact footprint. */}
          <div className="flex items-center gap-3 min-w-0 h-10 md:h-16 overflow-clip">
            <Link
              href={isPortal ? "/staff" : "/"}
              className="flex min-w-0 items-center gap-2.5 group text-left"
              data-header-brand=""
            >
              <HeaderBrand
                name={name}
                localityName={localityName}
                logoUrl={logoUrl}
                markUrl={markUrl}
              />
            </Link>
          </div>

          {/* Location Control (Desktop) */}
          {!isPortal && (
            <div className="hidden sm:block h-full">
              <LocationControl
                postcode={storedPostcode}
                deliverable={deliverable}
                offerCollection={offerCollection}
                method={fulfilmentMethod}
              />
            </div>
          )}

          {/* Search — inline from `xl` only (#1131). With the department select added, the shared
            row (logo, location, search, nav) left the field 9px wide at 768 and 81px at 1024,
            measured with scripts/verify-mobile-layout.ts; below `xl` the bar takes the full-width
            row under this one instead. #1142 — the Quick Shop link sits directly after the bar,
            outside its form, in one flex container with it. `lg` was measured again once the
            method menu replaced the toggle pair: the input was 163px at 1024, still too narrow. */}
          {!isPortal && (
            <div className="flex-1 min-w-0 max-w-3xl hidden xl:flex items-stretch gap-2">
              <DepartmentSearchBar
                departments={searchDepartments}
                placeholder={searchPlaceholder}
                className="min-w-0 flex-1"
              />
              <ShoppingListLink />
            </div>
          )}

          {/* Action Controls & Navigation */}
          <nav aria-label="Main Navigation" className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            {/* #496 — the landing page's header had no path at all to the
              catalogue: "Shop List" was deliberately hidden there (P8.5f), and
              the only other route in was the hero's rotating per-department
              "Shop {Department}" button. This stays visible on every non-portal
              route, landing included — and since #1131 so does the Quick Shop
              link, which #1142 moved beside the search bar. */}
            {!isPortal && (
              <Link
                href="/categories"
                className="flex min-h-tap min-w-tap justify-center lg:min-h-0 lg:min-w-0 items-center gap-1.5 bg-surface-muted hover:bg-black/5 text-black/80 px-2 sm:px-3 py-2 rounded-xl text-xs font-bold transition border border-black/10"
                title="Browse all departments"
              >
                <Icon name="store" className="w-4 h-4 text-primary" />
                <span className="hidden sm:inline">Shop</span>
              </Link>
            )}

            {/* Account / Sign In & Sign Out Controls */}
            {user ? (
              <Link
                href="/account"
                className="flex min-h-tap min-w-tap justify-center lg:min-h-0 lg:min-w-0 items-center gap-1.5 bg-surface-muted hover:bg-black/5 p-1 pr-3 rounded-xl border border-black/10 transition-colors text-xs font-bold text-black/80 hover:text-primary"
              >
                <div className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-[10px] font-bold">
                  {firstName?.charAt(0) ?? <Icon name="user" className="h-3.5 w-3.5" />}
                </div>
                <span className="hidden sm:inline">{firstName}</span>
              </Link>
            ) : (
              <Link
                href="/login"
                className="flex min-h-tap min-w-tap justify-center lg:min-h-0 lg:min-w-0 items-center gap-1.5 bg-surface-muted hover:bg-black/5 text-black/80 px-3 py-2 rounded-xl text-xs font-bold transition border border-black/10"
              >
                {/* #1173 — the account symbol, matching the round signed-in avatar. */}
                <Icon name="circle-user-round" className="w-4 h-4 text-primary" />
                <span className="hidden sm:inline">Sign In</span>
              </Link>
            )}

            {/* Cart Trigger */}
            {!isPortal && (
              <CartDrawerShell
                itemCount={cartSummary.itemCount}
                subtotalPence={cartSummary.subtotalPence}
              >
                <CartContents
                  summary={cartSummary}
                  method={fulfilmentMethod}
                  minimumOrderPence={deliveryRules.minimumOrderPence}
                  freeDeliveryThresholdPence={deliveryRules.freeDeliveryThresholdPence}
                  localityName={localityName}
                  cdnBaseUrl={CDN_BASE_URL ?? ""}
                  showViewCartLink
                />
              </CartDrawerShell>
            )}

            {/* View Switcher (Anchored Far Right) */}
            {isStaffOrAdmin && (
              <div className="border-l border-black/10 pl-2 ml-1">
                <ViewSwitcher
                  canSeeAdmin={canSeeAdmin}
                  currentTier={currentTier}
                  isPortal={isPortal}
                />
              </div>
            )}
          </nav>
        </div>

        {/* Mobile search row — stays pinned with the logo/nav row (#960). #979: pb-1.5, not pb-3.
            The search input grew 6px to the 44px `tap` size below `lg`, and this row gives those
            6px back so the product grid does not move. #1131: shown up to `xl` (was `sm`), because
            the department search bar no longer fits inline below `xl`. #1142: the Quick Shop
            link sits beside the bar here too, in the same row, so it adds no height. */}
        {!isPortal && (
          <div className="mx-auto flex max-w-7xl items-stretch gap-2 px-4 pb-1.5 xl:hidden">
            <DepartmentSearchBar
              departments={searchDepartments}
              placeholder={searchPlaceholder}
              className="min-w-0 flex-1"
            />
            <ShoppingListLink />
          </div>
        )}
      </header>

      {/* Mobile location row — below the pinned header, scrolls away (#960). From `sm` the
          same control sits inline in the pinned row instead. */}
      {!isPortal && (
        <div data-header-location="" className="bg-white px-4 py-2 sm:hidden">
          <LocationControl
            postcode={storedPostcode}
            deliverable={deliverable}
            offerCollection={offerCollection}
            method={fulfilmentMethod}
          />
        </div>
      )}
    </>
  );
}
