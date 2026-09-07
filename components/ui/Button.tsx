import type { ComponentPropsWithoutRef } from "react";
import { buttonClass } from "@/lib/form-classes";

/**
 * The shared submit-control primitive (#656).
 *
 * Server component ONLY — no `"use client"` here or anywhere in
 * `components/ui/`. It renders a plain `<button>`; nothing about it requires
 * a client boundary, so a form using it stays a real progressive-enhancement
 * `<form action={...}>` that works with no JavaScript.
 *
 * `variant="action"` (the default) IS `buttonClass` from `lib/form-classes.ts`
 * — composed, not re-declared (R7) — the small pill submit control already
 * shared by `BrandManager.tsx` and `DeliveryAreaManager.tsx`.
 *
 * `variant="primary"` is the larger `bg-primary` call-to-action shape used at
 * the foot of the catalogue's bigger forms (`ProductForm.tsx`,
 * `CategoryForm.tsx`, `CampaignForm.tsx`). It is NOT one of
 * `lib/form-classes.ts`'s four deduplicated strings (`inputClass`,
 * `labelClass`, `errorInputClass`, `buttonClass`), so declaring it here does
 * not violate R7 — but it is now declared exactly ONCE, here, rather than
 * copied verbatim at each call site the way it was before this primitive
 * existed.
 */

const PRIMARY_CLASS =
  "flex items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-bold " +
  "text-white shadow-md transition active:scale-95 motion-reduce:active:scale-100 " +
  "disabled:cursor-not-allowed disabled:opacity-60";

const VARIANT_CLASS = {
  action: buttonClass,
  primary: PRIMARY_CLASS,
} as const;

type ButtonVariant = keyof typeof VARIANT_CLASS;

type ButtonProps = {
  variant?: ButtonVariant;
  className?: string;
} & Omit<ComponentPropsWithoutRef<"button">, "className">;

export function Button({ variant = "action", className, type = "submit", ...rest }: ButtonProps) {
  const classes = [VARIANT_CLASS[variant], className].filter(Boolean).join(" ");

  return <button type={type} className={classes} {...rest} />;
}
