import { describe, expect, test } from 'vitest';
import { parseBrandColourForm, initialBrandColourState } from '../lib/brand-colour-form';

describe('brand colour validation', () => {
  test('accepts valid hex codes and passes banner/subtitle', () => {
    const formData = new FormData();
    formData.append('brandGreen', '#2e4d26');
    formData.append('brandOrangeTint', '#ffeedd');
    formData.append('bannerNote', 'Test banner');

    const result = parseBrandColourForm(formData);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.brandGreen).toBe('#2e4d26');
      expect(result.value.brandOrangeTint).toBe('#ffeedd');
      expect(result.value.bannerNote).toBe('Test banner');
      expect(result.value.heroSubtitle).toBe(null);
    }
  });

  test('rejects malformed hex codes and never throws', () => {
    const formData = new FormData();
    formData.append('brandGreen', 'green');

    const result = parseBrandColourForm(formData);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.field).toBe('brandGreen');
      expect(result.error.message).toContain('6-digit hex');
    }
  });

  test('rejects 5 digit hex', () => {
    const formData = new FormData();
    formData.append('brandRed', '#ff000');

    const result = parseBrandColourForm(formData);
    expect(result.ok).toBe(false);
  });

  test('accepts empty strings as undefined/null', () => {
    const formData = new FormData();
    formData.append('brandGreen', '');
    formData.append('bannerNote', '');

    const result = parseBrandColourForm(formData);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.brandGreen).toBeUndefined();
      expect(result.value.bannerNote).toBeNull();
    }
  });

  test('exports initial state', () => {
    expect(initialBrandColourState).toEqual({ error: null, field: null, saved: false });
  });
});
