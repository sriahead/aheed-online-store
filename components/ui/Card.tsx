import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";

/**
 * The shared card surface primitive (#656).
 *
 * Server component ONLY — no `"use client"` here or anywhere in `components/ui/`.
 * Progressive enhancement is load-bearing in this app (server-rendered forms
 * posting to server actions, GET-form search and filters), and a primitive
 * that forced a client boundary onto every card would remove that.
 *
 * `variant="default"` is the padded white panel duplicated as the literal
 * string `rounded-2xl border border-black/10 bg-white p-5` across the staff
 * panel's admin pages (`app/(admin)/staff/brands/page.tsx`,
 * `.../customers/page.tsx`, `.../delivery-areas/page.tsx`, and others not
 * migrated in this slice — R9 asks for at least three adopters, not a
 * repo-wide sweep).
 *
 * `variant="product"` is `components/product/ProductCard.tsx`'s skewed card
 * shell: no padding (the image sits flush to the edge), `overflow-hidden` so
 * the counter-skewed `.skew-card-inner` content doesn't spill past the
 * rounded corners, and `.skew-card` + Tailwind's `group` for the shared
 * hover motion and image-zoom/title-colour triggers — the exact classes
 * `components/bundle/BundleCard.tsx` already carries on a plain `<div>`
 * (`app/globals.css`'s `.skew-card*` rules are class-keyed with no tag
 * selectors, so this needs no CSS change). `position: relative` is part of
 * this variant because the product card's stretched-link title needs a
 * positioned ancestor for its `after:absolute after:inset-0` overlay to
 * size against the whole card rather than just the title's own box.
 */

type CardVariant = "default" | "product";

const BASE = "rounded-2xl border border-black/10 bg-white";

const VARIANT_CLASS: Record<CardVariant, string> = {
  default: `${BASE} p-5`,
  product: `${BASE} skew-card group relative flex h-full cursor-pointer flex-col overflow-hidden hover:border-action/50`,
};

type CardProps<T extends ElementType> = {
  /** Which element to render as — `"div"`, `"li"`, `"section"`, etc. Defaults to `"div"`. */
  as?: T;
  variant?: CardVariant;
  className?: string;
  children?: ReactNode;
} & Omit<ComponentPropsWithoutRef<T>, "as" | "className" | "children">;

export function Card<T extends ElementType = "div">({
  as,
  variant = "default",
  className,
  children,
  ...rest
}: CardProps<T>) {
  const Tag = (as ?? "div") as ElementType;
  const classes = [VARIANT_CLASS[variant], className].filter(Boolean).join(" ");

  return (
    <Tag className={classes} {...rest}>
      {children}
    </Tag>
  );
}
