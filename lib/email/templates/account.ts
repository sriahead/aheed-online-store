import type { EmailBrand } from "@/lib/email/layout/brand";
import { finish, orNull, templateCopy, type CopyOverrides, type RenderedEmail } from "./compose";

/**
 * #1564 — the three account emails Better Auth triggers. Each link is Better Auth's own URL (or the
 * store's sign-in page), unchanged; the button carries it and a copyable fallback repeats it for a
 * client that blocks buttons. No name appears: the sign-up form accepts any name next to any email.
 */

export function verifyEmailMessage(input: {
  brand: EmailBrand;
  url: string;
  overrides?: CopyOverrides | null;
}): RenderedEmail {
  const { copy, reason } = templateCopy(
    "auth.verify_email",
    { storeName: input.brand.storeName },
    input.overrides,
  );
  return finish(
    copy.subject,
    {
      preheader: copy.preheader,
      heading: copy.heading,
      intro: orNull(copy.intro),
      cta: { label: copy.ctaLabel || "Confirm my email address", href: input.url },
      fallbackUrl: input.url,
      reassurance: orNull(copy.reassurance),
      signOff: orNull(copy.signOff),
      reason,
    },
    input.brand,
  );
}

export function resetPasswordMessage(input: {
  brand: EmailBrand;
  url: string;
  overrides?: CopyOverrides | null;
}): RenderedEmail {
  const { copy, reason } = templateCopy(
    "auth.reset_password",
    { storeName: input.brand.storeName },
    input.overrides,
  );
  return finish(
    copy.subject,
    {
      preheader: copy.preheader,
      heading: copy.heading,
      intro: orNull(copy.intro),
      cta: { label: copy.ctaLabel || "Choose a new password", href: input.url },
      fallbackUrl: input.url,
      reassurance: orNull(copy.reassurance),
      signOff: orNull(copy.signOff),
      reason,
    },
    input.brand,
  );
}
