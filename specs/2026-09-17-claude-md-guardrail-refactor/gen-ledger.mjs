// Generates the per-line migration ledger for #786 from the pre-change CLAUDE.md.
// Blocks are rule units in ANY markdown form: heading, top-level bullet (+continuations),
// nested bullet, numbered item, or a run of left-margin prose. Every non-blank body line
// lands in exactly one block, which is what makes R5's coverage check total.
import { readFileSync, writeFileSync } from "node:fs";

const src = readFileSync(process.argv[2], "utf8").replace(/\r\n/g, "\n").split("\n");
const START = 14; // first body line (front-matter closes at 12)

// section heading line -> [disposition, destination, heading at destination]
const MAP = {
  "What this project is": ["COMPRESS", "CLAUDE.md", "What this project is"],
  "Runtime & hosting": ["KEEP", "CLAUDE.md", "Runtime & hosting"],
  "Database (Neon": [
    "COMPRESS",
    "docs/developer-portal/runtime-pitfalls.md",
    "Prisma and Neon on V8 isolates",
  ],
  "There are TWO databases": [
    "COMPRESS",
    "docs/developer-portal/runtime-pitfalls.md",
    "The second database",
  ],
  "Schema rules": ["COMPRESS", "specs/architecture.md", "3.1 Modelling rules"],
  "Storage (ADR-003)": ["COMPRESS", "docs/developer-portal/runtime-pitfalls.md", "Object storage"],
  "Cloudflare edge caching": [
    "MOVE",
    "docs/developer-portal/runtime-pitfalls.md",
    "Cloudflare edge caching of Worker routes",
  ],
  "Config & secrets": [
    "COMPRESS",
    "docs/developer-portal/env-setup.md",
    "Config precedence, and the traps in it",
  ],
  "Branch strategy & CI/CD": [
    "COMPRESS",
    "docs/developer-portal/sdd/operator-runbook.md",
    "Branch strategy and CI — the detail",
  ],
  "The four SDD gates": ["KEEP", "CLAUDE.md", "The four SDD gates"],
  "Windows shell & file encoding": [
    "COMPRESS",
    "docs/developer-portal/local-dev-playbook.md",
    "Windows shell and file encoding",
  ],
  "Dependency & version discipline": [
    "COMPRESS",
    "specs/tech-stack.md",
    "Dependency & version discipline",
  ],
  "Server Actions": ["COMPRESS", "docs/developer-portal/app-conventions.md", "Server Actions"],
  "Repository layer": ["COMPRESS", "docs/developer-portal/app-conventions.md", "Repository layer"],
  "Staff panel pages": [
    "COMPRESS",
    "docs/developer-portal/app-conventions.md",
    "Staff panel pages",
  ],
  "KMS docs": ["MOVE", "specs/sdd-workflow.md", "Front-matter and MDX traps when writing a spec"],
  "Design tokens": ["COMPRESS", "specs/design-system.md", "Token and branding traps"],
  "Workers AI": [
    "MOVE",
    "docs/developer-portal/runtime-pitfalls.md",
    "Workers AI (Cloudflare REST API calls)",
  ],
  "Local Stripe webhook testing": [
    "MOVE",
    "docs/developer-portal/env-setup.md",
    "Local Stripe webhook testing",
  ],
  "Live-testing staff panel": [
    "MOVE",
    "docs/developer-portal/local-dev-playbook.md",
    "Live-testing staff panel server actions",
  ],
  "Better Auth": [
    "MOVE",
    "docs/developer-portal/runtime-pitfalls.md",
    "Better Auth (`lib/auth.ts`, ADR-002)",
  ],
  "React & Next.js Hooks": [
    "COMPRESS",
    "docs/developer-portal/app-conventions.md",
    "React and Next.js hooks",
  ],
  "Hard stops": ["KEEP", "CLAUDE.md", "Hard stops"],
};

function sectionFor(h) {
  for (const k of Object.keys(MAP)) if (h.includes(k)) return MAP[k];
  return null;
}

