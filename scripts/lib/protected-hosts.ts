import { parseEnvFile } from "./env-file";

/**
 * The one guard that stops a row-writing script from reaching a DEPLOYED database (#490).
 *
 * WHY THIS EXISTS AS A MODULE RATHER THAN A COPY PER SCRIPT.
 * `scripts/verify-repository-injection.ts` has carried this logic since #411/#412 and it is the
 * strong version of the control: it refuses BEFORE a Prisma client is constructed, and it refuses
 * when it cannot PROVE safety rather than when it can prove danger. `prisma/seed.ts`'s
 * generated-catalogue path (#489) got the weak version instead — it prints the resolved host and
 * trusts a human to read it. #490 is that asymmetry, and `CLAUDE.md` records why print-and-trust is
 * not good enough: at P5a's validation `.env` and `.dev.vars` agreed with each other and both named
 * production while every surrounding value looked like staging, and a migration reached the
 * production database ahead of its promotion PR (#1134). A human reading a printed hostname is a
 * control that has already failed here once.
 *
 * TWO SUBTLETIES THAT MAKE OR BREAK IT. A guard missing either is bypassable:
 *
 *   1. Neon gives every project a POOLED and a DIRECT host that differ only by a `-pooler` segment.
 *      `normalizeHost` strips it, so naming either form in a connection string matches a protected
 *      host recorded in the other form.
 *   2. `secrets/*.vars` are gitignored, hand-maintained and will never be seen by a linter or a code
 *      review, so their formatting varies — #505 found two reference-database keys written with
 *      spaces around `=`. Parsing is delegated to `parseEnvFile`, this directory's existing tolerant
 *      parser, which handles the spaced form, quoted values and trailing `#` comments. Do not
 *      replace it with a regex: a line this module fails to parse is a protected host it fails to
 *      protect, which is silent.
 *
 * THERE IS DELIBERATELY NO OVERRIDE. No parameter, no environment variable, no flag. A script that
 * genuinely needs to write to staging or production is a script that should not import this module.
 */

/** The files whose `DATABASE_URL`/`DIRECT_URL` hosts are off limits. */
export const PROTECTED_VAR_FILES = ["secrets/staging.vars", "secrets/production.vars"];

/** The connection-string keys a protected host can be named by. */
const HOST_KEYS = ["DATABASE_URL", "DIRECT_URL"];

/**
 * Host only, lowercased, with Neon's `-pooler` suffix stripped so the pooled and direct URLs for
 * one project compare equal. `null` when the string carries no `@host` part at all.
 */
export function normalizeHost(url: string): string | null {
  const match = /@([^:/?]+)/.exec(url);
  if (!match) return null;
  return match[1].toLowerCase().replace(/-pooler\./, ".");
}

/**
 * Every host named by the protected var files, plus which of those files were actually readable.
 *
 * `readFiles` is the load-bearing half: an empty list means "nothing could be checked", which the
 * caller must treat as unsafe rather than as safe. A file that is absent is skipped here and
 * handled by `assertNotDeployedDatabase`, never silently ignored.
 */
export function protectedHosts(): { hosts: Set<string>; readFiles: string[] } {
  const hosts = new Set<string>();
  const readFiles: string[] = [];

  for (const file of PROTECTED_VAR_FILES) {
    let values: Record<string, string>;
    try {
      values = parseEnvFile(file);
    } catch {
      continue; // absent or unreadable — `readFiles` records the gap for the caller
    }
    readFiles.push(file);
    for (const key of HOST_KEYS) {
      const value = values[key];
      const host = value ? normalizeHost(value) : null;
      if (host) hosts.add(host);
    }
  }

  return { hosts, readFiles };
}

/**
 * Throw unless `connectionString` provably names a database that is NOT staging or production.
 *
 * Three refusals, and the second is the one people get wrong: when neither protected var file can be
 * read, this cannot confirm the target is safe, so it refuses rather than assuming absence means a
 * dev database.
 *
 * Returns the resolved host and the files checked, so a caller can log what was verified without
 * reading the files a second time.
 */
export function assertNotDeployedDatabase(connectionString: string | undefined): {
  host: string | null;
  readFiles: string[];
} {
  if (!connectionString) {
    throw new Error(
      "DIRECT_URL/DATABASE_URL is empty — check .env is present and loading. Refusing to run " +
        "rather than guessing which database this is.",
    );
  }

  const host = normalizeHost(connectionString);
  const { hosts, readFiles } = protectedHosts();

  if (readFiles.length === 0) {
    throw new Error(
      `Neither ${PROTECTED_VAR_FILES.join(" nor ")} could be read, so this cannot confirm it is ` +
        "NOT pointed at a deployed database. It writes rows, so it refuses rather than guessing. " +
        "Restore those files and re-run.",
    );
  }

  if (host && hosts.has(host)) {
    throw new Error(
      `REFUSING TO RUN: ${host} is a host named in ${readFiles.join(" / ")}, i.e. staging or ` +
        "production. This path creates or modifies real rows and is only for a dev database.",
    );
  }

  return { host, readFiles };
}
