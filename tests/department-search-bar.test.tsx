// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

/**
 * #1131 R15, R16, R19, R20, R22 — the header's department search bar.
 *
 * The bar must keep working with JavaScript off, so most of these assert plain HTML facts (a GET
 * form, a native select named `category`, a real submit button). The department names are test
 * data only: the component never names a department itself (R17).
 */

const params = vi.hoisted(() => ({
  value: new URLSearchParams() as URLSearchParams,
  suspend: false,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => {
    if (params.suspend) throw new Promise(() => {});
    return params.value;
  },
}));

const { DepartmentSearchBar } = await import("@/components/layout/DepartmentSearchBar");

const THREE = [
  { slug: "dept-one", name: "Dept One" },
  { slug: "dept-two", name: "Dept Two" },
  { slug: "dept-three", name: "Dept Three" },
];
// #1169 — a department with two subcategories, flattened the way `toSearchDepartments` does it.
const TREE = [
  { slug: "dept-one", name: "Dept One" },
  { slug: "dept-two", name: "Dept Two" },
  { slug: "two-a", name: "Two A", isSubcategory: true },
  { slug: "two-b", name: "Two B", isSubcategory: true },
];
const THIRTY = Array.from({ length: 30 }, (_, i) => ({ slug: `d-${i}`, name: `Department ${i}` }));

function renderBar(departments = THREE, placeholder = "Find something") {
  return render(<DepartmentSearchBar departments={departments} placeholder={placeholder} />);
}
const departmentSelect = () =>
  screen.getByRole("combobox", { name: "Search department" }) as unknown as HTMLSelectElement;

beforeEach(() => {
  params.value = new URLSearchParams();
  params.suspend = false;
});
afterEach(cleanup);

describe("form shape (R15)", () => {
  it("is a GET /search form holding select, then input, then submit button", () => {
    const { container } = renderBar();
    const form = container.querySelector("form")!;
    expect(form.getAttribute("method")).toBe("GET");
    expect(form.getAttribute("action")).toBe("/search");
    expect(form.hasAttribute("data-header-search")).toBe(true);

    const controls = [...form.querySelectorAll("select, input, button")];
    expect(controls.map((el) => el.tagName)).toEqual(["SELECT", "INPUT", "BUTTON"]);
    expect(controls[0].getAttribute("name")).toBe("category");
    expect(controls[1].getAttribute("name")).toBe("q");
    expect(controls[1].getAttribute("role")).toBe("combobox");
    expect(controls[2].getAttribute("type")).toBe("submit");
  });

  it("names the button Search and draws its icon inside it, not inside the input", () => {
    const { container } = renderBar();
    const button = screen.getByRole("button", { name: "Search" });
    expect(button.querySelector("svg")).not.toBeNull();
    const input = container.querySelector('input[name="q"]')!;
    expect(input.parentElement!.querySelector("svg")).toBeNull();
  });
});

describe("department options (R16)", () => {
  for (const [label, departments] of [
    ["three", THREE],
    ["thirty", THIRTY],
  ] as const) {
    it(`lists All then exactly the ${label} given departments, in order`, () => {
      renderBar(departments);
      const select = departmentSelect();
      const options = [...select.options].map((o) => [o.value, o.textContent]);
      expect(options).toEqual([["", "All"], ...departments.map((d) => [d.slug, d.name])]);
    });
  }

  it("keeps the accessible name Search department now the first option is only All (#1169 R1)", () => {
    renderBar();
    expect(departmentSelect().getAttribute("aria-label")).toBe("Search department");
  });

  it("lists each department's subcategories straight after it, indented (#1169 R2)", () => {
    const NB = "\u00A0\u00A0";
    renderBar(TREE);
    const options = [...departmentSelect().options].map((o) => [o.value, o.textContent]);
    expect(options).toEqual([
      ["", "All"],
      ["dept-one", "Dept One"],
      ["dept-two", "Dept Two"],
      ["two-a", `${NB}Two A`],
      ["two-b", `${NB}Two B`],
    ]);
  });

  it("is sized by the department-select rule, not fixed widths (#1173 R4)", () => {
    renderBar();
    const classes = departmentSelect().className.split(/\s+/);
    expect(classes).toContain("department-select");
    expect(classes).not.toContain("w-24");
    expect(classes).not.toContain("sm:w-36");
    // R7 — tap height and focus ring stay.
    expect(classes).toEqual(
      expect.arrayContaining(["min-h-tap", "lg:min-h-0", "focus-visible:ring-2"]),
    );
  });

  it("is a native select with no size attribute, so a long list scrolls natively", () => {
    renderBar(THIRTY);
    const select = departmentSelect();
    expect(select.tagName).toBe("SELECT");
    expect(select.hasAttribute("size")).toBe(false);
    expect(select.multiple).toBe(false);
  });
});

describe("placeholder (R19)", () => {
  it("shows the placeholder it is given", () => {
    const { container } = renderBar(THREE, "Type your product, we will find it for you");
    expect(container.querySelector('input[name="q"]')!.getAttribute("placeholder")).toBe(
      "Type your product, we will find it for you",
    );
  });

  it("shows the platform default when that is what the header passes", () => {
    const { container } = renderBar(THREE, "Search products…");
    expect(container.querySelector('input[name="q"]')!.getAttribute("placeholder")).toBe(
      "Search products…",
    );
  });
});

describe("submitting (R20)", () => {
  it("clicking the button submits the form once", () => {
    const { container } = renderBar();
    const onSubmit = vi.fn((event: Event) => event.preventDefault());
    container.querySelector("form")!.addEventListener("submit", onSubmit);
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("Enter in the input with no suggestion highlighted is left to the form", () => {
    const { container } = renderBar();
    const input = container.querySelector('input[name="q"]')!;
    fireEvent.change(input, { target: { value: "rice" } });
    // fireEvent returns false only when a handler called preventDefault.
    expect(fireEvent.keyDown(input, { key: "Enter" })).toBe(true);
  });
});

describe("the department already in the URL (R22)", () => {
  it("selects a listed department", () => {
    params.value = new URLSearchParams("q=a&category=dept-two");
    renderBar();
    expect(departmentSelect().value).toBe("dept-two");
  });

  it("selects a listed subcategory (#1169 R4)", () => {
    params.value = new URLSearchParams("q=a&category=two-b");
    renderBar(TREE);
    expect(departmentSelect().value).toBe("two-b");
  });

  it("selects a department that has subcategories (#1169 R4)", () => {
    params.value = new URLSearchParams("category=dept-two");
    renderBar(TREE);
    expect(departmentSelect().value).toBe("dept-two");
  });

  for (const [label, query] of [
    ["an unknown slug", "category=nope"],
    ["a sub-category slug the selector was not given", "category=dept-two-child"],
    ["no parameter", "q=a"],
  ] as const) {
    it(`selects All for ${label}`, () => {
      params.value = new URLSearchParams(query);
      renderBar();
      expect(departmentSelect().value).toBe("");
    });
  }

  it("renders the select with All while the URL is not yet available", () => {
    params.suspend = true;
    const { container } = renderBar();
    const select = departmentSelect();
    expect(select.value).toBe("");
    expect(select.options).toHaveLength(THREE.length + 1);
    // The rest of the form is there regardless.
    expect(container.querySelector('input[name="q"]')).not.toBeNull();
    expect(screen.getByRole("button", { name: "Search" })).toBeTruthy();
  });
});
