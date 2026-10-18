// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { POSTCODE_INTENT_FIELD } from "@/lib/delivery-cookie";
import { setFulfilmentMethod } from "@/features/storefront/delivery";

/**
 * `#1087` (R7, R8) — which affordance submits which intent, and whether the stored postcode is
 * readable. `#1142` — for a vendor that offers collection, those affordances are now items in one
 * `<details data-location-menu>` rather than a toggle pair and a pencil; the cases below keep every
 * behaviour the toggle-pair cases proved and add the menu's own (structure, the current-method
 * check, and the client enhancement that closes it).
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

/**
 * #1091 — every control is addressed by its accessible name, which the component keeps single and
 * independent of the stylesheet (jsdom applies none), so no structural lookup is needed.
 */
const button = (name: string) => screen.getByRole("button", { name });

/** #1142 — the one method menu a vendor with collection renders. */
const menuOf = (container: HTMLElement) => {
  const menus = container.querySelectorAll<HTMLDetailsElement>("details[data-location-menu]");
  expect(menus).toHaveLength(1);
  return menus[0];
};

/** The menu's items, which are everything inside it except its summary. */
const itemsOf = (menu: HTMLDetailsElement) =>
  [...menu.querySelectorAll<HTMLButtonElement>("button")].filter((b) => !b.closest("summary"));

/** A menu item by its accessible name; the summary may share it, so it is excluded first. */
const item = (container: HTMLElement, name: string) => {
  const menu = menuOf(container);
  const matches = within(menu)
    .getAllByRole("button", { name })
    .filter((b) => !b.closest("summary"));
  expect(matches).toHaveLength(1);
  return matches[0];
};

/** The pencil's successor, which exists only once a postcode is stored. */
const changePostcode = (container: HTMLElement) => item(container, "Change postcode");

