"use client";

import { useActionState, type ReactNode } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import {
  createAttribute,
  createAttributeOption,
  deleteAttribute,
  deleteAttributeOption,
  renameAttribute,
  renameAttributeOption,
} from "@/features/admin/attributes";
import { initialCatalogueState } from "@/lib/catalogue-form";
import { confirmDeleteLabel } from "@/lib/attribute-form";
import type { AttributeOptionRow, AttributeRow } from "@/lib/repositories/attributes";
import { inputClass, labelClass } from "@/lib/form-classes";
import { Button } from "@/components/ui/Button";

/**
 * Product-filter admin forms (#912), modelled on `BrandManager.tsx`.
 *
 * Client components ONLY for `useActionState`, which puts a server action's error beside the form
 * that caused it; every form is a real `<form action={...}>` and submits without JavaScript.
 * `initialCatalogueState` and `confirmDeleteLabel` come from plain modules, never from the
 * `"use server"` actions file (a value export there 500s every action at runtime, #159).
 *
 * DELETE NEEDS A TICK WHEN IN USE, NOT A DIALOG. A filter or value that products carry shows a
 * required "Also remove it from N products" checkbox, so the consequence is stated in the form
 * itself; the server refuses without it too. No browser `confirm()`: it would be invisible to a
 * no-JavaScript submit and to the curl-driven checks this panel is validated with.
 *
 * Slugs are shown read-only: a rename keeps them, so shoppers' shared `attr_*` links survive.
 * Colours are semantic tokens per design-system.md, never raw hex.
 */

const DELETE_BUTTON_CLASS =
  "inline-flex items-center justify-center gap-2 rounded-2xl border border-danger px-4 py-2 " +
  "text-sm font-semibold text-danger transition hover:bg-danger-tint disabled:cursor-not-allowed " +
  "disabled:opacity-60";

function Feedback({ state }: { state: typeof initialCatalogueState }) {
  if (state.error) {
    return (
      <p role="alert" className="mt-2 text-sm text-danger">
        {state.error}
      </p>
    );
  }
  if (state.saved) {
    return <p className="mt-2 text-sm text-primary-muted">Saved.</p>;
  }
  return null;
}

function usage(productCount: number): string {
  return `${productCount} ${productCount === 1 ? "product" : "products"}`;
}

/**
 * #918 — the filter's TYPE is chosen here and never again: a list filter's values have no number
 * mapping. The unit applies to a number filter only; the action discards it for a list filter.
 */
export function AddAttributeForm() {
  const [state, action, pending] = useActionState(createAttribute, initialCatalogueState);

  return (
    <form action={action} className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
      <div className="flex-1">
        <label className={labelClass} htmlFor="new-attribute-name">
          Filter name
        </label>
        <input
          id="new-attribute-name"
          name="name"
          placeholder="Filter name"
          maxLength={40}
          className={inputClass}
          required
        />
      </div>
      <div className="sm:w-44">
        <label className={labelClass} htmlFor="new-attribute-kind">
          Type
        </label>
        <select id="new-attribute-kind" name="kind" defaultValue="LIST" className={inputClass}>
          <option value="LIST">Pick from a list</option>
          <option value="NUMBER">Number</option>
        </select>
      </div>
      <div className="sm:w-44">
        <label className={labelClass} htmlFor="new-attribute-unit">
          Unit (number filters only, optional)
        </label>
        <input
          id="new-attribute-unit"
          name="unit"
          placeholder="e.g. W"
          maxLength={10}
          className={inputClass}
        />
      </div>
      <Button disabled={pending}>
        <Plus className="h-4 w-4" aria-hidden="true" />
        {pending ? "Adding…" : "Add filter"}
      </Button>
      <div className="sm:sr-only">
        <Feedback state={state} />
      </div>
    </form>
  );
}

/**
 * Rename-and-position form shared by a filter and a value: both take a name and a 0–999 position,
 * and differ only in the action and the hidden id they submit.
 */
