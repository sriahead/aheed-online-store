"use client";

import { useActionState } from "react";
import { saveImportSettingsAction } from "@/features/admin/stock-import";
import { PRESET_LABELS, PRESET_NAMES, type PresetName } from "@/lib/stock-import/presets";
import { COLUMN_KEYS, COLUMN_LABELS, type ImportSettingsData } from "@/lib/stock-import/settings";
import { SETTINGS_FORM_IDLE, type SettingsFormText } from "@/lib/stock-import/settings-form";

/** #1578 R1 — the store's import settings: columns, defaults, presets and word lists. */

const input = "rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm text-primary";
const area = `${input} min-h-24 w-full font-mono text-xs`;
const labelClass = "flex flex-col gap-1 text-sm font-semibold text-primary";
const help = "text-xs font-normal text-primary-muted";

function TextList({
  name,
  label,
  hint,
  value,
}: {
  name: keyof SettingsFormText;
  label: string;
  hint: string;
  value: string;
}) {
  return (
    <label className={labelClass}>
      {label}
      <span className={help}>{hint}</span>
      <textarea name={name} defaultValue={value} className={area} />
    </label>
  );
}

export function StockImportSettingsForm({
  settings,
  text,
  categories,
}: {
  settings: ImportSettingsData | null;
  text: SettingsFormText;
  categories: { slug: string; name: string }[];
}) {
  const [state, action, pending] = useActionState(saveImportSettingsAction, SETTINGS_FORM_IDLE);
  const s = settings;
  return (
    <form action={action} className="space-y-6">
      <section className="space-y-3 rounded-3xl border border-black/10 bg-white p-5">
        <h2 className="text-lg font-semibold text-primary">Columns</h2>
        <fieldset className="space-y-1">
          <legend className="text-sm font-semibold text-primary">Column headings</legend>
          <label className="mr-4 text-sm text-primary">
            <input
              type="radio"
              name="headerRow"
              value="AUTO"
              defaultChecked={s?.headerRow === "AUTO"}
            />{" "}
            The file has a heading row: name columns by their heading text
          </label>
          <label className="text-sm text-primary">
            <input
              type="radio"
              name="headerRow"
              value="NONE"
              defaultChecked={s?.headerRow !== "AUTO"}
            />{" "}
            No heading row: name columns by letter (A, B, C …)
          </label>
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-3">
          {COLUMN_KEYS.map((key) => (
            <label key={key} className={labelClass}>
              {COLUMN_LABELS[key]}
              <input name={`col_${key}`} defaultValue={s?.columns[key] ?? ""} className={input} />
            </label>
          ))}
        </div>
      </section>

      <section className="space-y-3 rounded-3xl border border-black/10 bg-white p-5">
        <h2 className="text-lg font-semibold text-primary">Products and names</h2>
        <label className={labelClass}>
          Category for rows that don&apos;t say
          <select
            name="defaultCategory"
            defaultValue={s?.defaultCategorySlug ?? ""}
            className={input}
          >
            <option value="">Choose…</option>
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="space-y-1">
          <legend className="text-sm font-semibold text-primary">Naming and filter rules</legend>
          {PRESET_NAMES.map((p) => (
            <label key={p} className="mr-4 inline-block text-sm text-primary">
              <input
                type="checkbox"
                name={`preset_${p}`}
                defaultChecked={s ? s.presets.includes(p as PresetName) : p === "general"}
              />{" "}
              {PRESET_LABELS[p]}
            </label>
          ))}
        </fieldset>
        <label className={labelClass}>
          Name pattern
          <span className={help}>{"{brand}, {name} and {size}; empty parts are left out."}</span>
          <input
            name="nameTemplate"
            defaultValue={s?.nameTemplate ?? "{brand} {name} – {size}"}
            className={input}
          />
        </label>
        <label className="block text-sm text-primary">
          <input type="checkbox" name="renameMatched" defaultChecked={s?.renameMatched ?? true} />{" "}
          Give matched products the clean name
        </label>
        <label className="block text-sm text-primary">
          <input type="checkbox" name="keepTillWords" defaultChecked={s?.keepTillWords ?? true} />{" "}
          Keep extra words from the till name when the file&apos;s name is shorter
        </label>
        <label className="block text-sm text-primary">
          <input
            type="checkbox"
            name="moveMatchedToCategory"
            defaultChecked={s?.moveMatchedToCategory ?? true}
          />{" "}
          Move matched products into the file&apos;s category
        </label>
      </section>

      <section className="space-y-3 rounded-3xl border border-black/10 bg-white p-5">
        <h2 className="text-lg font-semibold text-primary">Words and spellings</h2>
        <TextList
          name="brandAliases"
          label="Brand spellings"
          hint="One brand per line: the brand as shoppers see it, a colon, then other spellings in your files."
          value={text.brandAliases}
        />
        <TextList
          name="spelling"
          label="Spelling fixes"
          hint="One per line: wrong = right. Applied to whole words in names."
          value={text.spelling}
        />
        <TextList
          name="synonyms"
          label="Words that mean the same product"
          hint="One group per line, separated by commas. Used for matching only."
          value={text.synonyms}
        />
        <div className="grid gap-3 sm:grid-cols-3">
          <TextList
            name="ignoreWords"
            label="Ignore when matching"
            hint="Comma separated."
            value={text.ignoreWords}
          />
          <TextList
            name="noiseWords"
            label="Till clutter"
            hint="Never a product word. Comma separated."
            value={text.noiseWords}
          />
          <TextList
            name="preserveWords"
            label="Keep exactly as written"
            hint="Comma separated."
            value={text.preserveWords}
          />
        </div>
      </section>

      <section className="space-y-3 rounded-3xl border border-black/10 bg-white p-5">
        <h2 className="text-lg font-semibold text-primary">Categories and files</h2>
        <TextList
          name="sectionCategories"
          label="Section headings"
          hint="A row with only a name is a heading. One per line: heading text = category name."
          value={text.sectionCategories}
        />
        <TextList
          name="categoryMap"
          label="Category column"
          hint="One per line: text in the category column = category name. Unlisted text becomes a new, switched-off category."
          value={text.categoryMap}
        />
        <TextList
          name="files"
          label="File rules"
          hint="One per line: word in the file name = Brand | Category. Either side of | may be empty."
          value={text.files}
        />
        <label className={labelClass}>
          Notes
          <textarea name="notes" defaultValue={s?.notes ?? ""} className={area} />
        </label>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-2xl bg-action px-4 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save settings"}
        </button>
        {state.error && (
          <p role="alert" className="text-sm font-semibold text-danger">
            {state.error}
          </p>
        )}
        {state.message && (
          <p role="status" className="text-sm font-semibold text-action">
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}
