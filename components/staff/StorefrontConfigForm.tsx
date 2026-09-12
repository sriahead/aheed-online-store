"use client";

import { useState, useActionState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Theme, VendorBranding, VendorConfig } from "@/lib/repositories/vendor";
import { DEFAULT_BRAND_PRIMITIVES } from "@/lib/repositories/vendor";
import { brandStyle } from "@/lib/vendor-theme";
import {
  applyStorefrontTheme,
  saveStorefrontTheme,
  updateDeliveryRules,
  updateSocialContact,
  updateStorefrontConfig,
} from "@/features/admin/storefront";
import {
  DELIVERY_FEE_FIELD,
  FREE_DELIVERY_THRESHOLD_FIELD,
  MINIMUM_ORDER_FIELD,
  initialDeliveryRulesState,
  penceToPoundsValue,
} from "@/lib/delivery-rules-form";
import {
  FACEBOOK_URL_FIELD,
  INSTAGRAM_URL_FIELD,
  WHATSAPP_NUMBER_FIELD,
  initialSocialContactState,
} from "@/lib/social-contact-form";
import { initialBrandColourState } from "@/lib/brand-colour-form";
import { VendorLogoUploader } from "@/components/staff/VendorLogoUploader";

/** The eight `VendorBranding` brand primitives — every column that is a hex string. */
type BrandColorFieldName =
  | "brandGreenDark"
  | "brandGreen"
  | "brandOrange"
  | "brandRed"
  | "brandCream"
  | "brandGreenTint"
  | "brandOrangeTint"
  | "brandRedTint";

/** #639 — all eight, in the order the form presents them (previously only the first two). */
const BRAND_COLOR_FIELDS = [
  { name: "brandGreenDark", label: "Primary Brand Color (Dark)", placeholder: "e.g. #2e4d26" },
  { name: "brandGreen", label: "Primary Brand Color", placeholder: "e.g. #467339" },
  { name: "brandOrange", label: "Accent Brand Color (Orange)", placeholder: "e.g. #f57c00" },
  { name: "brandRed", label: "Danger Brand Color (Red)", placeholder: "e.g. #d32f2f" },
  { name: "brandCream", label: "Surface Brand Color (Cream)", placeholder: "e.g. #f5f5f0" },
  { name: "brandGreenTint", label: "Primary Tint", placeholder: "e.g. #e8f5e9" },
  { name: "brandOrangeTint", label: "Accent Tint", placeholder: "e.g. #fff3e0" },
  { name: "brandRedTint", label: "Danger Tint", placeholder: "e.g. #ffebee" },
] as const satisfies readonly { name: BrandColorFieldName; label: string; placeholder: string }[];

