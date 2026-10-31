import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentVendorProfile } from "@/lib/vendor-service";
import { getPlatformBrandingEnv } from "@/lib/config";
import { PageContainer } from "@/components/layout/PageContainer";
import { Icon } from "@/components/icons/Icon";
import { IconMedallion } from "@/components/icons/IconMedallion";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const profile = await getCurrentVendorProfile();
  const vendorName = profile?.name ?? "Aheed Food Centre";
  return {
    title: `Third-Party Credits & Licences — ${vendorName}`,
    description: `Licensing information and attributions for the third-party libraries, icons and artwork used at ${vendorName}.`,
  };
}

interface ThirdPartyLibrary {
  name: string;
  spdx: string;
  author: string;
  sourceUrl: string;
  licenseUrl: string;
  usage: string;
  notice: string;
}

const THIRD_PARTY_LIBRARIES: ThirdPartyLibrary[] = [
  {
    name: "Lucide Icons",
    spdx: "ISC License",
    author: "Lucide Icons & Contributors (derived from Feather by Cole Bemis)",
    sourceUrl: "https://github.com/lucide-icons/lucide",
    licenseUrl: "https://github.com/lucide-icons/lucide/blob/main/LICENSE",
    usage: "Functional interface controls, direction indicators, search, and system actions.",
    notice:
      "Licensed under the ISC License. Copyright (c) 2026 Lucide Icons and Contributors. Feather Icons portions Copyright (c) 2013-present Cole Bemis under the MIT License.",
  },
  {
    name: "Google Noto Emoji",
    spdx: "Apache-2.0",
    author: "Google Inc.",
    sourceUrl: "https://github.com/googlefonts/noto-emoji",
    licenseUrl: "https://www.apache.org/licenses/LICENSE-2.0",
    usage: "Full-colour department artwork, grocery illustrations, and category accents.",
    notice:
      "Licensed under the Apache License, Version 2.0 (the 'License'). You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0.",
  },
  {
    name: "Phosphor Icons",
    spdx: "MIT License",
    author: "Helena Zhang & Tobias Fried",
    sourceUrl: "https://github.com/phosphor-icons/core",
    licenseUrl: "https://github.com/phosphor-icons/core/blob/main/LICENSE",
    usage: "Duotone loyalty badges, trust indicators, and secondary status markers.",
    notice: "Licensed under the MIT License. Copyright (c) 2026 Phosphor Icons.",
  },
  {
    name: "Simple Icons",
    spdx: "CC0-1.0",
    author: "Simple Icons Collaborators",
    sourceUrl: "https://simpleicons.org",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    usage:
      "Official payment method brand marks (Visa, Mastercard, American Express, Apple Pay, Google Pay).",
    notice:
      "Dedicated to the public domain under CC0 1.0 Universal. Brand names and logos remain the registered trademarks of their respective owners.",
  },
];

const GENERATED_ICONS = [
  { id: "cart-add", name: "My Cart", description: "Supermarket trolley with 3D basket depth" },
  { id: "storefront", name: "Storefront", description: "Department directory and shop navigator" },
  { id: "quick-shop", name: "Quick Shop", description: "Fast ordering and shopping list bag" },
  {
    id: "contact-follow",
    name: "Contact & Follow Hub",
    description: "Customer care and social channels cluster",
  },
  {
    id: "user-profile",
    name: "User Profile",
    description: "Shopper account and membership avatar",
  },
  { id: "delivery-van", name: "Delivery Van", description: "Local fast grocery delivery van" },
  {
    id: "postcode-search",
    name: "Postcode Checker",
    description: "Map pin with magnifier delivery check",
  },
  {
    id: "halal-certified",
    name: "Halal Certified Badge",
    description: "Authentic HMC 100% Halal certification",
  },
  {
    id: "secure-checkout",
    name: "Secure Checkout Shield",
    description: "Stripe-backed encrypted payment shield",
  },
  {
    id: "order-updates",
    name: "Notification Bell",
    description: "Order progress and dispatch notifications",
  },
  {
    id: "rewards-coin",
    name: "Gold Loyalty Coin",
    description: "Customer reward points and tokens",
  },
  { id: "rewards-gift", name: "Wrapped Gift Box", description: "Promotional loyalty reward gift" },
];

