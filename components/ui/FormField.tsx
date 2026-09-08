import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { errorInputClass, inputClass, labelClass } from "@/lib/form-classes";

/**
 * The shared labelled-control primitive (#656).
 *
 * Server component ONLY — no `"use client"` here or anywhere in
 * `components/ui/`. It renders a plain `<label>` plus `<input>`/`<select>`/
 * `<textarea>`; nothing about it requires a client boundary, so a
 * `useActionState` form using it (the existing `CategoryForm.tsx`,
 * `CampaignForm.tsx`, `BundleForm.tsx` pattern) stays a real
 * progressive-enhancement `<form action={...}>`.
 *
 * Generalises the `fieldProps(name)` closure duplicated in those three
 * files: the className AND the ARIA pair come from one call, so a field
 * cannot be styled as invalid without also being announced as invalid (R8).
 * `errorInputClass` alone is a border and a background tint — on its own it
 * tells a sighted mouse user which field is wrong and a screen-reader user
 * nothing at all (WCAG SC 1.4.1 Use of Colour, SC 3.3.1 Error
 * Identification, #650).
 *
 * `inputClass`/`labelClass`/`errorInputClass` are IMPORTED from
 * `lib/form-classes.ts`, never re-declared (R7).
 *
 * `errorId` mirrors the existing call sites' convention of pointing every
 * invalid field at the form's one shared `role="alert"` error banner
 * (`"category-form-error"` etc.) rather than a per-field message — this
 * primitive does not invent a new error-display shape, it just stops each
 * form from re-typing the association by hand.
 */

type FormFieldOwnProps = {
  /** Also becomes the control's `id`, the label's `htmlFor` target, and the submitted field name. */
  name: string;
  label: ReactNode;
  /** Extra copy under the control, e.g. "(optional)" or help text. */
  hint?: ReactNode;
  /**
   * Whether this is the field an action reported invalid. When true, the
   * control gets `errorInputClass` AND `aria-invalid="true"` AND
   * `aria-describedby={errorId}` together — never one without the others.
   */
  error?: boolean;
  /** Id of the element describing the error (typically the form's shared error banner). */
  errorId?: string;
  as?: "input" | "select" | "textarea";
  className?: string;
  children?: ReactNode;
};

export type FormFieldProps = FormFieldOwnProps &
  Omit<ComponentPropsWithoutRef<"input">, keyof FormFieldOwnProps | "id">;

export function FormField({
  name,
  label,
  hint,
  error = false,
  errorId,
  as = "input",
  className,
  children,
  ...rest
}: FormFieldProps) {
  const controlClassName = [inputClass, error ? errorInputClass : "", className]
    .filter(Boolean)
    .join(" ");

  const shared = {
    id: name,
    name,
    className: controlClassName,
    "aria-invalid": error || undefined,
    "aria-describedby": error ? errorId : undefined,
  };

  return (
    <div>
      <label className={labelClass} htmlFor={name}>
        {label}
      </label>
      {as === "select" ? (
        <select {...shared} {...(rest as ComponentPropsWithoutRef<"select">)}>
          {children}
        </select>
      ) : as === "textarea" ? (
        <textarea {...shared} {...(rest as ComponentPropsWithoutRef<"textarea">)} />
      ) : (
        <input {...shared} {...(rest as ComponentPropsWithoutRef<"input">)} />
      )}
      {hint && <p className="mt-1 text-xs text-primary-muted">{hint}</p>}
    </div>
  );
}
