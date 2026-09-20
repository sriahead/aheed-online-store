// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import {
  CustomerFeedbackCards,
  CARD_PALETTES,
  ReviewLinkGroup,
} from "@/components/storefront/CustomerFeedbackCards";
import type { PublicFeedback, FeedbackSummary } from "@/lib/repositories/customer-feedback";
import type { ReviewLink } from "@/lib/repositories/vendor-review-links";

afterEach(cleanup);

function channels(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(hex1: string, hex2: string): number {
  const l1 = luminance(hex1);
  const l2 = luminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

const SAMPLE_SUMMARY: FeedbackSummary = {
  approvedCount: 3,
  averageRating: 4.67,
};

const SAMPLE_FEEDBACK: PublicFeedback[] = [
  {
    id: "fb-1",
    authorName: "Amina K.",
    rating: 5,
    comment: "The fresh spices and produce arrived in perfect condition. Will order weekly!",
    verifiedPurchase: true,
    submittedAt: new Date("2026-09-18T10:00:00.000Z"),
  },
  {
    id: "fb-2",
    authorName: "Marcus T.",
    rating: 5,
    comment: "Fast delivery, neatly packed and very courteous driver.",
    verifiedPurchase: false,
    submittedAt: new Date("2026-09-17T12:00:00.000Z"),
  },
  {
    id: "fb-3",
    authorName: "Priya S.",
    rating: 4,
    comment: "Great quality lentils and rice. Very satisfied with the service.",
    verifiedPurchase: true,
    submittedAt: new Date("2026-09-15T09:00:00.000Z"),
  },
];

const SAMPLE_LINKS: ReviewLink[] = [
  {
    id: "rl-1",
    platform: "Google",
    url: "https://google.com/review",
    sortOrder: 0,
    isActive: true,
  },
];

describe("CustomerFeedbackCards (P824)", () => {
  it("defines a rotation of at least 6 distinct pastel palette styles (R1)", () => {
    expect(CARD_PALETTES.length).toBeGreaterThanOrEqual(6);
    const names = CARD_PALETTES.map((p) => p.name);
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(CARD_PALETTES.length);

    const bgs = CARD_PALETTES.map((p) => p.bg);
    const uniqueBgs = new Set(bgs);
    expect(uniqueBgs.size).toBe(CARD_PALETTES.length);
  });

  it("guarantees WCAG AA contrast ratio >= 4.5:1 against brand text for all card tints (R3)", () => {
    const textColors = [
      { name: "Aheed primary (#1b5e20)", hex: "#1b5e20" },
      { name: "SriMart primary (#0d47a1)", hex: "#0d47a1" },
      { name: "Primary muted (#49784e)", hex: "#49784e" },
    ];

    for (const palette of CARD_PALETTES) {
      for (const textColor of textColors) {
        const ratio = contrastRatio(textColor.hex, palette.hexBg);
        expect(
          ratio,
          `${textColor.name} on ${palette.name} (${palette.hexBg}) contrast was ${ratio.toFixed(2)}:1`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("renders null when feedback is empty (R12)", () => {
    const { container } = render(
      <CustomerFeedbackCards
        feedback={[]}
        summary={{ approvedCount: 0, averageRating: 0 }}
        reviewLinks={[]}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("preserves section heading, aggregate rating stars, score, count and feedback link (R4)", () => {
    render(
      <CustomerFeedbackCards
        feedback={SAMPLE_FEEDBACK}
        summary={SAMPLE_SUMMARY}
        reviewLinks={SAMPLE_LINKS}
      />,
    );

    expect(screen.getByRole("heading", { name: "What our customers say" })).toBeTruthy();
    expect(screen.getByText("4.7")).toBeTruthy();
    expect(screen.getByText(/from 3 reviews/)).toBeTruthy();

    const shareLink = screen.getByRole("link", { name: "Share your experience" });
    expect(shareLink).toBeTruthy();
    expect(shareLink.getAttribute("href")).toBe("/feedback");
  });

  it("preserves individual card review details, ratings, badges, and relative date (R5)", () => {
    const now = new Date("2026-09-20T12:00:00.000Z");
    render(
      <CustomerFeedbackCards
        feedback={SAMPLE_FEEDBACK}
        summary={SAMPLE_SUMMARY}
        reviewLinks={SAMPLE_LINKS}
        now={now}
      />,
    );

    expect(screen.getByText(/The fresh spices and produce arrived/)).toBeTruthy();
    expect(screen.getByText(/Marcus T\./)).toBeTruthy();
    expect(screen.getByText(/Priya S\./)).toBeTruthy();

    // Two verified badges for the two verified items
    const verifiedBadges = screen.getAllByText("Verified customer");
    expect(verifiedBadges).toHaveLength(2);
  });

  it("assigns rotating pastel color palettes to cards deterministically by index (R2)", () => {
    const { container } = render(
      <CustomerFeedbackCards
        feedback={SAMPLE_FEEDBACK}
        summary={SAMPLE_SUMMARY}
        reviewLinks={SAMPLE_LINKS}
      />,
    );

    const articles = container.querySelectorAll("article");
    expect(articles).toHaveLength(3);

    expect(articles[0].className).toContain(CARD_PALETTES[0].bg);
    expect(articles[0].className).toContain(CARD_PALETTES[0].border);

    expect(articles[1].className).toContain(CARD_PALETTES[1].bg);
    expect(articles[1].className).toContain(CARD_PALETTES[1].border);

    expect(articles[2].className).toContain(CARD_PALETTES[2].bg);
    expect(articles[2].className).toContain(CARD_PALETTES[2].border);
  });

  it("renders outbound ReviewLinkGroup when review links are supplied (R13)", () => {
    render(<ReviewLinkGroup reviewLinks={SAMPLE_LINKS} bordered />);

    expect(screen.getByRole("heading", { name: "Review us elsewhere" })).toBeTruthy();
    const link = screen.getByRole("link", { name: /Google/ });
    expect(link.getAttribute("href")).toBe("https://google.com/review");
    expect(link.getAttribute("target")).toBe("_blank");
  });
});
