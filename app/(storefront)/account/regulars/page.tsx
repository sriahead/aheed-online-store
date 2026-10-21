import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getAuth } from "@/lib/auth";
import { REGULARS_PLACEHOLDER_MESSAGE } from "@/lib/regulars";
import { PageContainer } from "@/components/layout/PageContainer";

/**
 * Regulars (#1186) — the placeholder half. See `lib/regulars.ts` for the five decisions the
 * derivation still needs.
 *
 * Authenticated-only, like `/account/favourites` (#232): order history requires an account, so a
 * guest-reachable version of this page could never hold content. The `force-dynamic` is the same
 * rule every session-reading page here follows — it must render per-request, and it keeps
 * `@prisma/client/wasm` (reached through `getAuth`) out of `next build`'s Node-based static
 * prerendering, which cannot load it.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Your regulars" };

export default async function AccountRegularsPage() {
  const session = await (await getAuth()).api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect("/login");
  }

  /* `standard`, not `/account/favourites`'s `wide`: that page is wide because it renders a
     `ProductGrid` and belongs with the other listings. This one renders a sentence, so it sits with
     its account siblings. When the derivation lands and a grid appears here, this width and its row
     in `tests/page-container.test.ts` move to `wide` together — the registry is what makes that an
     explicit decision rather than a drift. */
  return (
    <PageContainer width="standard">
      <Link
        href="/account"
        className="mb-4 inline-flex items-center gap-1 text-sm text-primary-muted hover:text-primary"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
        Your account
      </Link>

      <h1 className="text-xl font-bold text-primary">Your regulars</h1>

      <p className="mt-6 text-sm text-primary-muted">{REGULARS_PLACEHOLDER_MESSAGE}</p>
    </PageContainer>
  );
}
