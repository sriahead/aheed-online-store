import { execFile } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { checkMedallionMarkup } from "../scripts/verify-medallion-markup";

/** #1288 R28: the live-page checker that no 3D icon escapes the circular frame. */

const INSIDE = `<html><body><span data-medallion><span data-icon3d="storefront"></span></span></body></html>`;
const OUTSIDE = `<html><body><span data-medallion></span><span data-icon3d="cart-add"></span></body></html>`;
const NONE = `<html><body><p>no icons</p></body></html>`;

const dir = mkdtempSync(join(tmpdir(), "medallion-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function runScript(html: string): Promise<{ code: number; out: string }> {
  const file = join(dir, `page-${Math.random().toString(36).slice(2)}.html`);
  writeFileSync(file, html);
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      ["--import", "tsx", "scripts/verify-medallion-markup.ts", file],
      { cwd: join(__dirname, "..") },
      (error, stdout, stderr) => {
        resolve({ code: error ? Number(error.code ?? 1) : 0, out: `${stdout}${stderr}` });
      },
    );
  });
}

describe("checkMedallionMarkup", () => {
  it("passes a 3D icon inside a medallion", () => {
    expect(checkMedallionMarkup(INSIDE)).toEqual({ medallions: 1, escaped: [] });
  });

  it("names a 3D icon outside any medallion", () => {
    expect(checkMedallionMarkup(OUTSIDE).escaped).toEqual(["cart-add"]);
  });

  it("counts zero medallions on a page without any", () => {
    expect(checkMedallionMarkup(NONE).medallions).toBe(0);
  });
});

describe("scripts/verify-medallion-markup.ts exit codes", () => {
  it("exits 0 when every 3D icon is framed", async () => {
    const { code, out } = await runScript(INSIDE);
    expect(code).toBe(0);
    expect(out).toContain("PASS");
  }, 30_000);

  it("exits 1 and names the escaped icon", async () => {
    const { code, out } = await runScript(OUTSIDE);
    expect(code).toBe(1);
    expect(out).toContain("cart-add");
  }, 30_000);

  it("exits 1 when the page has no medallion at all", async () => {
    const { code } = await runScript(NONE);
    expect(code).toBe(1);
  }, 30_000);
});
