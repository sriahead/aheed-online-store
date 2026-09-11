import type { ParseResult } from "@/lib/catalogue-form";

export interface BrandColourInput {
  bannerNote: string | null;
  heroSubtitle: string | null;
  brandGreenDark?: string;
  brandGreen?: string;
  brandOrange?: string;
  brandRed?: string;
  brandCream?: string;
  brandGreenTint?: string;
  brandOrangeTint?: string;
  brandRedTint?: string;
}

export interface BrandColourFormState {
  error: string | null;
  field: string | null;
  saved: boolean;
}

export const initialBrandColourState: BrandColourFormState = {
  error: null,
  field: null,
  saved: false,
};

const HEX = /^#[0-9a-fA-F]{6}$/;

function parseHex(raw: string | undefined | null, field: string, label: string): ParseResult<string | undefined> {
  if (!raw) return { ok: true, value: undefined };
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: true, value: undefined };

  if (!HEX.test(trimmed)) {
    return {
      ok: false,
      error: { field, message: `${label} must be a 6-digit hex colour, e.g. #2e4d26` },
    };
  }

  return { ok: true, value: trimmed };
}

export function parseBrandColourForm(formData: FormData): ParseResult<BrandColourInput> {
  const bannerNote = formData.get("bannerNote") as string;
  const heroSubtitle = formData.get("heroSubtitle") as string;
  
  const fields = [
    { key: "brandGreenDark", label: "Primary Brand Color (Dark)" },
    { key: "brandGreen", label: "Primary Brand Color" },
    { key: "brandOrange", label: "Secondary Color" },
    { key: "brandRed", label: "Accent Color" },
    { key: "brandCream", label: "Background Color" },
    { key: "brandGreenTint", label: "Primary Tint" },
    { key: "brandOrangeTint", label: "Secondary Tint" },
    { key: "brandRedTint", label: "Accent Tint" },
  ];

  const parsed: Partial<BrandColourInput> = {
    bannerNote: bannerNote || null,
    heroSubtitle: heroSubtitle || null,
  };

  for (const { key, label } of fields) {
    const value = formData.get(key) as string;
    const result = parseHex(value, key, label);
    if (!result.ok) return result;
    if (result.value !== undefined) {
      (parsed as any)[key] = result.value;
    }
  }

  return { ok: true, value: parsed as BrandColourInput };
}