export default async function IconCreditsPage() {
  const profile = await getCurrentVendorProfile();
  const vendorName = profile?.name ?? "Aheed Food Centre";
  const { PLATFORM_NAME: platformName } = getPlatformBrandingEnv();

  return (
    <PageContainer width="standard" className="text-primary">
      {/* Breadcrumb Navigation */}
      <nav aria-label="Breadcrumb" className="mb-6 text-xs text-primary-muted">
        <Link href="/" className="hover:underline">
          Home
        </Link>{" "}
        / <span className="text-primary font-medium">Third-Party Credits</span>
      </nav>

      {/* Page Header */}
      <header className="border-b border-black/10 pb-6 mb-8">
        <h1 className="text-3xl font-extrabold tracking-tight">Third-Party Credits & Licences</h1>
        <p className="mt-2 text-sm text-primary-muted leading-relaxed max-w-2xl">
          We believe in attribution and transparency. Below is a comprehensive record of all
          third-party libraries, icon sets and generated artwork that enhance {vendorName}.
        </p>
      </header>

      <div className="space-y-10">
        {/* Section 1: Generated & Custom Icons */}
        <section aria-labelledby="generated-icons-heading" className="space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-black/10 pb-2">
            <h2 id="generated-icons-heading" className="text-xl font-bold tracking-tight">
              Generated & Custom 3D Icons
            </h2>
            <span
              data-testid="platform-powered-badge"
              className="inline-flex items-center gap-1.5 rounded-full bg-action/10 px-3 py-1 text-xs font-semibold text-action"
            >
              Powered by {platformName}
            </span>
          </div>

          <p className="text-sm text-primary-muted leading-relaxed">
            All 3D storefront illustrations, interactive hub controls, and animated vector icons are
            custom-engineered vector assets rendered via inline theme-aware SVGs and{" "}
            <strong>Powered by {platformName}</strong>.
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
            {GENERATED_ICONS.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 rounded-xl border border-black/10 bg-surface-muted/50 p-3"
              >
                <div className="shrink-0">
                  <IconMedallion icon3d={item.id} size={32} decorative />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold truncate text-primary">{item.name}</p>
                  <p className="text-[11px] text-primary-muted truncate">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Section 2: Third-Party Open Source Libraries */}
        <section aria-labelledby="third-party-icons-heading" className="space-y-4">
          <div className="border-b border-black/10 pb-2">
            <h2 id="third-party-icons-heading" className="text-xl font-bold tracking-tight">
              Third-Party Icon Libraries
            </h2>
            <p className="text-xs text-primary-muted mt-1">
              Third-party open-source projects used under their respective open-source licenses.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {THIRD_PARTY_LIBRARIES.map((lib) => (
              <article
                key={lib.name}
                className="flex flex-col justify-between rounded-xl border border-black/10 bg-white p-5 shadow-xs"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-base font-bold text-primary">{lib.name}</h3>
                    <span className="inline-block rounded-md bg-surface-muted px-2 py-0.5 text-[11px] font-mono font-medium text-primary-muted border border-black/5">
                      {lib.spdx}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-primary-muted">
                    <strong>Author:</strong> {lib.author}
                  </p>
                  <p className="mt-2 text-xs text-primary-muted leading-relaxed">
                    <strong>Usage:</strong> {lib.usage}
                  </p>
                  <p className="mt-2 text-[11px] text-primary-muted italic leading-relaxed bg-surface-muted/60 p-2.5 rounded-lg border border-black/5">
                    {lib.notice}
                  </p>
                </div>

                <div className="mt-4 flex items-center gap-3 pt-3 border-t border-black/5 text-xs">
                  <a
                    href={lib.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-semibold text-action hover:underline"
                  >
                    <span>Source Repository</span>
                    <Icon name="external-link" className="h-3 w-3" />
                  </a>
                  <span className="text-primary-muted">·</span>
                  <a
                    href={lib.licenseUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-semibold text-action hover:underline"
                  >
                    <span>Licence Notice</span>
                    <Icon name="external-link" className="h-3 w-3" />
                  </a>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* Raw Plaintext Manifest Link */}
        <aside className="rounded-xl border border-black/10 bg-surface-muted p-4 text-xs text-primary-muted flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p className="font-semibold text-primary">Looking for complete raw licence texts?</p>
            <p className="text-primary-muted mt-0.5">
              You can inspect the full, verbatim licence manifests bundled with this application.
            </p>
          </div>
          <a
            href="/third-party-icon-licenses.txt"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-white px-3 py-2 font-bold text-primary shadow-xs border border-black/10 hover:bg-black/5 transition-colors"
          >
            <Icon name="copy" className="h-3.5 w-3.5" />
            <span>View Raw Licences</span>
          </a>
        </aside>
      </div>
    </PageContainer>
  );
}
