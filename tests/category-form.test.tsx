// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readSubmittedCategory, type CatalogueFormState } from "@/lib/catalogue-form";
import type { AdminCategoryDetail, AdminCategoryRow } from "@/lib/repositories/categories";

/**
 * #1131 R8 and R12 — the category form.
 *
 * R12 is the owner's "category creation" defect, reproduced live before the fix (build-notes.md):
 * a refused save showed its error but came back with the name and web address blank and the sort
 * order reset to 0, because the action returned no submitted values and React 19 resets a form's
 * uncontrolled fields when its action settles. The mocked action here refuses the way the real one
 * does, echoing `readSubmittedCategory(form)` — the same function `saveCategory` calls.
 */

const saveCategory = vi.hoisted(() => vi.fn());
vi.mock("@/features/admin/catalogue", () => ({ saveCategory }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const { CategoryForm, hiddenWithCategoryNote } = await import("@/components/staff/CategoryForm");

const PARENT: AdminCategoryRow = {
  id: "parent-1",
  slug: "fruit",
  name: "Fruit",
  parentId: null,
  parentName: null,
  sortOrder: 0,
  isActive: true,
  productCount: 3,
};

const EDITING: AdminCategoryDetail = {
  id: "cat-1",
  slug: "baby-kids",
  name: "Baby & Kids",
  parentId: null,
  sortOrder: 0,
  isActive: true,
};

afterEach(() => {
  cleanup();
  saveCategory.mockReset();
});

describe("hiddenWithCategoryNote (R8)", () => {
  it("states both counts in plural", () => {
    expect(hiddenWithCategoryNote({ products: 3, subCategories: 2 })).toBe(
      "Turning this off also hides its 3 products and 2 sub-categories from shoppers. They come back when you turn it on.",
    );
  });

  it("uses the singular for one of each", () => {
    expect(hiddenWithCategoryNote({ products: 1, subCategories: 1 })).toBe(
      "Turning this off also hides its 1 product and 1 sub-category from shoppers. They come back when you turn it on.",
    );
  });

  it("says nothing when switching off would hide nothing", () => {
    expect(hiddenWithCategoryNote({ products: 0, subCategories: 0 })).toBeNull();
  });
});

describe("CategoryForm's hidden-count note (R8)", () => {
  it("renders the note beside the checkbox when editing a category with contents", () => {
    render(
      <CategoryForm
        category={EDITING}
        categories={[PARENT]}
        hiddenCounts={{ products: 3, subCategories: 2 }}
      />,
    );
    const note = screen.getByText(
      /Turning this off also hides its 3 products and 2 sub-categories/,
    );
    const checkbox = screen.getByRole("checkbox", { name: /Visible in the shop/ });
    expect(checkbox.getAttribute("aria-describedby")).toBe(note.id);
  });

  it("renders no note for an empty category", () => {
    render(
      <CategoryForm
        category={EDITING}
        categories={[PARENT]}
        hiddenCounts={{ products: 0, subCategories: 0 }}
      />,
    );
    expect(screen.queryByText(/Turning this off/)).toBeNull();
  });

  it("renders no note when creating, even if counts were passed", () => {
    render(
      <CategoryForm
        category={null}
        categories={[PARENT]}
        hiddenCounts={{ products: 3, subCategories: 2 }}
      />,
    );
    expect(screen.queryByText(/Turning this off/)).toBeNull();
  });
});

describe("a refused save keeps what was typed (R12)", () => {
  it("re-renders the submitted name, web address, parent, sort order and unchecked box", async () => {
    saveCategory.mockImplementation(
      async (_prev: CatalogueFormState, form: FormData): Promise<CatalogueFormState> => ({
        error: "Another category in this store already uses that web address.",
        field: "slug",
        saved: false,
        submittedCategory: readSubmittedCategory(form),
      }),
    );

    const { container } = render(<CategoryForm category={null} categories={[PARENT]} />);
    const field = <T,>(name: string) => container.querySelector(`[name="${name}"]`) as unknown as T;

    fireEvent.change(field<HTMLInputElement>("name"), { target: { value: "Test" } });
    fireEvent.change(field<HTMLInputElement>("slug"), { target: { value: "dup" } });
    fireEvent.change(field<HTMLSelectElement>("parentId"), { target: { value: PARENT.id } });
    fireEvent.change(field<HTMLInputElement>("sortOrder"), { target: { value: "4" } });
    fireEvent.click(field<HTMLInputElement>("isActive"));
    expect(field<HTMLInputElement>("isActive").checked).toBe(false);

    await act(async () => {
      fireEvent.submit(container.querySelector("form")!);
    });

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Another category in this store already uses that web address.",
    );
    expect(saveCategory).toHaveBeenCalledTimes(1);
    expect(field<HTMLInputElement>("name").value).toBe("Test");
    expect(field<HTMLInputElement>("slug").value).toBe("dup");
    expect(field<HTMLSelectElement>("parentId").value).toBe(PARENT.id);
    expect(field<HTMLInputElement>("sortOrder").value).toBe("4");
    expect(field<HTMLInputElement>("isActive").checked).toBe(false);
  });
});
