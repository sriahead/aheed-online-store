"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  previewTemplateAction,
  resetTemplateAction,
  saveTemplateAction,
  sendTestTemplateAction,
} from "./actions";

export interface EditorField {
  field: string;
  label: string;
  limit: number;
  defaultText: string;
  multiline: boolean;
}

interface Preview {
  subject: string;
  preheader: string;
  html: string;
}

/**
 * #1564 R11 — the wording form beside a live preview. The preview is rendered on the server by the
 * same code that sends the email, so what an admin sees is what customers get. Reset asks for a
 * second click instead of a browser dialog.
 */
export function TemplateEditor({
  templateKey,
  fields,
  placeholders,
  saved,
  initialPreview,
  adminEmail,
}: {
  templateKey: string;
  fields: EditorField[];
  placeholders: string[];
  saved: Record<string, string>;
  initialPreview: Preview;
  adminEmail: string;
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f.field, saved[f.field] ?? ""])),
  );
  const [preview, setPreview] = useState<Preview>(initialPreview);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [pending, startTransition] = useTransition();
  const firstRender = useRef(true);

  // Debounced live preview: re-render on the server 400ms after typing stops.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const timer = setTimeout(async () => {
      const result = await previewTemplateAction(templateKey, values);
      if (result.ok) setPreview(result);
    }, 400);
    return () => clearTimeout(timer);
  }, [templateKey, values]);

  function update(field: string, value: string) {
    setValues((v) => ({ ...v, [field]: value }));
    setNotice(null);
    setErrors((e) => {
      const next = { ...e };
      delete next[field];
      return next;
    });
  }

  function save() {
    startTransition(async () => {
      const result = await saveTemplateAction(templateKey, values);
      if (result.ok) {
        setErrors({});
        setNotice({
          ok: true,
          text: result.reset
            ? "Saved. Every field is blank, so this email uses the default wording."
            : "Saved. New emails use this wording.",
        });
      } else {
        setErrors((result.errors as Record<string, string>) ?? {});
        setNotice({ ok: false, text: result.error ?? "Please fix the highlighted fields." });
      }
    });
  }

  function sendTest() {
    startTransition(async () => {
      const result = await sendTestTemplateAction(templateKey, values);
      setNotice({ ok: result.ok, text: result.message });
    });
  }

  function reset() {
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }
    setConfirmReset(false);
    startTransition(async () => {
      const result = await resetTemplateAction(templateKey);
      if (result.ok) {
        setValues(Object.fromEntries(fields.map((f) => [f.field, ""])));
        setErrors({});
        setNotice({ ok: true, text: "Reset. This email now uses the default wording." });
      } else {
        setNotice({ ok: false, text: result.error ?? "Could not reset." });
      }
    });
  }

  const inputClass =
    "mt-1 w-full rounded-xl border border-black/20 bg-white px-3 py-2 text-sm text-primary placeholder:text-primary-muted";

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div>
        <p className="mb-4 rounded-xl bg-surface-muted px-3 py-2 text-xs text-primary-muted">
          You can use {placeholders.join(", ")}. They are filled in for each customer. Text only:
          HTML is shown as typed. Wrap words in **double asterisks** to make them bold in the intro,
          reassurance and sign-off.
        </p>
        {fields.map((f) => {
          const id = `tpl-${f.field}`;
          const value = values[f.field] ?? "";
          const error = errors[f.field];
          const common = {
            id,
            value,
            placeholder: f.defaultText,
            maxLength: f.limit + 50,
            "aria-invalid": error ? true : undefined,
            "aria-describedby": error ? `${id}-error` : undefined,
            className: `${inputClass}${error ? " border-danger" : ""}`,
          };
          return (
            <div key={f.field} className="mb-4">
              <label
                htmlFor={id}
                className="flex justify-between text-sm font-semibold text-primary"
              >
                <span>{f.label}</span>
                <span
                  className={`text-xs font-normal ${value.length > f.limit ? "text-danger" : "text-primary-muted"}`}
                >
                  {value.length}/{f.limit}
                </span>
              </label>
              {f.multiline ? (
                <textarea {...common} rows={3} onChange={(e) => update(f.field, e.target.value)} />
              ) : (
                <input {...common} type="text" onChange={(e) => update(f.field, e.target.value)} />
              )}
              {error && (
                <p id={`${id}-error`} className="mt-1 text-xs font-semibold text-danger">
                  {error}
                </p>
              )}
            </div>
          );
        })}

        {notice && (
          <p
            role="status"
            className={`mb-4 rounded-lg p-2.5 text-xs font-medium ${
              notice.ok ? "bg-action/10 text-action" : "bg-danger-tint text-danger"
            }`}
          >
            {notice.text}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="rounded-xl bg-action px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "Working…" : "Save"}
          </button>
          <button
            type="button"
            onClick={sendTest}
            disabled={pending}
            className="rounded-xl border border-black/20 bg-white px-4 py-2 text-sm font-semibold text-primary hover:bg-surface-muted disabled:opacity-50"
          >
            Send test to {adminEmail}
          </button>
          <button
            type="button"
            onClick={reset}
            disabled={pending}
            className="rounded-xl border border-black/20 bg-white px-4 py-2 text-sm font-semibold text-danger hover:bg-danger-tint disabled:opacity-50"
          >
            {confirmReset ? "Click again to reset" : "Reset to default"}
          </button>
        </div>
      </div>

      <div>
        <div className="mb-2 rounded-xl border border-black/10 bg-white px-3 py-2 text-sm">
          <p className="font-semibold text-primary">{preview.subject}</p>
          <p className="text-xs text-primary-muted">{preview.preheader}</p>
        </div>
        <iframe
          title="Email preview"
          srcDoc={preview.html}
          sandbox=""
          className="h-[900px] w-full rounded-xl border border-black/10 bg-white"
        />
        <p className="mt-2 text-xs text-primary-muted">
          Preview with sample order and customer details. Links in the preview are disabled.
        </p>
      </div>
    </div>
  );
}
