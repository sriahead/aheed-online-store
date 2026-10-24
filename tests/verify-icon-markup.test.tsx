import { execFile } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as lucide from "lucide-react";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Icon } from "@/components/icons/Icon";
import { compareInventories, inventory } from "../scripts/verify-icon-markup";

/**
 * Proves R33 (#1223) for `scripts/verify-icon-markup.ts`: it prints machine-readable JSON lines on
 * stdout and nothing else, sends the headers local sign-in needs, fails on a non-200, and `--compare`
 * calls a lucide-react page and the same page rendered through `Icon` identical.
 *
 * The REAL script is spawned (asynchronously: the server below lives in this process, so a synchronous
 * spawn would block the event loop and deadlock it).
 */

const ROOT = join(__dirname, "..");
const BEFORE_PAGE = `<html><body>${renderToStaticMarkup(createElement(lucide.Search, { className: "h-4 w-4 text-primary" }))}${renderToStaticMarkup(createElement(lucide.Star, { className: "h-4 w-4 fill-current" }))}</body></html>`;
const AFTER_PAGE = `<html><body>${renderToStaticMarkup(<Icon name="search" className="h-4 w-4 text-primary" />)}${renderToStaticMarkup(<Icon name="star" className="h-4 w-4 fill-current" />)}</body></html>`;
const CHANGED_PAGE = `<html><body>${renderToStaticMarkup(<Icon name="search" className="h-5 w-5 text-primary" />)}${renderToStaticMarkup(<Icon name="star" className="h-4 w-4 fill-current" />)}</body></html>`;

let server: Server;
let base = "";
const signInHeaders: IncomingMessage["headers"][] = [];
const scratch = mkdtempSync(join(tmpdir(), "verify-icon-markup-"));

beforeAll(async () => {
  server = createServer((request, response) => {
    if (request.url === "/api/auth/sign-in/email" && request.method === "POST") {
      signInHeaders.push(request.headers);
      response.setHeader("set-cookie", ["session=abc123; Path=/; HttpOnly"]);
      response.end("{}");
      return;
    }
    if (request.url === "/private") {
      if (request.headers.cookie?.includes("session=abc123")) response.end(AFTER_PAGE);
      else {
        response.statusCode = 307;
        response.setHeader("location", "/login");
        response.end();
      }
      return;
    }
    if (request.url === "/before") return void response.end(BEFORE_PAGE);
    if (request.url === "/after") return void response.end(AFTER_PAGE);
    if (request.url === "/changed") return void response.end(CHANGED_PAGE);
    response.statusCode = 404;
    response.end("nope");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => {
  server.close();
  rmSync(scratch, { recursive: true, force: true });
});

function run(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(
      "npx",
      ["tsx", "scripts/verify-icon-markup.ts", ...args],
      { cwd: ROOT, shell: process.platform === "win32" },
      (error, stdout, stderr) => {
        resolve({ code: error ? ((error as { code?: number }).code ?? 1) : 0, stdout, stderr });
      },
    );
  });
}

describe("inventory()", () => {
  it("drops lucide's own class tokens and sorts the rest", () => {
    const [record] = inventory(BEFORE_PAGE);
    expect(record.className).toBe("h-4 text-primary w-4");
    expect(record.ariaHidden).toBe("true");
    expect(record.width).toBe("24");
  });

  it("a lucide-react page and the same page through Icon pair up one to one", () => {
    const { onlyBefore, onlyAfter } = compareInventories(
      inventory(BEFORE_PAGE),
      inventory(AFTER_PAGE),
    );
    expect(onlyBefore).toEqual([]);
    expect(onlyAfter).toEqual([]);
  });

  it("a changed class on one icon is reported on both sides", () => {
    const { onlyBefore, onlyAfter } = compareInventories(
      inventory(BEFORE_PAGE),
      inventory(CHANGED_PAGE),
    );
    expect(onlyBefore).toHaveLength(1);
    expect(onlyAfter).toHaveLength(1);
  });
});

describe("scripts/verify-icon-markup.ts (real process)", () => {
  it("prints one JSON line per path on stdout and only progress on stderr", async () => {
    const { code, stdout, stderr } = await run([
      "--base",
      base,
      "--path",
      "/before",
      "--path",
      "/after",
    ]);
    expect(code, stderr).toBe(0);
    const lines = stdout.trim().split("\n");
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      const records = JSON.parse(line);
      expect(Array.isArray(records)).toBe(true);
      expect(Object.keys(records[0]).sort()).toEqual([
        "ariaHidden",
        "className",
        "geometry",
        "height",
        "width",
      ]);
      expect(line).not.toMatch(/lucide/);
    }
    expect(stderr).toContain("/before: 2 svg element(s)");
  });

  it("exits 1 and names the path when a page is not 200", async () => {
    const { code, stderr } = await run(["--base", base, "--path", "/missing"]);
    expect(code).toBe(1);
    expect(stderr).toContain("/missing: HTTP 404");
  });

  it("does not follow a redirect: a sign-in bounce is a failure, not a page to compare", async () => {
    const { code, stderr } = await run(["--base", base, "--path", "/private"]);
    expect(code).toBe(1);
    expect(stderr).toContain("HTTP 307");
  });

  it("signs in with the headers local Better Auth needs, then sends the cookie", async () => {
    const { code, stdout, stderr } = await run([
      "--base",
      base,
      "--path",
      "/private",
      "--sign-in",
      "demo@example.com:pass:word",
    ]);
    expect(code, stderr).toBe(0);
    expect(JSON.parse(stdout.trim())).toHaveLength(2);
    const sent = signInHeaders.at(-1)!;
    expect(sent["x-forwarded-proto"]).toBe("http");
    expect(sent.origin).toBe(base);
  });

  it("--compare exits 0 for a lucide-react page against the same page through Icon, and 1 for a change", async () => {
    const before = join(scratch, "before.jsonl");
    const after = join(scratch, "after.jsonl");
    const changed = join(scratch, "changed.jsonl");
    writeFileSync(before, JSON.stringify(inventory(BEFORE_PAGE)) + "\n");
    writeFileSync(after, JSON.stringify(inventory(AFTER_PAGE)) + "\n");
    writeFileSync(changed, JSON.stringify(inventory(CHANGED_PAGE)) + "\n");
    const same = await run(["--compare", before, after]);
    expect(same.code, same.stderr).toBe(0);
    expect(same.stderr).toContain("identical");
    const different = await run(["--compare", before, changed]);
    expect(different.code).toBe(1);
    expect(different.stderr).toContain("only BEFORE");
  });
});
