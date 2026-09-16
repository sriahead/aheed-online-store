import { unzipSync, strFromU8 } from "fflate";
import {
  normalisePostcode,
  formatPostcode,
  postcodeAreaOf,
  postcodeDistrictOf,
} from "@/lib/postcode-normalisation";
import { columnIndex, csvLines, parseCsvLine, requireColumns } from "../csv";
import type {
  ApplyOutcome,
  Db,
  DecommissionOutcome,
  DiscoveredRelease,
  ReferenceDataSource,
  ValidationOutcome,
} from "../source";

/**
 * OS Code-Point Open (#764) — the authority on whether a UK postcode exists, within a materialised
 * area.
 *
 * Open data under OGL v3, published quarterly, requiring no credential of any kind: the product
 * metadata endpoint and the download endpoint are both unauthenticated, which is why this feature
 * has no secret to manage for its sources.
 *
 * Attribution obligations, taken verbatim from `Doc/licence.txt` inside the archive itself:
 *   Contains Ordnance Survey data (c) Crown copyright and database right 2026.
 *   Contains Royal Mail data (c) Royal Mail copyright and database right 2026.
 *   Contains National Statistics data (c) Crown copyright and database right 2026.
 *
 * ## Archive shape, confirmed against the real 2026-08 release
 *
 * 129 entries: `Data/CSV/<area>.csv`, **one file per postcode area** (`mk.csv`, `rg.csv`, ...), plus
 * a `Doc/` folder. That layout is why demand-driven coverage is almost free here: importing two
 * areas means reading two files out of 129, not filtering 1.7M rows.
 *
 * The data files carry **no header row**; the column names live in
 * `Doc/Code-Point_Open_Column_Headers.csv`, which holds two lines — short codes (`PC,PQ,EA,NO,...`)
 * then long names (`Postcode,Positional_quality_indicator,Eastings,Northings,...`). We map from the
 * long-name line, so a column inserted upstream surfaces as a missing-required-column failure rather
 * than as silently misread data.
 */

const PRODUCT = "CodePointOpen";
const METADATA_URL = `https://api.os.uk/downloads/v1/products/${PRODUCT}`;
const DOWNLOADS_URL = `${METADATA_URL}/downloads`;

const HEADER_ENTRY = /Code-Point_Open_Column_Headers\.csv$/i;

const REQUIRED_COLUMNS = [
  "Postcode",
  "Eastings",
  "Northings",
  "Country_code",
  "Admin_county_code",
  "Admin_district_code",
] as const;

/**
 * The smallest plausible postcode count for one area.
 *
 * Even the sparsest GB postcode area holds thousands of units, so a parse yielding fewer than this
 * means the area's file is truncated or its schema moved — not that the area genuinely shrank.
 */
const MINIMUM_RECORDS_PER_AREA = 500;

/** Rows per write. Large enough to keep statement counts sane, small enough to not hit a parameter limit. */
const CHUNK_SIZE = 5_000;

export interface PostcodeRecord {
  normalisedPostcode: string;
  displayPostcode: string;
  postcodeArea: string;
  postcodeDistrict: string;
  eastings: number;
  northings: number;
  adminDistrictCode: string | null;
  adminCountyCode: string | null;
  countryCode: string | null;
}

/** Everything that decides whether a stored row needs rewriting, as one comparable string. */
function signature(record: {
  eastings: number;
  northings: number;
  adminDistrictCode: string | null;
  adminCountyCode: string | null;
  countryCode: string | null;
}): string {
  return [
    record.eastings,
    record.northings,
    record.adminDistrictCode ?? "",
    record.adminCountyCode ?? "",
    record.countryCode ?? "",
  ].join("|");
}

