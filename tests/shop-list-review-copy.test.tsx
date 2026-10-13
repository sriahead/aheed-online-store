// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
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
