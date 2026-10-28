"use client";

import { useMemo, useState } from "react";
import { formatMoney, gbp } from "@/lib/pricing/money";
import {
  breakEvenShopsForPayTarget,
  evaluate,
  partnerRateByYear,
  type ModelInputs,
  type PricingModelParams,
} from "@/lib/pricing/volume-model";

/**
 * #1313 - What if: change the partner and volume inputs and see every model recalculated, in the
 * browser, with the same pure functions the server uses. NOTHING IS SAVED: no request, no storage,
 * no URL change. Reloading the page puts the committed defaults back.
 */

export interface WhatIfDefaults {
  ratePence: number | null;
  increaseBps: number | null;
  minutesPerShop: number;
  onboardingMinutes: number;
  payTargetPence: number | null;
  basketPence: number;
  ordersPerShop: number;
  shops: number;
}

type FieldId = keyof WhatIfDefaults;

interface Field {
  id: FieldId;
  label: string;
  /** How a typed number becomes the model's integer: pounds and percentages are x100. */
  scale: 1 | 100;
  optional: boolean;
  integer: boolean;
}

const FIELDS: Field[] = [
  {
    id: "ratePence",
    label: "Partner hourly rate (£)",
    scale: 100,
    optional: false,
    integer: false,
  },
  {
    id: "increaseBps",
    label: "Yearly rate increase (%)",
    scale: 100,
    optional: true,
    integer: false,
  },
  {
    id: "minutesPerShop",
    label: "Partner minutes per shop per month",
    scale: 1,
    optional: false,
    integer: false,
  },
  {
    id: "onboardingMinutes",
    label: "Onboarding minutes per new shop",
    scale: 1,
    optional: false,
    integer: false,
  },
  {
    id: "payTargetPence",
    label: "Partners' monthly pay target (£, both partners)",
    scale: 100,
    optional: true,
    integer: false,
  },
  { id: "basketPence", label: "Average basket (£)", scale: 100, optional: false, integer: false },
  {
    id: "ordersPerShop",
    label: "Orders per shop per month",
    scale: 1,
    optional: false,
    integer: true,
  },
  { id: "shops", label: "Number of shops", scale: 1, optional: false, integer: true },
];

const ERROR = "Enter a number of 0 or more";

function initialText(field: Field, value: number | null): string {
  if (value === null) return "";
  return String(value / field.scale);
}

/** `undefined` = invalid; `null` = empty optional field. */
function parse(field: Field, text: string): number | null | undefined {
  const trimmed = text.trim();
  if (trimmed === "") return field.optional ? null : undefined;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return undefined;
  if (field.integer && !Number.isInteger(n)) return undefined;
  return Math.round(n * field.scale);
}

function money(value: number | null): string {
  return value === null ? "—" : formatMoney(gbp(value));
}

