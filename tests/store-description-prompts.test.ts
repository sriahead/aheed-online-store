import { describe, expect, it } from "vitest";
import { storeDescriptionPromptLine } from "@/lib/store-description";
import { buildNormalisationPrompt } from "@/lib/list-normalisation";
import { buildSynonymPrompt } from "@/lib/search-synonym-proposals";
import { buildNetContentPrompt } from "@/lib/net-content-suggester";
import { parseList } from "@/lib/shopping-list";

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
