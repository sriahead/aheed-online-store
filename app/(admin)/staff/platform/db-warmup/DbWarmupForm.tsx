"use client";

import { useActionState, useState } from "react";
import { saveDbWarmupAction } from "./actions";
import type { DbWarmupField, DbWarmupFormState } from "@/lib/db-warmup/form";

export interface DbWarmupFormValues {
  enabled: boolean;
  mode: string;
  activityEnabled: boolean;
  activityMinutes: number;
  leadMinutes: number;
  customStart: string;
  customEnd: string;
  computeUnits: string;
  pricePerCuHour: string;
}

const MODE_LABELS: Record<string, string> = {
  OPENING_HOURS: "During store opening hours (recommended)",
  ALWAYS: "Always (around the clock)",
  CUSTOM: "A fixed daily window",
  ACTIVITY_ONLY: "Only after signed-in activity",
};

const input =
  "w-full rounded-xl border border-black/20 bg-white px-3 py-2 text-sm text-primary focus:border-action focus:outline-none";

function FieldError({ state, field }: { state: DbWarmupFormState; field: DbWarmupField }) {
  if (state.status !== "error" || !state.fieldErrors?.[field]) return null;
  return <p className="mt-1 text-xs font-semibold text-danger">{state.fieldErrors[field]}</p>;
}

export function DbWarmupForm({ initial }: { initial: DbWarmupFormValues }) {
  const [state, formAction, pending] = useActionState(saveDbWarmupAction, { status: "idle" });
  const [mode, setMode] = useState(initial.mode);

  return (
    <form action={formAction} className="space-y-5">
      <label className="flex items-center gap-2 text-sm font-semibold text-primary">
        <input type="checkbox" name="enabled" defaultChecked={initial.enabled} />
        Warm-up on
      </label>

      <div>
        <label htmlFor="mode" className="mb-1 block text-sm font-medium text-primary">
          When to keep the database warm
        </label>
        <select
          id="mode"
          name="mode"
          defaultValue={initial.mode}
          onChange={(e) => setMode(e.target.value)}
          className={input}
        >
          {Object.entries(MODE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <FieldError state={state} field="mode" />
      </div>

      {mode === "OPENING_HOURS" && (
        <div>
          <label htmlFor="leadMinutes" className="mb-1 block text-sm font-medium text-primary">
            Start this many minutes before opening
          </label>
          <input
            id="leadMinutes"
            name="leadMinutes"
            type="number"
            min={0}
            max={120}
            defaultValue={initial.leadMinutes}
            className={input}
          />
          <FieldError state={state} field="leadMinutes" />
        </div>
      )}
      {mode !== "OPENING_HOURS" && (
        <input type="hidden" name="leadMinutes" value={initial.leadMinutes} />
      )}

      {mode === "CUSTOM" ? (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="customStart" className="mb-1 block text-sm font-medium text-primary">
              From (London time)
            </label>
            <input
              id="customStart"
              name="customStart"
              type="time"
              defaultValue={initial.customStart}
              className={input}
            />
            <FieldError state={state} field="customStart" />
          </div>
          <div>
            <label htmlFor="customEnd" className="mb-1 block text-sm font-medium text-primary">
              Until (London time)
            </label>
            <input
              id="customEnd"
              name="customEnd"
              type="time"
              defaultValue={initial.customEnd}
              className={input}
            />
            <FieldError state={state} field="customEnd" />
          </div>
        </div>
      ) : (
        <>
          <input type="hidden" name="customStart" value={initial.customStart} />
          <input type="hidden" name="customEnd" value={initial.customEnd} />
        </>
      )}

      <div className="rounded-xl border border-black/10 p-4">
        <label className="flex items-center gap-2 text-sm font-semibold text-primary">
          <input type="checkbox" name="activityEnabled" defaultChecked={initial.activityEnabled} />
          Also keep warm after signed-in activity
        </label>
        <label
          htmlFor="activityMinutes"
          className="mb-1 mt-3 block text-sm font-medium text-primary"
        >
          For this many minutes after the last signed-in request
        </label>
        <input
          id="activityMinutes"
          name="activityMinutes"
          type="number"
          min={5}
          max={240}
          defaultValue={initial.activityMinutes}
          className={input}
        />
        <FieldError state={state} field="activityMinutes" />
        <p className="mt-2 text-xs text-primary-muted">
          Helps someone who pauses on a page (reading, writing a reply) for more than 5 minutes, and
          staff working outside opening hours. It cannot help the first visitor after a quiet spell:
          nobody was active to trigger it.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="computeUnits" className="mb-1 block text-sm font-medium text-primary">
            Minimum compute size (CU), from the Neon console
          </label>
          <input
            id="computeUnits"
            name="computeUnits"
            type="number"
            min={0.25}
            max={16}
            step={0.25}
            defaultValue={initial.computeUnits}
            className={input}
          />
          <FieldError state={state} field="computeUnits" />
        </div>
        <div>
          <label htmlFor="pricePerCuHour" className="mb-1 block text-sm font-medium text-primary">
            Price per CU-hour (USD), for the estimate
          </label>
          <input
            id="pricePerCuHour"
            name="pricePerCuHour"
            type="number"
            min={0.000001}
            step="any"
            defaultValue={initial.pricePerCuHour}
            className={input}
          />
          <FieldError state={state} field="pricePerCuHour" />
        </div>
      </div>

      {state.status === "error" && (
        <p className="text-sm font-semibold text-danger">{state.message}</p>
      )}
      {state.status === "saved" && (
        <p className="text-sm font-semibold text-action">
          Saved. The scheduler picks it up within 4 minutes.
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-2xl bg-action px-6 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
