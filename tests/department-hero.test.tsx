// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { DepartmentHero, type HeroDepartment } from "@/components/layout/DepartmentHero";

/**
 * P8.5b (#346) — what the department hero is allowed to render.
 *
 * `vitest.config.mts` sets `environment: "node"` globally, so the docblock
 * above is what gives this component a DOM (same opt-in as
 * tests/order-items-card.test.tsx and tests/a11y/*.tsx).
 *
 * R3 IS THE LOAD-BEARING CASE. `Category` has no image column, and #279 records
 * that no vendor artwork exists at all, so the hero must render from an icon
 * today. The optional-image prop is what makes adding `Category.imageKey` later
 * a purely additive change — and a prop nothing exercises is a prop that
 * quietly stops working, so both branches are tested here rather than only the
 * one currently reachable in production.
 *
 * The rotation/pause behaviour (R10-R13) is deliberately NOT asserted here.
 * Those are WCAG SC 2.2.2 obligations about a real user agent — focus, hover
 * and prefers-reduced-motion — and validation.md routes them to a browser on
 * purpose. A jsdom test asserting a button exists would look like coverage
 * without being it.
 */

const DEPARTMENTS: HeroDepartment[] = [
  {
    id: "cat-1",
    slug: "halal-meat",
    name: "Halal Meat",
    spotlight: {
      name: "Fresh Lamb Curry Cut",
      slug: "fresh-lamb-curry-cut",
      basePrice: 1099,
      originalPrice: 1299,
      unitLabel: "per kg",
    },
  },
  { id: "cat-2", slug: "fruit-veg", name: "Fruit & Veg", spotlight: null },
];

afterEach(cleanup);