describe("LocationControl — the submitted intent (R7)", () => {
  it("submits 'delivery' when the modal is opened from the Delivery affordance", () => {
    const { container } = render(
      <LocationControl postcode={null} deliverable={null} offerCollection method="COLLECTION" />,
    );

    fireEvent.click(item(container, "Delivery"));

    expect(intentValue(container)).toBe("delivery");
  });

  it("submits 'edit' when the modal is opened from Change postcode (#748)", () => {
    // A stored-but-undeliverable postcode is the one state where BOTH dialog items render: the
    // Delivery affordance is still asking for a usable postcode, and Change postcode can edit the
    // stored one.
    const { container } = render(
      <LocationControl
        postcode="RG1 1AA"
        deliverable={false}
        offerCollection
        method="COLLECTION"
      />,
    );

    fireEvent.click(changePostcode(container));

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

    // Change postcode first, so "delivery" afterwards cannot be the initial value going unchanged.
    fireEvent.click(changePostcode(container));
    expect(intentValue(container)).toBe("edit");

    fireEvent.click(item(container, "Delivery"));
    expect(intentValue(container)).toBe("delivery");
  });

  it("submits 'delivery' from the single control a vendor without collection renders", () => {
    const { container } = render(
      <LocationControl postcode="MK9 1AA" deliverable offerCollection={false} method="DELIVERY" />,
    );

    fireEvent.click(button("Delivery · MK9 1AA"));

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

describe("LocationControl — one accessible name per button (#1091)", () => {
  // Each case: the props, the exact name, and the text the control shows, which the name must
  // contain (WCAG 2.5.3, Label in Name). #1142 — the menu items show one text at every width, so
  // for them `narrow` is simply that text.
  const cases: {
    label: string;
    props: ComponentProps<typeof LocationControl>;
    name: string;
    narrow: string;
  }[] = [
    {
      label: "the Click & Collect item",
      props: { postcode: null, deliverable: null, offerCollection: true, method: "COLLECTION" },
      name: "Click & Collect",
      narrow: "Click & Collect",
    },
    {
      label: "the Delivery item with a deliverable postcode",
      props: {
        postcode: "MK9 1AA",
        deliverable: true,
        offerCollection: true,
        method: "COLLECTION",
      },
      name: "Delivery · MK9 1AA",
      narrow: "Delivery · MK9 1AA",
    },
    {
      label: "the Delivery affordance with no postcode",
      props: { postcode: null, deliverable: null, offerCollection: true, method: "COLLECTION" },
      name: "Delivery",
      narrow: "Delivery",
    },
    {
      label: "the Change postcode item",
      props: { postcode: "MK9 1AA", deliverable: true, offerCollection: true, method: "DELIVERY" },
      name: "Change postcode",
      narrow: "Change postcode",
    },
    {
      label: "the no-collection button with a deliverable postcode",
      props: { postcode: "MK9 1AA", deliverable: true, offerCollection: false, method: "DELIVERY" },
      name: "Delivery · MK9 1AA",
      narrow: "Delivery · MK9 1AA",
    },
    {
      label: "the no-collection button with no postcode",
      props: { postcode: null, deliverable: null, offerCollection: false, method: "DELIVERY" },
      name: "Check delivery availability",
      narrow: "Check delivery",
    },
  ];

  /**
   * The menu's summary may carry the same text as an item (the summary names the current method),
   * so a menu control is looked up among the items; the no-collection button has no menu.
   */
  const control = (container: HTMLElement, props: (typeof cases)[number]["props"], name: string) =>
    props.offerCollection ? item(container, name) : screen.getByRole("button", { name });

  it.each(cases)("$label is named exactly $name", ({ props, name }) => {
    const { container } = render(<LocationControl {...props} />);
    expect(control(container, props, name)).toBeTruthy();
  });

  it.each(cases)("$label's name contains its narrow-width text", ({ props, name, narrow }) => {
    const { container } = render(<LocationControl {...props} />);
    expect(control(container, props, name).textContent).toContain(narrow);
    expect(name).toContain(narrow);
  });

  it("no menu item carries an aria-label, so its visible text is its only name", () => {
    const { container } = render(
      <LocationControl postcode="MK9 1AA" deliverable offerCollection method="DELIVERY" />,
    );
    const menu = menuOf(container);
    expect(menu.querySelector("summary")!.hasAttribute("aria-label")).toBe(false);
    for (const b of itemsOf(menu)) expect(b.hasAttribute("aria-label")).toBe(false);
  });
});

describe("LocationControl — the method menu (#1142 R1–R3)", () => {
  it("renders one menu and no control outside it, and no pencil", () => {
    const { container } = render(
      <LocationControl postcode="MK9 1AA" deliverable offerCollection method="COLLECTION" />,
    );
    const menu = menuOf(container);
    const dialog = container.querySelector("dialog")!;
    const outside = [...container.querySelectorAll("button")].filter(
      (b) => !menu.contains(b) && !dialog.contains(b),
    );
    expect(outside).toHaveLength(0);
    expect(screen.queryByRole("button", { name: /Change delivery postcode/ })).toBeNull();
  });

  it.each([
    {
      method: "COLLECTION" as const,
      postcode: "MK9 1AA",
      deliverable: true,
      summary: "Click & Collect",
    },
    {
      method: "DELIVERY" as const,
      postcode: "MK9 1AA",
      deliverable: true,
      summary: "Delivery · MK9 1AA",
    },
    { method: "DELIVERY" as const, postcode: null, deliverable: null, summary: "Delivery" },
    { method: "DELIVERY" as const, postcode: "RG1 1AA", deliverable: false, summary: "Delivery" },
  ])("the summary reads '$summary' for $method with postcode $postcode", (props) => {
    const { container } = render(<LocationControl offerCollection {...props} />);
    const summary = menuOf(container).querySelector("summary")!;
    expect(summary.textContent).toBe(props.summary);
    // Its icon and chevron are decorative, and there is no responsive span pair.
    const svgs = summary.querySelectorAll("svg");
    expect(svgs).toHaveLength(2);
    for (const svg of svgs) expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(summary.querySelector(".sm\\:hidden")).toBeNull();
  });

  it("orders the items Click & Collect, Delivery, Change postcode, as forms and dialog buttons", () => {
    const { container } = render(
      <LocationControl postcode="MK9 1AA" deliverable offerCollection method="COLLECTION" />,
    );
    const items = itemsOf(menuOf(container));
    expect(items.map((b) => b.textContent)).toEqual([
      "Click & Collect",
      "Delivery · MK9 1AA",
      "Change postcode",
    ]);

    const [collect, delivery, change] = items;
    for (const [b, value] of [
      [collect, "COLLECTION"],
      [delivery, "DELIVERY"],
    ] as const) {
      expect(b.type).toBe("submit");
      expect(b.name).toBe("fulfilmentMethod");
      expect(b.value).toBe(value);
      expect(b.closest("form")).not.toBeNull();
    }
    expect(change.type).toBe("button");
    expect(change.closest("form")).toBeNull();
  });

  it("makes Delivery a dialog button, and omits Change postcode, with no postcode stored", () => {
    const { container } = render(
      <LocationControl postcode={null} deliverable={null} offerCollection method="COLLECTION" />,
    );
    const items = itemsOf(menuOf(container));
    expect(items.map((b) => b.textContent)).toEqual(["Click & Collect", "Delivery"]);
    expect(items[1].type).toBe("button");
    expect(items[1].closest("form")).toBeNull();
  });

  it.each(["COLLECTION", "DELIVERY"] as const)(
    "checks and marks aria-current on the %s item only",
    (method) => {
      const { container } = render(
        <LocationControl postcode="MK9 1AA" deliverable offerCollection method={method} />,
      );
      const items = itemsOf(menuOf(container));
      const current = items.filter((b) => b.getAttribute("aria-current") === "true");
      expect(current).toHaveLength(1);
      expect(current[0].value).toBe(method);
      // The current item has its method icon plus a check; the others only the icon.
      for (const b of items) {
        expect(b.querySelectorAll("svg")).toHaveLength(b === current[0] ? 2 : 1);
      }
    },
  );
});

describe("LocationControl — closing the menu (#1142 R6)", () => {
  const openMenu = (container: HTMLElement) => {
    const menu = menuOf(container);
    menu.open = true;
    return menu;
  };

  const renderOpen = () => {
    vi.mocked(setFulfilmentMethod).mockClear();
    const { container } = render(
      <LocationControl postcode="MK9 1AA" deliverable offerCollection method="COLLECTION" />,
    );
    return { container, menu: openMenu(container) };
  };

  /** The method is unchanged: no action was called and the check is still on Click & Collect. */
  const expectMethodUnchanged = (menu: HTMLDetailsElement) => {
    expect(setFulfilmentMethod).not.toHaveBeenCalled();
    const current = itemsOf(menu).filter((b) => b.getAttribute("aria-current") === "true");
    expect(current.map((b) => b.value)).toEqual(["COLLECTION"]);
  };

  it("closes on Escape", () => {
    const { menu } = renderOpen();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(menu.open).toBe(false);
    expectMethodUnchanged(menu);
  });

  it("closes on a click outside it, and not on a click inside it", () => {
    const { menu } = renderOpen();
    fireEvent.click(menu.querySelector("div")!);
    expect(menu.open).toBe(true);
    fireEvent.click(document.body);
    expect(menu.open).toBe(false);
    expectMethodUnchanged(menu);
  });

  it("closes when Change postcode is chosen", () => {
    const { container, menu } = renderOpen();
    fireEvent.click(changePostcode(container));
    expect(menu.open).toBe(false);
    expect(intentValue(container)).toBe("edit");
    expectMethodUnchanged(menu);
  });

  // Found at Validate: with JavaScript on, React submits the action without a reload, so nothing
  // closed the menu after a method choice. The submit itself closes it now.
  it.each(["COLLECTION", "DELIVERY"] as const)(
    "closes when the %s method item is submitted",
    (value) => {
      const { menu } = renderOpen();
      const submit = itemsOf(menu).find((b) => b.value === value)!;
      fireEvent.submit(submit.closest("form")!, { submitter: submit });
      expect(menu.open).toBe(false);
    },
  );

  it("closes when Delivery with no postcode is chosen", () => {
    vi.mocked(setFulfilmentMethod).mockClear();
    const { container } = render(
      <LocationControl postcode={null} deliverable={null} offerCollection method="COLLECTION" />,
    );
    const menu = openMenu(container);
    fireEvent.click(item(container, "Delivery"));
    expect(menu.open).toBe(false);
    expect(intentValue(container)).toBe("delivery");
    expect(setFulfilmentMethod).not.toHaveBeenCalled();
  });
});
