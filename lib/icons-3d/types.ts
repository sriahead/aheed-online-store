import { z } from "zod";

export type ThemeMode = "light" | "dark" | "auto";
export type IconStyle = "3d" | "outline";
export type AnimationType = "float" | "pop" | "pulse" | "none";
export type Icon3DCategory =
  "commerce" | "trust" | "navigation" | "departments" | "rewards" | "general";

export interface Icon3DDefinition {
  id: string;
  name: string;
  category: Icon3DCategory;
  purpose: string;
  recommendedAnim: AnimationType;
  tags: readonly string[];
  render: (palette: ResolvedPalette, idPrefix: string) => string;
}

export interface ResolvedPalette {
  mode: "light" | "dark";
  accent: string;
  accentDark: string;
  accentLight: string;
  surface: string;
  outline: string;
  shadow: string;
  secondary: string;
}

export interface RenderOptions {
  theme?: ThemeMode;
  primaryColor?: string;
  animated?: boolean;
  animSpeed?: number;
  style?: IconStyle;
  idPrefix?: string;
  size?: number;
  label?: string;
  dataIcon?: string;
}

export const ApiIconQuerySchema = z.object({
  theme: z.enum(["light", "dark", "auto"]).default("auto"),
  primaryColor: z
    .string()
    .regex(/^#?[0-9a-fA-F]{6}$/, "Must be a 6-character hex color (e.g. 059669 or #059669)")
    .optional(),
  animated: z
    .enum(["true", "false"])
    .optional()
    .transform((val) => (val === undefined ? true : val === "true")),
  animSpeed: z.coerce.number().min(0.2).max(5.0).default(1.0),
  style: z.enum(["3d", "outline"]).default("3d"),
});

export type ApiIconQueryParams = z.infer<typeof ApiIconQuerySchema>;
