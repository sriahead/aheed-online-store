// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { FormField } from "@/components/ui/FormField";

/**
 * #650/#656 (R8) — `FormField` must emit `aria-invalid` AND `aria-describedby`
 * TOGETHER when given an error, so the error styling can never be obtained
 * without both. Generalises the `fieldProps(name)` closure that used to be
 * duplicated in `CategoryForm.tsx`/`CampaignForm.tsx`/`BundleForm.tsx` — a
 * red border alone is WCAG SC 1.4.1 (Use of Colour) and SC 3.3.1 (Error
 * Identification): it tells a sighted mouse user which field is wrong and a
 * screen-reader user nothing at all.
 *
 * `vitest.config.mts` sets `environment: "node"` globally, so the docblock at
 * the top opts this file into a DOM — same pattern as
 * `tests/product-card-image.test.tsx`.
 */

afterEach(cleanup);

describe("FormField — error ARIA pairing (R8)", () => {
  it("carries both aria-invalid and aria-describedby when given an error", () => {
    render(<FormField name="name" label="Name" error errorId="form-error" defaultValue="Rice" />);

    const control = screen.getByLabelText("Name");
    expect(control.getAttribute("aria-invalid")).toBe("true");
    expect(control.getAttribute("aria-describedby")).toBe("form-error");
  });

  it("carries neither attribute when there is no error", () => {
    render(<FormField name="name" label="Name" defaultValue="Rice" />);

    const control = screen.getByLabelText("Name");
    expect(control.hasAttribute("aria-invalid")).toBe(false);
    expect(control.hasAttribute("aria-describedby")).toBe(false);
  });

  it("applies the error styling class only when it also carries both ARIA attributes", () => {
    const { rerender } = render(
      <FormField name="name" label="Name" error errorId="form-error" defaultValue="Rice" />,
    );
    let control = screen.getByLabelText("Name");
    // errorInputClass (lib/form-classes.ts) — checked by value here so this
    // test fails if the two ever drift apart, not just if one is missing.
    expect(control.className).toContain("border-danger");
    expect(control.getAttribute("aria-invalid")).toBe("true");
    expect(control.getAttribute("aria-describedby")).toBeTruthy();

    rerender(<FormField name="name" label="Name" defaultValue="Rice" />);
    control = screen.getByLabelText("Name");
    expect(control.className).not.toContain("border-danger");
    expect(control.hasAttribute("aria-invalid")).toBe(false);
    expect(control.hasAttribute("aria-describedby")).toBe(false);
  });

  it("associates the label with the control via htmlFor/id", () => {
    render(<FormField name="email" label="Email address" />);
    expect(screen.getByLabelText("Email address")).toBeTruthy();
  });

  it("supports the select variant with the same error pairing", () => {
    render(
      <FormField name="parentId" as="select" label="Parent" error errorId="form-error">
        <option value="">None</option>
        <option value="a">A</option>
      </FormField>,
    );
    const control = screen.getByLabelText("Parent");
    expect(control.tagName).toBe("SELECT");
    expect(control.getAttribute("aria-invalid")).toBe("true");
    expect(control.getAttribute("aria-describedby")).toBe("form-error");
  });
});
