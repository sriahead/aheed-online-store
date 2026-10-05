import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

/**
 * #958 — every field that collects the shopper's own data carries its HTML `autocomplete` token.
 * WCAG 2.2 SC 1.3.5 (Identify Input Purpose, AA) requires it, and it is what lets a phone offer a
 * saved name, address or password in one tap. Nothing else fails when a token is dropped: the form
 * still submits, so this reads the source. Rule: docs/developer-portal/app-conventions.md.
 */

const root = join(__dirname, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

/** Each `<input … />` element in the file, in document order. */
function inputElements(source: string): string[] {
  return [...source.matchAll(/<input\b[\s\S]*?\/>/g)].map((m) => m[0]);
}

function tokenOf(element: string): string | null {
  return element.match(/autoComplete="([^"]*)"/)?.[1] ?? null;
}

describe("auth forms", () => {
  const forms: Record<string, string[]> = {
    "features/auth/components/LoginForm.tsx": ["email", "current-password"],
    "features/auth/components/RegisterForm.tsx": ["name", "email", "new-password"],
    "features/auth/components/ResetPasswordForm.tsx": ["new-password"],
    "features/auth/components/ForgotPasswordForm.tsx": ["email"],
  };

  it.each(Object.entries(forms))("%s carries its tokens in document order", (path, expected) => {
    expect(inputElements(read(path)).map(tokenOf)).toEqual(expected);
  });
});

describe("checkout form", () => {
  const expected: Record<string, string> = {
    recipientName: "name",
    email: "email",
    phone: "tel",
    line1: "address-line1",
    line2: "address-line2",
    city: "address-level2",
    county: "address-level1",
    postcode: "postal-code",
    // Not the shopper's data: a code the browser remembers from elsewhere is noise here.
    discountCode: "off",
  };
  const inputs = inputElements(read("components/checkout/CheckoutForm.tsx"));

  it.each(Object.entries(expected))("%s carries %s", (name, token) => {
    const element = inputs.find((input) => input.includes(`name="${name}"`));
    expect(element, `no <input name="${name}"> in CheckoutForm.tsx`).toBeDefined();
    expect(tokenOf(element!)).toBe(token);
  });
});

// #966 — the header's postcode checker. `Header.tsx` mounts `LocationControl` twice (inline from
// `sm`, and the phone row), so this one element is both postcode inputs a page shows.
describe("header postcode checker", () => {
  it("LocationControl's postcode input carries postal-code", () => {
    const inputs = inputElements(read("components/layout/LocationControl.tsx"));
    const element = inputs.find((input) => input.includes('name="postcode"'));
    expect(element, 'no <input name="postcode"> in LocationControl.tsx').toBeDefined();
    expect(tokenOf(element!)).toBe("postal-code");
  });
});
