import fish from "./presets/fish.json";
import general from "./presets/general.json";
import rice from "./presets/rice.json";
import spices from "./presets/spices.json";
import { stockImportPresetSchema, type StockImportPreset } from "./profile";

/**
 * #1573/#1578 — the shared rule sets, bundled with the code so the staff screen (a Worker) and the
 * CLI read the same ones. A store chooses which apply (`StockImportSettingsPreset` / a profile's
 * `presets`).
 */
export const PRESET_NAMES = ["general", "spices", "rice", "fish"] as const;
export type PresetName = (typeof PRESET_NAMES)[number];

const RAW: Record<PresetName, unknown> = { general, spices, rice, fish };

export const PRESET_LABELS: Record<PresetName, string> = {
  general: "General grocery",
  spices: "Spices and masalas",
  rice: "Rice",
  fish: "Fish",
};

export function isPresetName(name: string): name is PresetName {
  return (PRESET_NAMES as readonly string[]).includes(name);
}

/** The named presets, validated; an unknown name throws so a typo never silently drops rules. */
export function loadPresets(names: readonly string[]): StockImportPreset[] {
  return names.map((name) => {
    if (!isPresetName(name)) throw new Error(`unknown stock-import preset "${name}"`);
    return stockImportPresetSchema.parse(RAW[name]);
  });
}
