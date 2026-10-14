// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { POSTCODE_INTENT_FIELD } from "@/lib/delivery-cookie";

/**
 * `#1087` (R7, R8) — which affordance submits which intent, and whether the stored postcode is
 * readable.
 *
 * WHY THE ACTION MODULE IS MOCKED. `LocationControl` imports `@/features/storefront/delivery`, a
 * `"use server"` module that pulls in `next/headers`, `next/cache` and the eligibility service
 * (and through it Prisma). Mounting the component without mocking it would drag all of that into
 * jsdom to assert the value of a hidden input. The action's own behaviour is proved separately, in
 * `tests/delivery-postcode-intent.test.ts`.
 *
 * WHAT IT CAN AND CANNOT PROVE. It proves the component submits the intent each control means, and
 * that the Delivery label carries the postcode under `COLLECTION`. It cannot prove the round trip —
 * clicking Delivery, typing a postcode and ending up on Delivery — because the action is a stub
 * here. That is `validation.md`'s R3-E2E/R5-E2E in a real browser.
 */

vi.mock("@/features/storefront/delivery", () => ({
  setDeliveryPostcode: vi.fn(),
  setFulfilmentMethod: vi.fn(),
}));

const { LocationControl } = await import("@/components/layout/LocationControl");

/**
 * jsdom (29.1.1, measured) does NOT implement `HTMLDialogElement.showModal`/`close` — the click
 * handler throws `showModal is not a function` without this. The hidden intent field is in the DOM
 * whether or not the dialog is open, so a no-op that just tracks the `open` attribute is enough for
 * everything asserted here.
 */
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
  };
});

afterEach(cleanup);

const intentValue = (container: HTMLElement) =>
  container.querySelector<HTMLInputElement>(`input[name="${POSTCODE_INTENT_FIELD}"]`)?.value;

/** The pencil, which exists only once a postcode is stored. */
const pencil = (postcode: string) =>
  screen.getByLabelText(`Change delivery postcode (currently ${postcode})`);

/**
 * The Delivery control that opens the modal to ask for a postcode.
 *
 * Not `getByRole("button", { name: "Delivery" })`: the responsive pattern renders the word in two
 * spans (`hidden sm:inline` and `sm:hidden`), so its accessible name is the doubled
 * "DeliveryDelivery" and an anchored name match finds nothing. Identified instead by what only it
 * has: Delivery text, no `value` (that is the method toggle's submit button) and no `aria-label`
 * (that is the pencil).
 */
const deliveryAffordance = () => {
  const button = screen
    .getAllByRole("button")
    .find(
      (candidate) =>
        (candidate.textContent ?? "").includes("Delivery") &&
        !candidate.hasAttribute("value") &&
        !candidate.hasAttribute("aria-label"),
    );
  if (!button) throw new Error("no Delivery affordance rendered");
  return button;
};

describe("LocationControl — the submitted intent (R7)", () => {
  it("submits 'delivery' when the modal is opened from the Delivery affordance", () => {
    const { container } = render(
      <LocationControl postcode={null} deliverable={null} offerCollection method="COLLECTION" />,
    );

    fireEvent.click(deliveryAffordance());

    expect(intentValue(container)).toBe("delivery");
  });

  it("submits 'edit' when the modal is opened from the pencil (#748)", () => {
    // A stored-but-undeliverable postcode is the one state where BOTH controls render: the
    // Delivery affordance is still asking for a usable postcode, and the pencil can edit the
    // stored one.
    const { container } = render(
      <LocationControl
        postcode="RG1 1AA"
        deliverable={false}
        offerCollection
        method="COLLECTION"
      />,
    );

    fireEvent.click(pencil("RG1 1AA"));

    expect(intentValue(container)).toBe("edit");
  });

  it("sets the intent per opening rather than defaulting it once", () => {
    const { container } = render(
      <LocationControl
        postcode="RG1 1AA"
        deliverable={false}
        offerCollection
        method="COLLECTION"
      />,
    );

    // Pencil first, so "delivery" afterwards cannot be the initial value going unchanged.
    fireEvent.click(pencil("RG1 1AA"));
    expect(intentValue(container)).toBe("edit");

    fireEvent.click(deliveryAffordance());
    expect(intentValue(container)).toBe("delivery");
  });

  it("submits 'delivery' from the single control a vendor without collection renders", () => {
    const { container } = render(
      <LocationControl postcode="MK9 1AA" deliverable offerCollection={false} method="DELIVERY" />,
    );

    fireEvent.click(deliveryAffordance());

    expect(intentValue(container)).toBe("delivery");
  });
});

describe("LocationControl — the stored postcode is readable (R8)", () => {
  it("shows the postcode on the Delivery control while Click & Collect is the chosen method", () => {
    const { container } = render(
      <LocationControl postcode="MK9 1AA" deliverable offerCollection method="COLLECTION" />,
    );

    const deliveryToggle = container.querySelector<HTMLButtonElement>('button[value="DELIVERY"]');
    expect(deliveryToggle).not.toBeNull();
    expect(deliveryToggle!.textContent).toContain("MK9 1AA");
  });

  it("still shows it under DELIVERY, unchanged from before #1087", () => {
    const { container } = render(
      <LocationControl postcode="MK9 1AA" deliverable offerCollection method="DELIVERY" />,
    );

    const deliveryToggle = container.querySelector<HTMLButtonElement>('button[value="DELIVERY"]');
    expect(deliveryToggle!.textContent).toContain("MK9 1AA");
  });

  it("says just 'Delivery' when no deliverable postcode is stored", () => {
    const { container } = render(
      <LocationControl postcode={null} deliverable={null} offerCollection method="COLLECTION" />,
    );

    expect(container.textContent).not.toContain("·");
  });
});
