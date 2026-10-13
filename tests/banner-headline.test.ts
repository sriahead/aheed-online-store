import { describe, expect, it } from "vitest";
import { bannerHeadlineText } from "@/components/layout/banner-headline";

/** #1078 R17 — the header banner's first line: the vendor's own headline, else the derived line. */

const VENDOR = { name: "Example Store", localityName: "Somewhere", offerCollection: false };

describe("bannerHeadlineText", () => {
  it("renders a set headline as written, and not the derived line", () => {
    const text = bannerHeadlineText({ ...VENDOR, bannerHeadline: "Fresh every morning" });
    expect(text).toBe("Fresh every morning");
    expect(text).not.toContain("local delivery across");
  });

  it("with no headline, renders the derived line exactly as before #1078", () => {
    expect(bannerHeadlineText({ ...VENDOR, bannerHeadline: null })).toBe(
      "Example Store — local delivery across Somewhere",
    );
    expect(bannerHeadlineText({ ...VENDOR, offerCollection: true, bannerHeadline: null })).toBe(
      "Example Store — local delivery across Somewhere & click and collect",
    );
  });
});