// Build blocks.
const blocks = [];
let cur = null;
let section = "(header)";
let secMeta = ["KEEP", "CLAUDE.md", "header"];

const push = () => {
  if (cur) {
    blocks.push(cur);
    cur = null;
  }
};

for (let i = START; i <= src.length; i++) {
  const line = src[i - 1];
  if (line === undefined) break;
  if (line.trim() === "") {
    continue;
  } // blanks are not accountable
  const isHeading = /^#{1,3} /.test(line);
  const isTop = /^- /.test(line);
  const isNested = /^ {2,4}- /.test(line);
  const isNum = /^ *[0-9]+\. /.test(line);
  const isCont = /^ {2,}/.test(line);

  if (isHeading) {
    push();
    if (/^## /.test(line)) {
      section = line.replace(/^## /, "");
      secMeta = sectionFor(section) || ["KEEP", "CLAUDE.md", section];
    }
    blocks.push({ s: i, e: i, section, kind: "heading", text: line });
    continue;
  }
  if (isTop || isNested || isNum) {
    push();
    cur = {
      s: i,
      e: i,
      section,
      kind: isNum ? "numbered" : isNested ? "nested" : "bullet",
      text: line,
    };
    continue;
  }
  if (isCont && cur) {
    cur.e = i;
    continue;
  }
  // left-margin prose
  if (cur && cur.kind === "prose") {
    cur.e = i;
    continue;
  }
  push();
  cur = { s: i, e: i, section, kind: "prose", text: line };
}
push();
blocks.sort((a, b) => a.s - b.s);

// Per-block overrides: content genuinely dropped rather than relocated.
const DELETES = [
  [
    21,
    23,
    "DELETE",
    "DUPLICATE",
    "specs/roadmap.md change log",
    "Stale M0 claim; current phase stated in CLAUDE.md 'What this project is' (#786 reconciliation 1)",
  ],
  [
    596,
    596,
    "DELETE",
    "DUPLICATE",
    "docs/developer-portal/sdd/operator-runbook.md",
    "phase:/gate: label clause dropped; see the note in 'Branch strategy and CI — the detail' (#546)",
  ],
];

function phraseOf(b) {
  const body = src
    .slice(b.s - 1, b.e)
    .join(" ")
    .replace(/\s+/g, " ")
    .replace(/^[-#\s]*/, "");
  const stripped = body.replace(/\*\*/g, "");
  return stripped.slice(0, 55).trim();
}

// Refs whose real destination differs from their section default, established by running
// verify-ledger.mjs and reading each failure rather than assuming the section map was right.
const OVERRIDES = {
  // Schema rules: architecture.md §3.1 already stated these in its own words — duplicates, not moves.
  L32: ["DELETE", "specs/architecture.md", "DUPLICATE", "§3.1 'Strict relational / 3NF'"],
  L33: ["DELETE", "specs/architecture.md", "DUPLICATE", "§3.1 'No raw SQL in application code'"],
  L34: ["DELETE", "specs/architecture.md", "DUPLICATE", "§3.1 states the migration-DDL ruling"],
  L37: ["DELETE", "specs/architecture.md", "DUPLICATE", "§3.1 'Money as integer minor units'"],
  L38: [
    "DELETE",
    "specs/architecture.md",
    "DUPLICATE",
    "§3.1 'Images/large files never in the DB'",
  ],
  // These two WERE added to §3.1 by this slice.
  L35: ["COMPRESS", "specs/architecture.md", "3.1 Modelling rules", "one statement, one table"],
  L36: [
    "COMPRESS",
    "specs/architecture.md",
    "3.1 Modelling rules",
    "The procedure this implies, stated explicitly",
  ],
  // Relocated to the storage pitfalls, not to the data model.
  L39: [
    "MOVE",
    "docs/developer-portal/runtime-pitfalls.md",
    "A row and the object it names",
    'treat "the row exists" as no evidence the image loads',
  ],
  // Dependency bullets 4-9 are version-adjacent FAILURES: they went to runtime-pitfalls,
  // while tech-stack.md took only the policy bullets (1-3).
  L104: [
    "COMPRESS",
    "docs/developer-portal/runtime-pitfalls.md",
    "Framework and dependency traps",
    "npm audit fix --force",
  ],
  L105: [
    "COMPRESS",
    "docs/developer-portal/runtime-pitfalls.md",
    "Framework and dependency traps",
    "Do NOT jump breaking majors mid-stream",
  ],
  L106: [
    "MOVE",
    "docs/developer-portal/runtime-pitfalls.md",
    "Framework and dependency traps",
    "npm 11+ blocks dependency install scripts",
  ],
  L107: [
    "MOVE",
    "docs/developer-portal/runtime-pitfalls.md",
    "Framework and dependency traps",
    "Next 16 defaults to Turbopack",
  ],
  L108: [
    "MOVE",
    "docs/developer-portal/runtime-pitfalls.md",
    "Framework and dependency traps",
    "There is no `proxy.ts`/`middleware.ts` this project can currently ship",
  ],
  L109: [
    "MOVE",
    "docs/developer-portal/runtime-pitfalls.md",
    "Framework and dependency traps",
    "ESLint 9 requires flat config",
  ],
  L110: [
    "MOVE",
    "docs/developer-portal/runtime-pitfalls.md",
    "Framework and dependency traps",
    "must be `.mts`",
  ],
  L111: [
    "MOVE",
    "docs/developer-portal/runtime-pitfalls.md",
    "Framework and dependency traps",
    "it.skipIf(!process.env.DATABASE_URL)",
  ],
};

const rows = [];
blocks.forEach((b, idx) => {
  const ref = "L" + (idx + 1);
  const del = DELETES.find(([s, e]) => b.s >= s && b.e <= e);
  let disp, dest, head, phrase;
  const meta = sectionFor(b.section) || ["KEEP", "CLAUDE.md", b.section];
  if (del) {
    disp = "DELETE";
    dest = del[4];
    head = del[3];
    phrase = del[5];
  } else {
    [disp, dest, head] = meta;
    phrase = b.kind === "heading" && dest !== "CLAUDE.md" ? head : phraseOf(b);
  }
  const ov = OVERRIDES[ref];
  if (ov) {
    disp = ov[0];
    dest = ov[1];
    head = ov[2];
    phrase = ov[3];
  }
  const rule = phraseOf(b).replace(/\|/g, "\\|").slice(0, 60);
  rows.push(
    `| ${ref} | ${b.s}-${b.e} | ${b.section.replace(/\|/g, "")} | ${rule} | ${disp} | ${dest} | ${head.replace(/\|/g, "")} | ${phrase.replace(/\|/g, "\\|")} |`,
  );
});

const out = [
  "# CLAUDE.md guardrail refactor — migration ledger (#786)",
  "",
  "Generated from the pre-change `CLAUDE.md` (the merge-base version) by",
  "`specs/2026-09-17-claude-md-guardrail-refactor/gen-ledger.mjs`. **Every non-blank body line of",
  "that file — lines 14 through 1651 — is claimed by exactly one row below**, which is what R5",
  "verifies. Blocks are rule units in any Markdown form: heading, top-level bullet with its",
  "continuation lines, nested bullet, numbered item, or a run of left-margin prose. The bullet is",
  "not the unit; the line is.",
  "",
  "`Disposition`: `KEEP` (stays in `CLAUDE.md`), `COMPRESS` (a short form stays in `CLAUDE.md`, the",
  "full text moved), `MOVE` (left `CLAUDE.md` entirely), `DELETE` (removed as duplicate or as",
  "narrative supporting another row — the `Heading` column then carries the classification).",
  "",
  "`Verify phrase` is a literal substring that must appear in `Destination`.",
  "",
  "| Ref | Lines | Section | Rule | Disposition | Destination | Heading | Verify phrase |",
  "|---|---|---|---|---|---|---|---|",
  ...rows,
  "",
].join("\n");

writeFileSync(process.argv[3], out, "utf8");
console.log("rows:", rows.length, "last line covered:", blocks[blocks.length - 1].e);