describe("DepartmentHero", () => {
  it("renders one panel per department, named from the data", () => {
    render(<DepartmentHero departments={DEPARTMENTS} cdnBaseUrl={null} />);

    // Both panels are in the DOM...
    expect(screen.getByText("Halal Meat")).toBeDefined();
    expect(screen.getByText("Fruit & Veg")).toBeDefined();
    // ...but only the CURRENT one is in the accessibility tree. Off-screen
    // panels carry aria-hidden, so a screen reader is not read two headings
    // for a hero showing one. `getByRole` respects that, which is why the
    // assertion above is by text: this test caught its own wrong assumption
    // that both headings would be exposed.
    expect(screen.getByRole("heading", { name: "Halal Meat" })).toBeDefined();
    expect(screen.queryByRole("heading", { name: "Fruit & Veg" })).toBeNull();
  });

  it("falls back to the category icon when no image key is present (R3)", () => {
    const { container } = render(<DepartmentHero departments={DEPARTMENTS} cdnBaseUrl={null} />);

    // No <img> at all — every panel is icon-led.
    expect(container.querySelectorAll("img")).toHaveLength(0);
    // lucide renders an <svg>; the icon slot is populated rather than empty.
    expect(container.querySelectorAll("svg").length).toBeGreaterThan(0);
  });

  it("renders an image instead of the icon when a key is supplied (R3)", () => {
    const withArtwork: HeroDepartment[] = [
      { ...DEPARTMENTS[0], imageKey: "categories/halal-meat/hero.webp", altText: "Halal counter" },
      DEPARTMENTS[1],
    ];

    render(<DepartmentHero departments={withArtwork} cdnBaseUrl="https://cdn.example.test" />);

    const image = screen.getByAltText("Halal counter") as HTMLImageElement;
    // Composed from the CDN base and the RELATIVE key (ADR-003) — never a
    // stored URL.
    expect(image.getAttribute("src")).toBe(
      "https://cdn.example.test/categories/halal-meat/hero.webp",
    );
  });

  it("keeps the icon when an image key exists but no CDN base is configured", () => {
    const withArtwork: HeroDepartment[] = [
      { ...DEPARTMENTS[0], imageKey: "categories/halal-meat/hero.webp", altText: "Halal counter" },
    ];

    const { container } = render(<DepartmentHero departments={withArtwork} cdnBaseUrl={null} />);

    // A key with nothing to compose against must not become a broken <img>.
    expect(container.querySelectorAll("img")).toHaveLength(0);
  });

  it("renders the spotlight product's real price, and no callout without one (R4)", () => {
    render(<DepartmentHero departments={DEPARTMENTS} cdnBaseUrl={null} />);

    expect(screen.getByText("Fresh Lamb Curry Cut")).toBeDefined();
    expect(screen.getByText("£10.99")).toBeDefined();
    // The pre-discount price is struck through beside it.
    expect(screen.getByText("£12.99")).toBeDefined();
    // The department with no spotlight gets neutral copy, not a placeholder price.
    expect(screen.getByText("Browse the full range.")).toBeDefined();
  });

  it("links each department to its filtered catalogue (R7)", () => {
    render(<DepartmentHero departments={DEPARTMENTS} cdnBaseUrl={null} />);

    const link = screen.getByRole("link", { name: /Shop Halal Meat/ });
    expect(link.getAttribute("href")).toBe("/categories/halal-meat");
  });

  it("renders nothing at all for a vendor with no departments (R6)", () => {
    const { container } = render(<DepartmentHero departments={[]} cdnBaseUrl={null} />);

    // Not an empty bordered well — nothing.
    expect(container.firstChild).toBeNull();
  });

  it("exposes the current panel programmatically, not by colour alone (R13)", () => {
    render(<DepartmentHero departments={DEPARTMENTS} cdnBaseUrl={null} />);

    const current = screen.getByRole("button", { name: "Show Halal Meat" });
    expect(current.getAttribute("aria-current")).toBe("true");
    const other = screen.getByRole("button", { name: "Show Fruit & Veg" });
    expect(other.getAttribute("aria-current")).toBe("false");
  });

  it("gives the pause control an accessible name (R10)", () => {
    render(<DepartmentHero departments={DEPARTMENTS} cdnBaseUrl={null} />);

    // Presence only — that it actually STOPS rotation, and that hover and
    // keyboard focus pause it, are browser checks in validation.md.
    expect(screen.getByRole("button", { name: "Pause department rotation" })).toBeDefined();
  });

  /**
   * P8.5e (#356) — a LIVE campaign overrides heading/subtitle and, with a
   * photo, the panel's visual treatment. `campaign` here is always already
   * "live" by construction: liveness itself is `isCampaignLive`'s job (see
   * tests/campaigns.test.ts), tested separately so this component never has
   * to re-decide it.
   */
  it("renders the campaign headline in place of the department name (R7)", () => {
    const withCampaign: HeroDepartment[] = [
      {
        ...DEPARTMENTS[0],
        campaign: {
          headline: "Craft Halal Butchery, Cut Fresh Daily",
          subtitle: null,
          imageKey: null,
          altText: null,
          linkUrl: null,
        },
      },
      DEPARTMENTS[1],
    ];

    render(<DepartmentHero departments={withCampaign} cdnBaseUrl={null} />);

    expect(
      screen.getByRole("heading", { name: "Craft Halal Butchery, Cut Fresh Daily" }),
    ).toBeDefined();
    expect(screen.queryByRole("heading", { name: "Halal Meat" })).toBeNull();
  });

  it("renders the campaign subtitle when present, and nothing extra when absent (R7)", () => {
    const withSubtitle: HeroDepartment[] = [
      {
        ...DEPARTMENTS[0],
        campaign: {
          headline: "Craft Halal Butchery",
          subtitle: "English lamb, cut to order",
          imageKey: null,
          altText: null,
          linkUrl: null,
        },
      },
      DEPARTMENTS[1],
    ];

    render(<DepartmentHero departments={withSubtitle} cdnBaseUrl={null} />);
    expect(screen.getByText("English lamb, cut to order")).toBeDefined();
  });

  it("keeps the real spotlight price callout alongside a campaign's copy (R10)", () => {
    const withCampaign: HeroDepartment[] = [
      {
        ...DEPARTMENTS[0],
        campaign: {
          headline: "Craft Halal Butchery",
          subtitle: null,
          imageKey: null,
          altText: null,
          linkUrl: null,
        },
      },
      DEPARTMENTS[1],
    ];

    render(<DepartmentHero departments={withCampaign} cdnBaseUrl={null} />);

    // The campaign never suppresses the real price — this is the one thing
    // that stays true whether or not a department has a campaign.
    expect(screen.getByText("Fresh Lamb Curry Cut")).toBeDefined();
    expect(screen.getByText("£10.99")).toBeDefined();
  });

  it("renders the campaign photo full-bleed and drops the chevron cutout, when a photo exists (R8)", () => {
    const withPhoto: HeroDepartment[] = [
      {
        ...DEPARTMENTS[0],
        campaign: {
          headline: "Craft Halal Butchery",
          subtitle: null,
          imageKey: "categories/halal-meat/banner.webp",
          altText: "Butcher's counter",
          linkUrl: null,
        },
      },
      DEPARTMENTS[1],
    ];

    render(<DepartmentHero departments={withPhoto} cdnBaseUrl="https://cdn.example.test" />);

    const image = screen.getByAltText("Butcher's counter") as HTMLImageElement;
    expect(image.getAttribute("src")).toBe(
      "https://cdn.example.test/categories/halal-meat/banner.webp",
    );
    // Scoped to THIS panel — the other (non-campaign) panel in the carousel
    // legitimately keeps its own chevron, which is what the next test checks.
    const photoPanel = image.closest('[role="group"]');
    expect(photoPanel?.querySelector(".dept-chevron")).toBeNull();
  });

  it("keeps the chevron and icon layout for a live campaign with no photo (R9)", () => {
    const textOnly: HeroDepartment[] = [
      {
        ...DEPARTMENTS[0],
        campaign: {
          headline: "Craft Halal Butchery",
          subtitle: null,
          imageKey: null,
          altText: null,
          linkUrl: null,
        },
      },
      DEPARTMENTS[1],
    ];

    render(<DepartmentHero departments={textOnly} cdnBaseUrl={null} />);

    const panel = screen
      .getByRole("heading", { name: "Craft Halal Butchery" })
      .closest('[role="group"]');
    expect(panel?.querySelector(".dept-chevron")).not.toBeNull();
  });

  it("renders identically to a department with no campaign at all (R9)", () => {
    const { container: withoutCampaignField } = render(
      <DepartmentHero departments={DEPARTMENTS} cdnBaseUrl={null} />,
    );
    const explicitNull: HeroDepartment[] = [{ ...DEPARTMENTS[0], campaign: null }, DEPARTMENTS[1]];
    const { container: withNullCampaign } = render(
      <DepartmentHero departments={explicitNull} cdnBaseUrl={null} />,
    );

    expect(withNullCampaign.innerHTML).toBe(withoutCampaignField.innerHTML);
  });

  it("uses the campaign's link when supplied, and the default catalogue link otherwise (R11)", () => {
    const withLink: HeroDepartment[] = [
      {
        ...DEPARTMENTS[0],
        campaign: {
          headline: "Craft Halal Butchery",
          subtitle: null,
          imageKey: null,
          altText: null,
          linkUrl: "/categories/halal-meat?isOffer=true",
        },
      },
      DEPARTMENTS[1],
    ];

    render(<DepartmentHero departments={withLink} cdnBaseUrl={null} />);

    // The CTA's visible text is always data-derived — never campaign copy.
    const link = screen.getByRole("link", { name: /Shop Halal Meat/ });
    expect(link.getAttribute("href")).toBe("/categories/halal-meat?isOffer=true");
  });
});
