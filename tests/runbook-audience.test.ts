import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  audienceLabel,
  audiencesForViewer,
  deriveAudienceTabs,
  docsForViewer,
  docsWithAudience,
  RUNBOOK_AUDIENCE_LABELS,
  RUNBOOK_PLATFORM_AUDIENCES,
  RUNBOOK_VENDOR_AUDIENCES,
  type RunbookAudience,
} from "@/lib/runbook-audiences";

/**
 * #633 (R1-R7) — the staff runbook's audience routing.
 *
 * `/staff/runbook` used to filter twice against two vocabularies: the page kept
 * `staff`/`store-admin`, then `RunbookClient` re-filtered for `staff`/`admin`. Since
 * `["store-admin"].includes("admin")` is false, ONE of 152 articles rendered and the "Admin" tab
 * could never match anything (#625). Each file was individually correct — the defect lived in the
 * relationship between them.
 *
 * These tests pin the replacement: one shared vocabulary, one filter (server-side), and a tab list
 * derived from what was actually delivered rather than hardcoded.
 */

const REPO_ROOT = join(__dirname, "..");

function doc(id: string, ...audience: string[]) {
  return { id, audience };
}

describe("audiencesForViewer (R5, R6)", () => {
  it("admits the vendor audiences to any viewer past the role gate", () => {
    const audiences = audiencesForViewer(false);
    for (const vendorAudience of RUNBOOK_VENDOR_AUDIENCES) {
      expect(audiences).toContain(vendorAudience);
    }
  });

  it("withholds platform-admin material from a vendor admin", () => {
    const audiences = audiencesForViewer(false) as readonly string[];
    for (const platformAudience of RUNBOOK_PLATFORM_AUDIENCES) {
      expect(audiences).not.toContain(platformAudience);
    }
  });

  it("admits platform-admin material only to a platform admin", () => {
    const audiences = audiencesForViewer(true) as readonly string[];
    for (const platformAudience of RUNBOOK_PLATFORM_AUDIENCES) {
      expect(audiences).toContain(platformAudience);
    }
  });
});

describe("docsForViewer (R5, R6)", () => {
  const library = [
    doc("staff-guide", "staff"),
    doc("admin-guide", "store-admin"),
    doc("platform-guide", "platform-admin"),
    doc("dev-doc", "dev"),
    doc("reviewer-doc", "dev", "admin"),
    doc("shopper-doc", "shopper"),
  ];

  it("delivers the two operator guides to a vendor admin, and nothing else", () => {
    expect(docsForViewer(library, false).map((d) => d.id)).toEqual(["staff-guide", "admin-guide"]);
  });

  it("adds the platform guide for a platform admin", () => {
    expect(docsForViewer(library, true).map((d) => d.id)).toEqual([
      "staff-guide",
      "admin-guide",
      "platform-guide",
    ]);
  });

  it("never delivers developer material, including the `admin`-tagged reviewer artifacts", () => {
    // In this repo `admin` tags gap registers and SDD plan/requirements/validation files, not store
    // admins. Admitting it would put specs in a shop manager's runbook.
    const delivered = docsForViewer(library, true).map((d) => d.id);
    expect(delivered).not.toContain("dev-doc");
    expect(delivered).not.toContain("reviewer-doc");
    expect(delivered).not.toContain("shopper-doc");
  });

  it("tolerates a malformed article rather than throwing", () => {
    const malformed = [{ id: "broken" } as unknown as { id: string; audience: string[] }];
    expect(docsForViewer(malformed, true)).toEqual([]);
  });
});

describe("deriveAudienceTabs (R2, R3)", () => {
  it("returns only audiences the delivered documents actually carry", () => {
    expect(deriveAudienceTabs([doc("a", "staff"), doc("b", "staff")])).toEqual(["staff"]);
  });

  it("adds the platform tab exactly when a platform document is present", () => {
    const withoutPlatform = deriveAudienceTabs([doc("a", "staff"), doc("b", "store-admin")]);
    expect(withoutPlatform).toEqual(["staff", "store-admin"]);

    const withPlatform = deriveAudienceTabs([
      doc("a", "staff"),
      doc("b", "store-admin"),
      doc("c", "platform-admin"),
    ]);
    expect(withPlatform).toEqual(["staff", "store-admin", "platform-admin"]);
  });

  it("renders no tabs at all for an empty library", () => {
    expect(deriveAudienceTabs([])).toEqual([]);
  });

  it("ignores audiences the viewer was never delivered, so no tab can match nothing", () => {
    // The #625 shape: a tab for an audience with no documents behind it.
    expect(deriveAudienceTabs([doc("a", "staff")])).not.toContain("platform-admin");
  });

  /** R3 — the guarantee the derivation exists to provide, asserted over every viewer shape. */
  it("every derived tab selects at least one document", () => {
    for (const isPlatformAdmin of [false, true]) {
      const delivered = docsForViewer(
        [
          doc("staff-guide", "staff"),
          doc("admin-guide", "store-admin"),
          doc("platform-guide", "platform-admin"),
          doc("dev-doc", "dev"),
        ],
        isPlatformAdmin,
      );
      const tabs = deriveAudienceTabs(delivered);
      expect(tabs.length).toBeGreaterThan(0);
      for (const tab of tabs) {
        expect(docsWithAudience(delivered, tab).length).toBeGreaterThan(0);
      }
    }
  });
});

describe("audience labels (R4, R7)", () => {
  it("renders sentence-case names, not raw slugs", () => {
    expect(audienceLabel("staff")).toBe("Staff");
    expect(audienceLabel("store-admin")).toBe("Store admin");
    expect(audienceLabel("platform-admin")).toBe("Platform admin");
  });

  /**
   * R7 — the check that stops a newly admitted audience rendering as a raw slug. Widening
   * `audiencesForViewer` without adding a label fails here.
   */
  it("every audience the runbook can admit has a display label", () => {
    const admitted = audiencesForViewer(true);
    for (const audience of admitted) {
      expect(RUNBOOK_AUDIENCE_LABELS[audience as RunbookAudience]).toBeTypeOf("string");
      expect(RUNBOOK_AUDIENCE_LABELS[audience as RunbookAudience]).not.toBe("");
    }
  });

  it("carries no label for an audience the runbook never admits", () => {
    const labelled = Object.keys(RUNBOOK_AUDIENCE_LABELS);
    expect(labelled).not.toContain("dev");
    expect(labelled).not.toContain("admin");
  });
});

describe("the client no longer filters by audience (R1, R2)", () => {
  const client = readFileSync(join(REPO_ROOT, "components/staff/RunbookClient.tsx"), "utf8");
  const page = readFileSync(join(REPO_ROOT, "app/(admin)/staff/runbook/page.tsx"), "utf8");

  it("RunbookClient hardcodes no audience slug", () => {
    // The literal tab list `["all", "staff", "admin"]` is what drifted from what the server
    // delivered. Any audience slug reappearing here is that defect returning.
    for (const slug of ["staff", "store-admin", "platform-admin", "admin"]) {
      expect(client).not.toContain(`"${slug}"`);
      expect(client).not.toContain(`'${slug}'`);
    }
  });

  it("RunbookClient derives its tabs rather than declaring them", () => {
    expect(client).toContain("deriveAudienceTabs(docs)");
  });

  it("the page is the only place documents are narrowed by audience", () => {
    expect(page).toContain("docsForViewer(");
    expect(page).toContain('auth.via === "platform-admin"');
  });
});