function emptyToNull(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

export const codePointSource: ReferenceDataSource<PostcodeRecord> = {
  key: "code-point-open",
  displayName: "OS Code-Point Open",
  refreshFrequencyDays: 30,
  minimumRecordsPerArea: MINIMUM_RECORDS_PER_AREA,

  async discoverLatest(): Promise<DiscoveredRelease> {
    // No Authorization header, no API key, no credential — see this module's header.
    const [product, downloads] = await Promise.all([
      fetch(METADATA_URL, { headers: { Accept: "application/json" } }).then(readJson),
      fetch(DOWNLOADS_URL, { headers: { Accept: "application/json" } }).then(readJson),
    ]);

    const version = (product as { version?: string }).version;
    if (!version) throw new Error("Code-Point Open: product metadata carried no version");

    const csv = (downloads as { format: string; url: string; md5: string; size: number }[]).find(
      (entry) => entry.format === "CSV",
    );
    if (!csv) throw new Error("Code-Point Open: no CSV download offered for this release");

    return { version, checksum: csv.md5, downloadUrl: csv.url, sizeBytes: csv.size };
  },

  async download(release: DiscoveredRelease): Promise<Uint8Array> {
    const response = await fetch(release.downloadUrl);
    if (!response.ok) {
      throw new Error(`Code-Point Open: download failed with HTTP ${response.status}`);
    }
    return new Uint8Array(await response.arrayBuffer());
  },

  parse(archive: Uint8Array, _release: DiscoveredRelease, areas: string[]): PostcodeRecord[] {
    const files = unzipSync(archive);
    const names = Object.keys(files);

    const headerName = names.find((name) => HEADER_ENTRY.test(name));
    if (!headerName) throw new Error("Code-Point Open: archive carried no column-header document");

    // Two lines: short codes, then the long names we map from.
    const headerLines = [...csvLines(strFromU8(files[headerName]))];
    const longNames = headerLines[1] ?? headerLines[0];
    const columns = requireColumns(columnIndex(longNames), REQUIRED_COLUMNS);

    const records: PostcodeRecord[] = [];

    for (const area of areas) {
      // One file per area — the whole reason demand-driven coverage is cheap for this source.
      const entry = names.find((name) =>
        new RegExp(`^Data/CSV/${area.toLowerCase()}\\.csv$`, "i").test(name),
      );
      if (!entry) {
        throw new Error(
          `Code-Point Open: no data file for postcode area "${area}" — check the configured areas`,
        );
      }

      for (const line of csvLines(strFromU8(files[entry]))) {
        const fields = parseCsvLine(line);
        const normalised = normalisePostcode(fields[columns.Postcode] ?? "");

        // Code-Point pads the outward code to a fixed width, so whitespace varies by postcode
        // length; normalising removes it entirely. A row whose postcode will not parse is skipped
        // rather than stored as a key nothing can ever look up.
        const district = postcodeDistrictOf(normalised);
        const parsedArea = postcodeAreaOf(normalised);
        if (!district || !parsedArea) continue;

        const eastings = Number(fields[columns.Eastings]);
        const northings = Number(fields[columns.Northings]);
        if (!Number.isFinite(eastings) || !Number.isFinite(northings)) continue;

        records.push({
          normalisedPostcode: normalised,
          displayPostcode: formatPostcode(normalised),
          postcodeArea: parsedArea,
          postcodeDistrict: district,
          eastings,
          northings,
          adminDistrictCode: emptyToNull(fields[columns.Admin_district_code]),
          adminCountyCode: emptyToNull(fields[columns.Admin_county_code]),
          countryCode: emptyToNull(fields[columns.Country_code]),
        });
      }
    }

    return records;
  },

  validate(records: PostcodeRecord[], areas: string[]): ValidationOutcome {
    // Checked per area, so a truncated file for one area cannot hide behind a healthy count for
    // another.
    for (const area of areas) {
      const count = records.filter((record) => record.postcodeArea === area).length;
      if (count < MINIMUM_RECORDS_PER_AREA) {
        return {
          ok: false,
          error: `Code-Point Open: postcode area ${area} parsed ${count} records, below the ${MINIMUM_RECORDS_PER_AREA} minimum — treating the release as damaged rather than replacing good data`,
        };
      }
    }
    return { ok: true };
  },

  async apply(
    prisma: Db,
    records: PostcodeRecord[],
    _version: string,
    areas: string[],
  ): Promise<ApplyOutcome> {
    return applyPostcodeRecords(prisma, records, areas);
  },

  async decommissionAreas(prisma: Db, areas: string[]): Promise<DecommissionOutcome> {
    return decommissionPostcodeAreas(prisma, areas);
  },
};

/**
 * Write the parsed release for the given areas.
 *
 * Exported so `tests/reference-sync-integrity.test.ts` can drive it directly with a handful of
 * records and a stub client, proving the insert/update/retire accounting and the area scoping
 * without a 14 MB download.
 *
 * Rows that disappear from a release are marked `isActive = false`, never deleted **by this
 * function**: a postcode OS withdraws should stop being offered, but an `Address` or
 * `CustomerAddress` already holding it must remain explicable rather than pointing at nothing.
 * Deleting an area outright is a separate, opt-in operation — see `decommissionPostcodeAreas`.
 *
 * **Reads and retirement are both scoped to `areas`.** Loading only the areas being imported keeps
 * the comparison map proportional to the work rather than to the whole database, and stops an `LU`
 * import from retiring every `MK` row that was simply not in this pass.
 */
export async function applyPostcodeRecords(
  prisma: Db,
  records: PostcodeRecord[],
  areas: string[],
): Promise<ApplyOutcome> {
  const existing = new Map<string, { signature: string; isActive: boolean }>();

  for (const row of await prisma.postcodeReference.findMany({
    where: { postcodeArea: { in: areas } },
    select: {
      normalisedPostcode: true,
      eastings: true,
      northings: true,
      adminDistrictCode: true,
      adminCountyCode: true,
      countryCode: true,
      isActive: true,
    },
  })) {
    existing.set(row.normalisedPostcode, { signature: signature(row), isActive: row.isActive });
  }

  const toInsert: PostcodeRecord[] = [];
  const toUpdate: PostcodeRecord[] = [];
  const seen = new Set<string>();
  const perArea: Record<string, number> = {};

  for (const record of records) {
    seen.add(record.normalisedPostcode);
    perArea[record.postcodeArea] = (perArea[record.postcodeArea] ?? 0) + 1;

    const previous = existing.get(record.normalisedPostcode);
    if (!previous) toInsert.push(record);
    else if (previous.signature !== signature(record) || !previous.isActive) toUpdate.push(record);
  }

  for (let i = 0; i < toInsert.length; i += CHUNK_SIZE) {
    await prisma.postcodeReference.createMany({
      data: toInsert.slice(i, i + CHUNK_SIZE),
      skipDuplicates: true,
    });
  }

  for (const record of toUpdate) {
    await prisma.postcodeReference.update({
      where: { normalisedPostcode: record.normalisedPostcode },
      data: { ...record, isActive: true },
    });
  }

  const disappeared = [...existing.entries()]
    .filter(([postcode, previous]) => previous.isActive && !seen.has(postcode))
    .map(([postcode]) => postcode);

  let retired = 0;
  for (let i = 0; i < disappeared.length; i += CHUNK_SIZE) {
    const result = await prisma.postcodeReference.updateMany({
      where: { normalisedPostcode: { in: disappeared.slice(i, i + CHUNK_SIZE) } },
      data: { isActive: false },
    });
    retired += result.count;
  }

  return { inserted: toInsert.length, updated: toUpdate.length, retired, perArea };
}

/**
 * Delete every postcode row belonging to the given areas (#770).
 *
 * The one function in this module that deletes, and the counterpart to `applyPostcodeRecords`'s
 * deliberate refusal to. The justification differs because the situations differ: a postcode OS
 * withdraws from a *covered* area is still a fact about a covered area, so it is deactivated and
 * stays explicable. An area we no longer support is not a fact we hold at all — leaving its rows
 * behind, active or inactive, means the reference database keeps answering for a part of the
 * country nothing will ever refresh.
 *
 * `postcodeArea` is in the `where` clause and is not optional. A delete without it would clear the
 * table.
 *
 * Exported so `tests/reference-decommission.test.ts` can drive it with a stub client, and so
 * `tests/reference-decommission-safety.test.ts` has a named function to allow-list.
 */
export async function decommissionPostcodeAreas(
  prisma: Db,
  areas: string[],
): Promise<DecommissionOutcome> {
  if (areas.length === 0) return { deleted: 0 };

  const result = await prisma.postcodeReference.deleteMany({
    where: { postcodeArea: { in: areas } },
  });
  return { deleted: result.count };
}

async function readJson(response: Response): Promise<unknown> {
  if (!response.ok) {
    throw new Error(`Code-Point Open: ${response.url} returned HTTP ${response.status}`);
  }
  return response.json();
}
