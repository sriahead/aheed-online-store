import { describe, expect, it } from "vitest";
import { storeDescriptionPromptLine } from "@/lib/store-description";
import { buildNormalisationPrompt } from "@/lib/list-normalisation";
import { buildSynonymPrompt } from "@/lib/search-synonym-proposals";
import { buildNetContentPrompt } from "@/lib/net-content-suggester";
import { parseList } from "@/lib/shopping-list";
import { buildCampaignImagePrompt } from "@/lib/campaign-image";

/**
 * #905 R15/R20 — the three AI prompts no longer tell the model every vendor is a grocer; the
 * vendor's own description, when it has one, is the prompt's second line, quoted as data.
 */

const BUILDERS: [string, (description: string | null) => string][] = [
  ["list normalisation", (d) => buildNormalisationPrompt(parseList("2kg atta\nmilk"), d)],
  ["synonym proposals", (d) => buildSynonymPrompt(["charger"], ["usb", "cable"], d)],
  [
    "net content",
    (d) =>
      buildNetContentPrompt({
        name: "Fast Charger",
        unitLabel: "£9 each",
        description: "",
        hasPhoto: false,
        storeDescription: d,
      }),
  ],
  // #1030 R14 — the campaign banner image prompt, missed by #905.
  ["campaign banner", (d) => buildCampaignImagePrompt("Audio", "Sound sale", null, d)],
];

describe.each(BUILDERS)("%s prompt (#905 R20)", (_name, build) => {
  it("(a) with no description, says nothing about groceries or South Asian food", () => {
    expect(build(null)).not.toMatch(/grocer|south asian/i);
  });

  it("(a) with no description, adds no description line", () => {
    expect(build(null)).not.toContain("The shop describes itself as");
  });

  it("(b) quotes the vendor's description as the second line", () => {
    expect(build("Phones & chargers").split("\n")[1]).toBe(
      'The shop describes itself as: "Phones & chargers"',
    );
  });

  it("(c) keeps a multi-line, quoted description on one line inside its quotes", () => {
    expect(build('Line one\n\nsays "hi"').split("\n")[1]).toBe(
      "The shop describes itself as: \"Line one says 'hi'\"",
    );
  });
});

describe("storeDescriptionPromptLine (#905 R15)", () => {
  it("returns null for null and for whitespace", () => {
    expect(storeDescriptionPromptLine(null)).toBeNull();
    expect(storeDescriptionPromptLine("  \n ")).toBeNull();
  });

  it("(d) caps the quoted value at 200 characters", () => {
    const line = storeDescriptionPromptLine("x".repeat(300));
    const quoted = /"(.*)"$/.exec(line ?? "")?.[1];
    expect(quoted).toHaveLength(200);
  });
});

describe("campaign banner prompt with no description (#1030 R15)", () => {
  const prompt = buildCampaignImagePrompt("Fresh Produce", "Summer picks", "From the farm", null);

  it("says nothing about groceries, the UK or appetising food", () => {
    expect(prompt).not.toMatch(/grocer/i);
    expect(prompt).not.toMatch(/UK/);
    expect(prompt).not.toMatch(/appetis/i);
  });

  it("keeps the department, the campaign copy and the no-text instruction", () => {
    expect(prompt).toContain("Fresh Produce");
    expect(prompt).toContain("Summer picks");
    expect(prompt).toContain("From the farm");
    expect(prompt).toContain("No text");
  });
});