function RenameForm({
  action,
  idName,
  id,
  name,
  sortOrder,
  pending,
  children,
}: {
  action: (form: FormData) => void;
  idName: "attributeId" | "optionId";
  id: string;
  name: string;
  sortOrder: number;
  pending: boolean;
  /** #918 — a filter's extra fields (unit, show on cards), saved with its name and position. */
  children?: ReactNode;
}) {
  return (
    <form action={action} className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
      <input type="hidden" name={idName} value={id} />
      <div className="flex-1">
        <label className={labelClass} htmlFor={`rename-${id}`}>
          Name
        </label>
        <input
          id={`rename-${id}`}
          name="name"
          defaultValue={name}
          maxLength={40}
          className={inputClass}
          required
        />
      </div>
      <div className="sm:w-28">
        <label className={labelClass} htmlFor={`position-${id}`}>
          Position
        </label>
        <input
          id={`position-${id}`}
          name="sortOrder"
          type="number"
          min={0}
          max={999}
          step={1}
          defaultValue={sortOrder}
          className={inputClass}
          required
        />
      </div>
      {children}
      <Button disabled={pending}>
        <Save className="h-4 w-4" aria-hidden="true" />
        {pending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}

function DeleteForm({
  action,
  idName,
  id,
  productCount,
  label,
  pending,
}: {
  action: (form: FormData) => void;
  idName: "attributeId" | "optionId";
  id: string;
  productCount: number;
  label: string;
  pending: boolean;
}) {
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name={idName} value={id} />
      {productCount > 0 && (
        <label className="flex items-center gap-2 text-sm text-primary">
          <input type="checkbox" name="confirmDelete" required />
          {confirmDeleteLabel(productCount)}
        </label>
      )}
      <button type="submit" disabled={pending} className={DELETE_BUTTON_CLASS}>
        <Trash2 className="h-4 w-4" aria-hidden="true" />
        {pending ? "Deleting…" : label}
      </button>
    </form>
  );
}

function OptionRow({ option }: { option: AttributeOptionRow }) {
  const [renameState, renameAction, renaming] = useActionState(
    renameAttributeOption,
    initialCatalogueState,
  );
  const [deleteState, deleteAction, deleting] = useActionState(
    deleteAttributeOption,
    initialCatalogueState,
  );

  return (
    <li className="flex flex-col gap-3 border-t border-black/10 pt-3">
      <p className="text-xs text-primary-muted">
        <code>{option.slug}</code> · {usage(option.productCount)}
      </p>
      <RenameForm
        action={renameAction}
        idName="optionId"
        id={option.id}
        name={option.name}
        sortOrder={option.sortOrder}
        pending={renaming}
      />
      <Feedback state={renameState} />
      <DeleteForm
        action={deleteAction}
        idName="optionId"
        id={option.id}
        productCount={option.productCount}
        label="Delete value"
        pending={deleting}
      />
      <Feedback state={deleteState} />
    </li>
  );
}

function AddOptionForm({ attributeId }: { attributeId: string }) {
  const [state, action, pending] = useActionState(createAttributeOption, initialCatalogueState);

  return (
    <form action={action} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <input type="hidden" name="attributeId" value={attributeId} />
      <div className="flex-1">
        <label className={labelClass} htmlFor={`new-option-${attributeId}`}>
          New value
        </label>
        <input
          id={`new-option-${attributeId}`}
          name="name"
          placeholder="Value"
          maxLength={40}
          className={inputClass}
          required
        />
      </div>
      <Button disabled={pending}>
        <Plus className="h-4 w-4" aria-hidden="true" />
        {pending ? "Adding…" : "Add value"}
      </Button>
      <div className="sm:sr-only">
        <Feedback state={state} />
      </div>
    </form>
  );
}

/** One filter: its rename/position and delete forms, its values, and an add-value form. */
export function AttributeCard({ attribute }: { attribute: AttributeRow }) {
  const [renameState, renameAction, renaming] = useActionState(
    renameAttribute,
    initialCatalogueState,
  );
  const [deleteState, deleteAction, deleting] = useActionState(
    deleteAttribute,
    initialCatalogueState,
  );

  const isNumber = attribute.kind === "NUMBER";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold text-primary">{attribute.name}</h3>
        <p className="text-xs text-primary-muted">
          {isNumber ? "Number filter" : "List filter"} · <code>attr_{attribute.slug}</code> ·{" "}
          {usage(attribute.productCount)}
        </p>
      </div>

      <RenameForm
        action={renameAction}
        idName="attributeId"
        id={attribute.id}
        name={attribute.name}
        sortOrder={attribute.sortOrder}
        pending={renaming}
      >
        {isNumber && (
          <div className="sm:w-28">
            <label className={labelClass} htmlFor={`unit-${attribute.id}`}>
              Unit
            </label>
            <input
              id={`unit-${attribute.id}`}
              name="unit"
              defaultValue={attribute.unit ?? ""}
              maxLength={10}
              className={inputClass}
            />
          </div>
        )}
        {/* A plain checkbox saved with the name: unticked submits nothing, which turns it off. */}
        <label className="flex items-center gap-2 text-sm text-primary sm:pb-2">
          <input type="checkbox" name="showOnCard" defaultChecked={attribute.showOnCard} />
          Show on product cards
        </label>
      </RenameForm>
      <Feedback state={renameState} />

      {/* #918 — a number filter holds one number per product, so it has no values to list. */}
      {!isNumber && (
        <>
          <div>
            <h4 className="mb-2 text-sm font-bold text-primary">
              {attribute.options.length === 0 ? "No values yet" : "Values"}
            </h4>
            {attribute.options.length > 0 && (
              <ul className="flex flex-col gap-3">
                {attribute.options.map((option) => (
                  <OptionRow key={option.id} option={option} />
                ))}
              </ul>
            )}
          </div>

          <AddOptionForm attributeId={attribute.id} />
        </>
      )}

      <div className="border-t border-black/10 pt-3">
        <DeleteForm
          action={deleteAction}
          idName="attributeId"
          id={attribute.id}
          productCount={attribute.productCount}
          label="Delete filter"
          pending={deleting}
        />
        <Feedback state={deleteState} />
      </div>
    </div>
  );
}