export function StorefrontConfigForm({
  initialConfig,
  initialBranding,
  initialLocation,
  themes,
  vendorThemes,
  logoUrl,
}: {
  initialConfig: VendorConfig;
  initialBranding: VendorBranding;
  initialLocation: {
    addressLine1: string;
    addressLine2: string | null;
    city: string;
    postcode: string;
  } | null;
  themes: Theme[];
  vendorThemes: { id: string; name: string }[];
  logoUrl: string | null;
}) {
  const router = useRouter();
  const [themePending, startThemeTransition] = useTransition();
  // We prepend global: or vendor: to the select value to handle both lists natively in the same selector.
  // We don't try to guess the namespace of the initial theme from `initialBranding.themeId` because it's only ever global:
  // (VendorTheme uses no foreign key, see schema.prisma). So if it has a themeId, it's global.
  const [selectedThemeRef, setSelectedThemeRef] = useState(
    initialBranding.themeId ? `global:${initialBranding.themeId}` : "",
  );

  const [offerCollection, setOfferCollection] = useState(initialConfig.offerCollection ?? false);

  const [colors, setColors] = useState<Record<BrandColorFieldName, string>>({
    brandGreenDark: initialBranding.brandGreenDark || "",
    brandGreen: initialBranding.brandGreen || "",
    brandOrange: initialBranding.brandOrange || "",
    brandRed: initialBranding.brandRed || "",
    brandCream: initialBranding.brandCream || "",
    brandGreenTint: initialBranding.brandGreenTint || "",
    brandOrangeTint: initialBranding.brandOrangeTint || "",
    brandRedTint: initialBranding.brandRedTint || "",
  });

  const [prevBranding, setPrevBranding] = useState(initialBranding);
  if (initialBranding !== prevBranding) {
    setPrevBranding(initialBranding);
    setColors({
      brandGreenDark: initialBranding.brandGreenDark || "",
      brandGreen: initialBranding.brandGreen || "",
      brandOrange: initialBranding.brandOrange || "",
      brandRed: initialBranding.brandRed || "",
      brandCream: initialBranding.brandCream || "",
      brandGreenTint: initialBranding.brandGreenTint || "",
      brandOrangeTint: initialBranding.brandOrangeTint || "",
      brandRedTint: initialBranding.brandRedTint || "",
    });
  }

  const [brandingState, saveBranding, brandingPending] = useActionState(
    updateStorefrontConfig,
    initialBrandColourState,
  );

  const [deliveryState, saveDeliveryRules, deliveryPending] = useActionState(
    updateDeliveryRules,
    initialDeliveryRulesState,
  );

  const [socialState, saveSocialContact, socialPending] = useActionState(
    updateSocialContact,
    initialSocialContactState,
  );

  const [savingTheme, setSavingTheme] = useState(false);
  const [saveThemeName, setSaveThemeName] = useState("");
  const [saveThemeError, setSaveThemeError] = useState("");

  const [mainColor, setMainColor] = useState(colors.brandGreen || "#467339");

  function applyTheme() {
    if (!selectedThemeRef) return;
    startThemeTransition(async () => {
      await applyStorefrontTheme(selectedThemeRef);
      router.refresh();
    });
  }

  async function handleSaveTheme() {
    if (!saveThemeName.trim()) {
      setSaveThemeError("Please enter a name for your theme.");
      return;
    }
    setSavingTheme(true);
    setSaveThemeError("");
    const livePrimitives = {
      "green-dark": colors.brandGreenDark || DEFAULT_BRAND_PRIMITIVES["green-dark"],
      green: colors.brandGreen || DEFAULT_BRAND_PRIMITIVES["green"],
      orange: colors.brandOrange || DEFAULT_BRAND_PRIMITIVES["orange"],
      red: colors.brandRed || DEFAULT_BRAND_PRIMITIVES["red"],
      cream: colors.brandCream || DEFAULT_BRAND_PRIMITIVES["cream"],
      "green-tint": colors.brandGreenTint || DEFAULT_BRAND_PRIMITIVES["green-tint"],
      "orange-tint": colors.brandOrangeTint || DEFAULT_BRAND_PRIMITIVES["orange-tint"],
      "red-tint": colors.brandRedTint || DEFAULT_BRAND_PRIMITIVES["red-tint"],
    };
    const result = await saveStorefrontTheme(saveThemeName, livePrimitives);
    if (!result.ok) {
      setSaveThemeError(result.error || "Failed to save theme.");
    } else {
      setSaveThemeName("");
      // It revalidated the page, so vendorThemes will refresh.
    }
    setSavingTheme(false);
  }

  function randomisePalette() {
    const hexToHsl = (hex: string) => {
      let r = parseInt(hex.substring(1, 3), 16) / 255;
      let g = parseInt(hex.substring(3, 5), 16) / 255;
      let b = parseInt(hex.substring(5, 7), 16) / 255;
      let cmin = Math.min(r, g, b),
        cmax = Math.max(r, g, b),
        delta = cmax - cmin,
        h = 0,
        s = 0,
        l = 0;
      if (delta === 0) h = 0;
      else if (cmax === r) h = ((g - b) / delta) % 6;
      else if (cmax === g) h = (b - r) / delta + 2;
      else h = (r - g) / delta + 4;
      h = Math.round(h * 60);
      if (h < 0) h += 360;
      l = (cmax + cmin) / 2;
      s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
      return { h, s: s * 100, l: l * 100 };
    };

    const base = hexToHsl(mainColor);

    // Determine random relationship for accent and danger
    // 1: Complementary (+180)
    // 2: Analogous (+30 or -30)
    // 3: Triadic (+120 or +240)
    // 4: Split-complementary (+150 or +210)
    const relationships = [
      [180, 150],
      [30, 330],
      [120, 240],
      [150, 210],
    ];
    const rel = relationships[Math.floor(Math.random() * relationships.length)];

    // Add some random jitter to the hues to get variety
    const jitterH = () => Math.floor(Math.random() * 20) - 10;
    const jitterS = () => Math.floor(Math.random() * 20) - 10;

    const orangeH = (base.h + rel[0] + jitterH() + 360) % 360;
    const redH = (base.h + rel[1] + jitterH() + 360) % 360;

    const hslToHex = (h: number, s: number, l: number) => {
      s = Math.max(0, Math.min(100, s));
      l = Math.max(0, Math.min(100, l));
      l /= 100;
      const a = (s * Math.min(l, 1 - l)) / 100;
      const f = (n: number) => {
        const k = (n + h / 30) % 12;
        const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
        return Math.round(255 * color)
          .toString(16)
          .padStart(2, "0");
      };
      return `#${f(0)}${f(8)}${f(4)}`;
    };

    setColors({
      brandGreen: mainColor,
      brandGreenDark: hslToHex(base.h, base.s, Math.max(10, base.l - 20)),
      brandOrange: hslToHex(orangeH, Math.min(100, base.s + 20 + jitterS()), 50),
      brandRed: hslToHex(redH, Math.min(100, base.s + 10 + jitterS()), 50),
      brandCream: hslToHex(base.h, 20, 96),
      brandGreenTint: hslToHex(base.h, 30, 92),
      brandOrangeTint: hslToHex(orangeH, 40, 92),
      brandRedTint: hslToHex(redH, 40, 92),
    });
  }

  const livePrimitives = {
    "green-dark": colors.brandGreenDark || DEFAULT_BRAND_PRIMITIVES["green-dark"],
    green: colors.brandGreen || DEFAULT_BRAND_PRIMITIVES["green"],
    orange: colors.brandOrange || DEFAULT_BRAND_PRIMITIVES["orange"],
    red: colors.brandRed || DEFAULT_BRAND_PRIMITIVES["red"],
    cream: colors.brandCream || DEFAULT_BRAND_PRIMITIVES["cream"],
    "green-tint": colors.brandGreenTint || DEFAULT_BRAND_PRIMITIVES["green-tint"],
    "orange-tint": colors.brandOrangeTint || DEFAULT_BRAND_PRIMITIVES["orange-tint"],
    "red-tint": colors.brandRedTint || DEFAULT_BRAND_PRIMITIVES["red-tint"],
  };

  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <VendorLogoUploader currentLogoUrl={logoUrl} />

      {/* #75, #714 — Themes dropdown mixing Global and Vendor themes. */}
      {(themes.length > 0 || vendorThemes.length > 0) && (
        <div className="flex flex-col gap-2 rounded-2xl border border-black/10 p-4">
          <label htmlFor="themeId" className="font-bold text-black">
            Apply a theme
          </label>
          <p className="text-sm text-black/60">
            Choosing a theme copies its colours onto the fields below. You can still adjust any of
            them afterwards.
          </p>
          <div className="flex gap-3">
            <select
              id="themeId"
              name="themeId"
              value={selectedThemeRef}
              onChange={(event) => setSelectedThemeRef(event.target.value)}
              className="rounded-lg border border-black/20 p-3"
            >
              <option value="">Select a theme…</option>
              {themes.length > 0 && (
                <optgroup label="Global Presets">
                  {themes.map((theme) => (
                    <option key={`global:${theme.id}`} value={`global:${theme.id}`}>
                      {theme.name}
                    </option>
                  ))}
                </optgroup>
              )}
              {vendorThemes.length > 0 && (
                <optgroup label="Your Saved Themes">
                  {vendorThemes.map((theme) => (
                    <option key={`vendor:${theme.id}`} value={`vendor:${theme.id}`}>
                      {theme.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            <button
              type="button"
              onClick={applyTheme}
              disabled={themePending || !selectedThemeRef}
              className="rounded-full bg-primary px-6 py-3 font-bold text-white hover:bg-primary/90 disabled:opacity-50"
            >
              {themePending ? "Applying…" : "Apply Theme"}
            </button>
          </div>
        </div>
      )}

      <form action={saveBranding} className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <label htmlFor="heroSubtitle" className="font-bold text-black">
            Hero Subtitle
          </label>
          <input
            id="heroSubtitle"
            name="heroSubtitle"
            type="text"
            defaultValue={initialConfig.heroSubtitle || ""}
            className="rounded-lg border border-black/20 p-3"
            placeholder="e.g. 100% Certified HMC Halal Fresh Meat Cut Daily"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="bannerNote" className="font-bold text-black">
            Banner Note
          </label>
          <input
            id="bannerNote"
            name="bannerNote"
            type="text"
            defaultValue={initialConfig.bannerNote || ""}
            className="rounded-lg border border-black/20 p-3"
            placeholder="e.g. Same-Day Local Dispatch"
          />
        </div>

        {BRAND_COLOR_FIELDS.map((field) => {
          const hasError = brandingState.field === field.name;
          const val = colors[field.name];
          return (
            <div key={field.name} className="flex flex-col gap-2">
              <label htmlFor={field.name} className="font-bold text-black">
                {field.label}
              </label>
              <div className="flex gap-3">
                <input
                  type="color"
                  value={val || "#ffffff"}
                  onChange={(e) => setColors((prev) => ({ ...prev, [field.name]: e.target.value }))}
                  className={`h-[50px] w-[50px] cursor-pointer rounded-lg border p-1 ${
                    hasError ? "border-danger" : "border-black/20"
                  }`}
                />
                <input
                  id={field.name}
                  name={field.name}
                  type="text"
                  value={val}
                  onChange={(e) => setColors((prev) => ({ ...prev, [field.name]: e.target.value }))}
                  className={`flex-1 rounded-lg border p-3 font-mono ${
                    hasError ? "border-danger focus-visible:outline-danger" : "border-black/20"
                  }`}
                  placeholder={field.placeholder}
                />
              </div>
              {hasError && (
                <p className="text-sm font-semibold text-danger">{brandingState.error}</p>
              )}
            </div>
          );
        })}

        <div className="flex items-center justify-end gap-3 pt-2">
          <label htmlFor="mainColorPicker" className="text-sm font-bold text-black">
            Main Colour:
          </label>
          <input
            id="mainColorPicker"
            type="color"
            value={mainColor}
            onChange={(e) => setMainColor(e.target.value)}
            className="h-[40px] w-[40px] cursor-pointer rounded-lg border border-black/20 p-1"
          />
          <button
            type="button"
            onClick={randomisePalette}
            className="rounded-full bg-action-tint px-6 py-2 text-sm font-bold text-action hover:bg-action/10"
          >
            Randomise Colours
          </button>
        </div>

        {/* Live Preview */}
        <div className="mt-4 flex flex-col gap-4 rounded-2xl border border-black/10 p-6">
          <h3 className="font-bold text-black">Live Preview</h3>
          <p className="text-sm text-black/60">
            This shows what your colours will look like to shoppers. Aheed automatically adjusts
            them to guarantee they are readable.
          </p>
          <div
            style={brandStyle(livePrimitives)}
            className="flex flex-col gap-4 rounded-xl border border-black/5 bg-surface-muted p-6"
          >
            {/* Primary / Header style */}
            <div className="flex items-center justify-between rounded-lg bg-primary px-4 py-3 text-white">
              <span className="font-bold">Header / Primary Button</span>
            </div>

            {/* Action text on action tint */}
            <div className="flex flex-col gap-1 rounded-lg bg-action-tint p-4">
              <span className="font-bold text-action">Trust Strip / Info Panel</span>
              <span className="text-sm text-primary-muted">
                This is muted text on the action tint.
              </span>
            </div>

            {/* Error banner */}
            <div className="rounded-lg bg-danger-tint p-4 text-danger">
              <span className="font-bold">Error Banner</span>
            </div>

            {/* Accent badge */}
            <div className="self-start rounded-full bg-accent-tint px-3 py-1 text-sm font-bold text-accent">
              Accent Badge
            </div>
          </div>

          {/* Save as Theme */}
          <div className="mt-4 flex flex-col gap-3 rounded-xl border border-black/5 bg-black/5 p-4">
            <h4 className="font-bold text-black text-sm">Save these colours as a Theme</h4>
            <div className="flex gap-3">
              <input
                type="text"
                placeholder="e.g. Summer Palette"
                value={saveThemeName}
                onChange={(e) => setSaveThemeName(e.target.value)}
                className="flex-1 rounded-lg border border-black/20 p-2 text-sm"
              />
              <button
                type="button"
                onClick={handleSaveTheme}
                disabled={savingTheme || !saveThemeName.trim()}
                className="rounded-lg bg-black px-4 py-2 text-sm font-bold text-white hover:bg-black/80 disabled:opacity-50"
              >
                {savingTheme ? "Saving…" : "Save"}
              </button>
            </div>
            {saveThemeError && (
              <p className="text-sm font-semibold text-danger">{saveThemeError}</p>
            )}
          </div>
        </div>

        <button
          type="submit"
          disabled={brandingPending}
          className="rounded-full bg-primary py-3 font-bold text-white hover:bg-primary/90 disabled:opacity-50"
        >
          {brandingPending ? "Saving…" : "Save Config"}
        </button>
      </form>

      {/* #634 — until this shipped, changing a delivery fee needed a developer
          with database access: VendorConfig carried all three columns and
          prisma/seed.ts was their only writer. A sibling <form>, never nested —
          HTML forbids that, and the two save independently. */}
      <form action={saveDeliveryRules} className="flex flex-col gap-6">
        <div>
          <h2 className="font-bold text-black">Delivery rules</h2>
          <p className="mt-1 text-sm text-black/60">
            What delivery costs and when it is free. These apply to every order at checkout.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="deliveryFee" className="font-bold text-black">
            Delivery fee (£)
          </label>
          <input
            id="deliveryFee"
            name="deliveryFee"
            type="text"
            inputMode="decimal"
            defaultValue={penceToPoundsValue(initialConfig.deliveryFeePence)}
            className={fieldClass(deliveryState.field === DELIVERY_FEE_FIELD)}
            placeholder="e.g. 3.49"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="freeDeliveryThreshold" className="font-bold text-black">
            Free delivery over (£)
          </label>
          <input
            id="freeDeliveryThreshold"
            name="freeDeliveryThreshold"
            type="text"
            inputMode="decimal"
            defaultValue={penceToPoundsValue(initialConfig.freeDeliveryThresholdPence)}
            className={fieldClass(deliveryState.field === FREE_DELIVERY_THRESHOLD_FIELD)}
            placeholder="e.g. 30.00"
          />
          <p className="text-xs text-black/60">
            Leave blank to never offer free delivery. Zero would make every order qualify.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="minimumOrder" className="font-bold text-black">
            Minimum order (£)
          </label>
          <input
            id="minimumOrder"
            name="minimumOrder"
            type="text"
            inputMode="decimal"
            defaultValue={penceToPoundsValue(initialConfig.minimumOrderPence)}
            className={fieldClass(deliveryState.field === MINIMUM_ORDER_FIELD)}
            placeholder="e.g. 0.00"
          />
          <p className="text-xs text-black/60">
            Enter 0.00 for no minimum. A shopper below this cannot check out.
          </p>
        </div>

        <div className="flex items-center gap-3 mt-4">
          <input
            type="checkbox"
            id="offerCollection"
            name="offerCollection"
            checked={offerCollection}
            onChange={(e) => setOfferCollection(e.target.checked)}
            className="h-5 w-5 rounded border-black/20 text-primary focus:ring-primary"
          />
          <label htmlFor="offerCollection" className="font-bold text-black">
            Offer Click & Collect
          </label>
        </div>

        {offerCollection && (
          <div className="flex flex-col gap-4 rounded-xl border border-black/10 bg-surface-muted p-4">
            <h3 className="font-bold text-black">Collection Location</h3>
            <p className="text-sm text-black/60">Where shoppers will collect their orders.</p>

            <div className="flex flex-col gap-2">
              <label htmlFor="collectionAddressLine1" className="text-sm font-bold text-black">
                Address Line 1
              </label>
              <input
                id="collectionAddressLine1"
                name="collectionAddressLine1"
                defaultValue={initialLocation?.addressLine1 ?? ""}
                className={fieldClass(deliveryState.field === "collectionAddressLine1")}
                placeholder="e.g. Unit 4, Market Square"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="collectionAddressLine2" className="text-sm font-bold text-black">
                Address Line 2 (Optional)
              </label>
              <input
                id="collectionAddressLine2"
                name="collectionAddressLine2"
                defaultValue={initialLocation?.addressLine2 ?? ""}
                className="rounded-lg border border-black/20 p-3"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="collectionCity" className="text-sm font-bold text-black">
                City / Town
              </label>
              <input
                id="collectionCity"
                name="collectionCity"
                defaultValue={initialLocation?.city ?? ""}
                className={fieldClass(deliveryState.field === "collectionCity")}
                placeholder="e.g. Milton Keynes"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="collectionPostcode" className="text-sm font-bold text-black">
                Postcode
              </label>
              <input
                id="collectionPostcode"
                name="collectionPostcode"
                defaultValue={initialLocation?.postcode ?? ""}
                className={fieldClass(deliveryState.field === "collectionPostcode")}
                placeholder="e.g. MK9 3QA"
              />
            </div>
          </div>
        )}

        {deliveryState.error && (
          <p className="rounded-xl bg-danger-tint px-4 py-3 text-sm font-medium text-danger">
            {deliveryState.error}
          </p>
        )}
        {deliveryState.saved && !deliveryState.error && (
          <p className="rounded-xl bg-action-tint px-4 py-3 text-sm font-medium text-primary">
            Delivery rules saved.
          </p>
        )}

        <button
          type="submit"
          disabled={deliveryPending}
          className="rounded-full bg-primary py-3 font-bold text-white hover:bg-primary/90 disabled:opacity-50"
        >
          {deliveryPending ? "Saving…" : "Save Delivery Rules"}
        </button>
      </form>

      {/* #407 / #405 — a third sibling <form>, never nested. Leaving a field blank HIDES that
          link on the storefront rather than falling back to a platform account (#239). */}
      <form action={saveSocialContact} className="flex flex-col gap-6">
        <div>
          <h2 className="font-bold text-black">Social &amp; contact links</h2>
          <p className="mt-1 text-sm text-black/60">
            Where shoppers can find you. Leave a field blank to hide that link from your storefront
            — nothing is shown in its place.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="facebookUrl" className="font-bold text-black">
            Facebook page address
          </label>
          <input
            id="facebookUrl"
            name="facebookUrl"
            type="text"
            inputMode="url"
            defaultValue={initialConfig.facebookUrl ?? ""}
            className={fieldClass(socialState.field === FACEBOOK_URL_FIELD)}
            placeholder="e.g. https://www.facebook.com/yourpage"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="instagramUrl" className="font-bold text-black">
            Instagram profile address
          </label>
          <input
            id="instagramUrl"
            name="instagramUrl"
            type="text"
            inputMode="url"
            defaultValue={initialConfig.instagramUrl ?? ""}
            className={fieldClass(socialState.field === INSTAGRAM_URL_FIELD)}
            placeholder="e.g. https://www.instagram.com/yourprofile"
          />
          <p className="text-xs text-black/60">
            Both addresses must start with https:// — anything else is refused.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="whatsappNumber" className="font-bold text-black">
            WhatsApp number
          </label>
          <input
            id="whatsappNumber"
            name="whatsappNumber"
            type="text"
            inputMode="numeric"
            defaultValue={initialConfig.whatsappNumber ?? ""}
            className={fieldClass(socialState.field === WHATSAPP_NUMBER_FIELD)}
            placeholder="e.g. 447700900123"
          />
          <p className="text-xs text-black/60">
            International format, digits only — no plus sign, spaces or dashes. This adds a WhatsApp
            button to your storefront.
          </p>
        </div>

        {socialState.error && (
          <p className="rounded-xl bg-danger-tint px-4 py-3 text-sm font-medium text-danger">
            {socialState.error}
          </p>
        )}
        {socialState.saved && !socialState.error && (
          <p className="rounded-xl bg-action-tint px-4 py-3 text-sm font-medium text-primary">
            Social &amp; contact links saved.
          </p>
        )}

        <button
          type="submit"
          disabled={socialPending}
          className="rounded-full bg-primary py-3 font-bold text-white hover:bg-primary/90 disabled:opacity-50"
        >
          {socialPending ? "Saving…" : "Save Social & Contact Links"}
        </button>
      </form>
    </div>
  );
}

/** Delivery-rule input styling, with the offending field outlined on a refusal. */
function fieldClass(hasError: boolean): string {
  return `rounded-lg border p-3 ${hasError ? "border-danger bg-danger-tint" : "border-black/20"}`;
}
