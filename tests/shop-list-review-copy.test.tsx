// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ListReview } from "@/components/cart/ListReview";
import type { ResolvedLine } from "@/lib/shopping-list";

/**
 * #1077 R14/R15 — the two shop-list affordances the owner's testing pass flagged.
 *
 * NEW FILE because neither component had one: `tests/shopping-list*.test.ts` all cover the pure
 * parsing and matching modules, not what the review step puts on screen. The defects here were
 * both in rendered copy, which is precisely what those pure tests cannot see.
 *
 * `ShopYourList` itself is NOT rendered here. It is a client component whose first hook is
 * `useActionState` bound to a `"use server"` action, so mounting it in jsdom would drag a server
 * action into a unit test to assert the ORDER OF TWO ELEMENTS. R14 is checked against the source
 * instead — see the second case, which reads the file rather than the DOM and says why.
 */

afterEach(cleanup);

const AMBIGUOUS_LINE: ResolvedLine = {
  original: "apple juice",
  terms: ["apple", "juice"],
  quantity: 1,
  measure: null,
  brand: null,
  resolution: {
    kind: "ambiguous",
    candidates: [
      {
        id: "p-1",
        name: "Apple Juice 1L",
        slug: "apple-juice-1l",
        unitLabel: "1L",
        basePrice: 180,
        stock: 4,
      },
      {
        id: "p-2",
        name: "Apple Juice 2L",
        slug: "apple-juice-2l",
        unitLabel: "2L",
        basePrice: 320,
        stock: 2,
      },
    ],
  },
};

describe("ListReview ambiguous-line select (#1077 R15)", () => {
  it("names both the choice and the skip, and keeps the empty skip value", () => {
    render(<ListReview lines={[AMBIGUOUS_LINE]} />);

    const select = screen.getByRole("combobox", { name: /choose a product for "apple juice"/i });
    const first = select.querySelector("option");

    // The empty value is load-bearing: it IS the skip, read positionally by
    // features/cart/add-list-to-cart.ts. Renaming the label must not change it.
    expect(first?.getAttribute("value")).toBe("");

    const label = first?.textContent ?? "";
    expect(label).toMatch(/choose|select/i);
    expect(label).toMatch(/skip/i);
  });
});

describe("ShopYourList hint placement (#1077 R14)", () => {
  /**
   * Source order, not DOM order, and deliberately so — see this file's header for why mounting
   * `ShopYourList` is the wrong trade here. The property under test is static: whichever branch of
   * the example/neutral conditional renders, the hint is authored above the textarea, so no runtime
   * state can reorder them. A reader checking this by eye should look for the `<p>` carrying
   * "Quantities are understood" sitting before `<textarea id="list"`.
   */
  it("authors the quantities hint before the textarea", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("components/cart/ShopYourList.tsx", "utf8");

    const hintAt = source.indexOf("Quantities are understood");
    const textareaAt = source.indexOf("<textarea");

    expect(hintAt).toBeGreaterThan(-1);
    expect(textareaAt).toBeGreaterThan(-1);
    expect(hintAt).toBeLessThan(textareaAt);
  });
});

/**
 * #1088 (R9, R10) — the review step says what will be skipped, and carries each line's own text so
 * the action can name it afterwards.
 */

const MATCHED_IN_STOCK: ResolvedLine = {
  original: "milk 2",
  terms: ["milk"],
  quantity: 2,
  measure: null,
  brand: null,
  resolution: {
    kind: "matched",
    product: {
      id: "p-10",
      name: "Whole Milk 2L",
      slug: "whole-milk-2l",
      unitLabel: "2L",
      basePrice: 150,
      stock: 9,
    },
  },
};

const MATCHED_OUT_OF_STOCK: ResolvedLine = {
  ...MATCHED_IN_STOCK,
  original: "butter",
  resolution: {
    kind: "matched",
    product: {
      id: "p-11",
      name: "Salted Butter 250g",
      slug: "salted-butter-250g",
      unitLabel: "250g",
      basePrice: 220,
      stock: 0,
    },
  },
};

const UNMATCHED: ResolvedLine = {
  original: "quinoa",
  terms: ["quinoa"],
  quantity: 1,
  measure: null,
  brand: null,
  resolution: { kind: "unmatched" },
};

const named = (name: string) => [...document.querySelectorAll(`input[name="${name}"]`)];