export function PricingWhatIf({
  inputs,
  models,
  defaults,
}: {
  inputs: ModelInputs;
  models: { id: string; name: string; pricing: PricingModelParams }[];
  defaults: WhatIfDefaults;
}) {
  const [text, setText] = useState<Record<FieldId, string>>(
    () =>
      Object.fromEntries(FIELDS.map((f) => [f.id, initialText(f, defaults[f.id])])) as Record<
        FieldId,
        string
      >,
  );

  const parsed = useMemo(
    () => Object.fromEntries(FIELDS.map((f) => [f.id, parse(f, text[f.id])])),
    [text],
  ) as Record<FieldId, number | null | undefined>;
  const valid = FIELDS.every((f) => parsed[f.id] !== undefined);

  const results = useMemo(() => {
    if (!valid) return null;
    const v = parsed as Record<FieldId, number | null>;
    const scenarioInputs: ModelInputs = {
      ...inputs,
      partnerHourlyRatePence: v.ratePence,
      partnerMinutesPerShopMonth: v.minutesPerShop!,
      onboardingMinutesPerShop: v.onboardingMinutes!,
    };
    const scenario = {
      shops: Math.max(1, v.shops!),
      ordersPerShop: v.ordersPerShop!,
      basketPence: v.basketPence!,
    };
    return {
      rates: partnerRateByYear(v.ratePence, v.increaseBps),
      payTarget: v.payTargetPence,
      models: models.map((m) => ({
        id: m.id,
        name: m.name,
        evaluation: evaluate(scenario, m.pricing, scenarioInputs),
        payTargetShops: breakEvenShopsForPayTarget(
          m.pricing,
          { ordersPerShop: scenario.ordersPerShop, basketPence: scenario.basketPence },
          scenarioInputs,
          v.payTargetPence,
        ),
      })),
    };
  }, [valid, parsed, inputs, models]);

  return (
    <div className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
      <p data-costs="what-if-not-saved" className="mb-4 text-sm text-slate-600">
        These figures are not saved. Change any input to recalculate every model in your browser;
        reloading the page restores the committed values.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {FIELDS.map((f) => {
          const invalid = parsed[f.id] === undefined;
          const inputId = `what-if-${f.id}`;
          return (
            <div key={f.id}>
              <label htmlFor={inputId} className="block text-xs font-bold text-slate-700">
                {f.label}
              </label>
              <input
                id={inputId}
                data-what-if-input={f.id}
                type="text"
                inputMode="decimal"
                value={text[f.id]}
                placeholder="Enter a value"
                aria-invalid={invalid}
                aria-describedby={invalid ? `${inputId}-error` : undefined}
                onChange={(e) => setText((t) => ({ ...t, [f.id]: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-black/15 px-2 py-1 text-sm"
              />
              {invalid && (
                <p
                  id={`${inputId}-error`}
                  data-what-if-error={f.id}
                  className="mt-1 text-xs text-rose-700"
                >
                  {ERROR}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 overflow-x-auto">
        <table data-what-if-results className="w-full text-left text-xs">
          <thead className="text-slate-500">
            <tr>
              <th className="py-1 pr-2">Model</th>
              <th className="py-1 pr-2">Shop pays / month</th>
              <th className="py-1 pr-2">Our revenue</th>
              <th className="py-1 pr-2">Our cost</th>
              <th className="py-1 pr-2">Our margin</th>
              <th className="py-1 pr-2">Shops for pay target</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {models.map((m) => {
              const r = results?.models.find((x) => x.id === m.id);
              return (
                <tr key={m.id} data-what-if-row={m.id}>
                  <td className="py-1 pr-2 font-bold">{m.name}</td>
                  <td className="py-1 pr-2" data-what-if-cell="shop-pays">
                    {r ? money(r.evaluation.shopPays.totalPence) : "—"}
                  </td>
                  <td className="py-1 pr-2" data-what-if-cell="revenue">
                    {r ? money(r.evaluation.revenuePence) : "—"}
                  </td>
                  <td className="py-1 pr-2" data-what-if-cell="cost">
                    {r ? money(r.evaluation.cost.totalPence) : "—"}
                  </td>
                  <td className="py-1 pr-2" data-what-if-cell="margin">
                    {r ? money(r.evaluation.marginPence) : "—"}
                  </td>
                  <td className="py-1 pr-2" data-what-if-cell="pay-target">
                    {!results
                      ? "—"
                      : results.payTarget === null
                        ? "Enter a pay target"
                        : r?.payTargetShops == null
                          ? "More than 1,000 shops"
                          : String(r.payTargetShops)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p data-what-if-rates className="mt-3 text-xs text-slate-700">
        Partner rate:{" "}
        {!results
          ? "—"
          : results.rates
              .map((rate, i) =>
                rate === null
                  ? `year ${i + 1}: ${i === 0 ? "—" : "Enter a yearly increase"}`
                  : `year ${i + 1}: ${formatMoney(gbp(rate))} an hour`,
              )
              .join("; ")}
      </p>
    </div>
  );
}
