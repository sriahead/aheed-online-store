import type { ResolvedPalette, ThemeMode } from "./types";

/**
 * Adjust hex color brightness by amount (-255 to +255).
 */
export function adjustColor(hex: string, amount: number): string {
  const clean = hex.replace("#", "").trim();
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return "#059669";
  const num = parseInt(clean, 16);
  const r = Math.max(0, Math.min(255, (num >> 16) + amount));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 255) + amount));
  const b = Math.max(0, Math.min(255, (num & 255) + amount));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

/**
 * Resolve visual palette based on requested theme mode and accent color.
 */
export function resolvePalette(
  themeMode: ThemeMode = "auto",
  customAccent?: string,
): ResolvedPalette {
  const isDark = themeMode === "dark";
  const rawAccent = customAccent?.startsWith("#")
    ? customAccent
    : customAccent
      ? `#${customAccent}`
      : "#059669";
  const accent = /^[#][0-9a-fA-F]{6}$/.test(rawAccent) ? rawAccent : "#059669";

  return {
    mode: isDark ? "dark" : "light",
    accent,
    accentDark: adjustColor(accent, -35),
    accentLight: adjustColor(accent, 45),
    surface: isDark ? "#18212b" : "#ffffff",
    outline: isDark ? "#dbeafe" : "#334155",
    shadow: isDark ? "#020617" : "#64748b",
    secondary: isDark ? "#38bdf8" : "#0284c7",
  };
}
