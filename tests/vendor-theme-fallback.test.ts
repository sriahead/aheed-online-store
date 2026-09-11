import { describe, expect, test } from 'vitest';
import { brandStyle } from '../lib/vendor-theme';
import { DEFAULT_BRAND_PRIMITIVES, type BrandPrimitives } from '../lib/repositories/vendor';

describe('brandStyle fallback logic', () => {
  test('falls back to DEFAULT_BRAND_PRIMITIVES for malformed hex codes', () => {
    // A completely broken primitive object
    const broken: BrandPrimitives = {
      "green-dark": "bad",
      green: "green",
      orange: "#123", // 3-digit is not accepted by our regex
      red: "rgb(0,0,0)",
      cream: "",
      "green-tint": null as any,
      "orange-tint": undefined as any,
      "red-tint": "#abcdef" // this one is valid
    };

    // Should not throw
    const style = brandStyle(broken);
    
    // Check if the valid one is kept
    expect((style as any)['--color-brand-red-tint']).toBe('#abcdef');
    
    // Check if the invalid ones are replaced with defaults
    expect((style as any)['--color-brand-green']).toBe(DEFAULT_BRAND_PRIMITIVES.green);
    expect((style as any)['--color-brand-orange']).toBe(DEFAULT_BRAND_PRIMITIVES.orange);
    expect((style as any)['--color-brand-red']).toBe(DEFAULT_BRAND_PRIMITIVES.red);
    expect((style as any)['--color-brand-cream']).toBe(DEFAULT_BRAND_PRIMITIVES.cream);
  });
});