describe("ListReview submitted fields (#1088 R9, superseded by #1090)", () => {
  const ALL_FOUR = [MATCHED_IN_STOCK, AMBIGUOUS_LINE, MATCHED_OUT_OF_STOCK, UNMATCHED];
  const values = (name: string) =>
    [...document.querySelectorAll(`[name="${name}"]`)].map(
      (el) => (el as HTMLInputElement | HTMLSelectElement).value,
    );

  it("#1090 R1: every line emits all four positional fields, whatever its resolution", () => {
    // #1088 asserted 2 here: the out-of-stock and unmatched rows emitted nothing, which kept the
    // arrays aligned but left /cart silent about them. Every row now emits all four.
    render(<ListReview lines={ALL_FOUR} />);

    // productId: three hidden inputs and one select.
    expect(document.querySelectorAll('[name="productId"]')).toHaveLength(4);
    expect(named("quantity")).toHaveLength(4);
    expect(named("lineLabel")).toHaveLength(4);
    expect(named("lineStatus")).toHaveLength(4);
  });

  it("#1090 R1: the submitted form data is aligned, four values per field", () => {
    const { container } = render(<ListReview lines={ALL_FOUR} />);
    const data = new FormData(container.querySelector("form")!);

    for (const field of ["productId", "quantity", "lineLabel", "lineStatus"]) {
      expect(data.getAll(field)).toHaveLength(4);
    }
  });

  it("#1090 R2: each line kind emits its own status, label and product", () => {
    render(<ListReview lines={ALL_FOUR} />);

    expect(values("lineStatus")).toEqual(["ready", "choose", "unavailable", "unmatched"]);
    // The out-of-stock line is named by the matched product, the name its row shows.
    expect(values("lineLabel")).toEqual(["milk 2", "apple juice", "Salted Butter 250g", "quinoa"]);
    // In-stock id, the unresolved select's empty value, then the two lines that can never be added.
    expect(values("productId")).toEqual(["p-10", "", "", ""]);
    expect(values("quantity")).toEqual(["2", "1", "2", "1"]);
  });

  it("carries each line's own text, in render order", () => {
    render(<ListReview lines={[MATCHED_IN_STOCK, AMBIGUOUS_LINE]} />);

    expect(named("lineLabel").map((el) => (el as HTMLInputElement).value)).toEqual([
      "milk 2",
      "apple juice",
    ]);
  });

  it("emits the label unconditionally, not only while a line is unresolved", () => {
    // A hidden input gated on the component's selection state would report a line the shopper DID
    // resolve as skipped whenever the select changes without React.
    render(<ListReview lines={[AMBIGUOUS_LINE]} />);
    expect(named("lineLabel")).toHaveLength(1);

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "p-1" } });
    expect(named("lineLabel")).toHaveLength(1);
  });

  it("#1090 R3: the status and label do not change with the shopper's selection", () => {
    render(<ListReview lines={[AMBIGUOUS_LINE]} />);
    const before = [named("lineStatus"), named("lineLabel")].map((els) =>
      els.map((el) => (el as HTMLInputElement).value),
    );

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "p-1" } });

    const after = [named("lineStatus"), named("lineLabel")].map((els) =>
      els.map((el) => (el as HTMLInputElement).value),
    );
    expect(after).toEqual(before);
    expect(after).toEqual([["choose"], ["apple juice"]]);
  });
});

describe("ListReview skipped-line warning (#1088 R10)", () => {
  const warning = () => screen.queryByText(/will be skipped unless you choose an item/);

  it("names one unresolved line, singular", () => {
    render(<ListReview lines={[AMBIGUOUS_LINE]} />);
    expect(warning()?.textContent).toBe("1 line will be skipped unless you choose an item");
  });

  it("counts more than one, plural", () => {
    render(
      <ListReview lines={[AMBIGUOUS_LINE, { ...AMBIGUOUS_LINE, original: "orange juice" }]} />,
    );
    expect(warning()?.textContent).toBe("2 lines will be skipped unless you choose an item");
  });

  it("disappears once the shopper chooses", () => {
    render(<ListReview lines={[AMBIGUOUS_LINE]} />);
    expect(warning()).not.toBeNull();

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "p-1" } });

    expect(warning()).toBeNull();
  });

  it("is absent when no line is ambiguous, including rows that were never addable", () => {
    render(<ListReview lines={[MATCHED_IN_STOCK, MATCHED_OUT_OF_STOCK, UNMATCHED]} />);
    // An out-of-stock or unmatched row is already labelled on its own row, so counting it here
    // would double-report it.
    expect(warning()).toBeNull();
  });
});
