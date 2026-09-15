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
  DiscoveredRelease,
  ReferenceDataSource,
  ValidationOutcome,
} from "../source";

/**
 * OS Code-Point Open (#764) — the authority on whether a UK postcode exists.
 *
 * Open data under OGL v3, published quarterly, requiring no credential of any kind: the product
 * metadata endpoint and the download endpoint are both unauthenticated, which is why this feature
 * has no secret to manage and could be built without waiting on anybody.
 *
 * Attribution obligations, taken verbatim from `Doc/licence.txt` inside the archive itself:
 *   Contains Ordnance Survey data (c) Crown copyright and database right 2026.
 *   Contains Royal Mail data (c) Royal Mail copyright and database right 2026.
 *   Contains National Statistics data (c) Crown copyright and database right 2026.
 *
 * ## Archive shape, confirmed against the real 2026-08 release
 *
 * 129 entries: `Data/CSV/<area>.csv`, one per postcode area (`mk.csv`, `sw.csv`, ...), plus a
 * `Doc/` folder. The data files carry **no header row**; the column names live in
 * `Doc/Code-Point_Open_Column_Headers.csv`, which holds two lines — short codes (`PC,PQ,EA,NO,...`)
 * then long names (`Postcode,Positional_quality_indicator,Eastings,Northings,...`). We map from the
 * long-name line, so a column inserted upstream surfaces as a missing-required-column failure
 * rather than as silently misread data.
 */

const PRODUCT = "CodePointOpen";
const METADATA_URL = `https://api.os.uk/downloads/v1/products/${PRODUCT}`;
const DOWNLOADS_URL = `${METADATA_URL}/downloads`;

const HEADER_ENTRY = /Code-Point_Open_Column_Headers\.csv$/i;
const DATA_ENTRY = /^Data\/CSV\/.+\.csv$/i;

const REQUIRED_COLUMNS = [
  "Postcode",
  "Eastings",
  "Northings",
  "Country_code",
  "Admin_county_code",
  "Admin_district_code",
] as const;

/**
 * Great Britain has roughly 1.7 million live postcode units. A release parsing to fewer than a
 * million is damaged or truncated, not a real contraction, and must not be allowed to replace a
 * complete dataset.
 */
const MINIMUM_RECORD_COUNT = 1_000_000;

/** Rows per write. Large enough that 1.7M rows is a few hundred statements, small enough to not blow a parameter limit. */
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
function signature(record: PostcodeRecord): string {
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
  minimumRecordCount: MINIMUM_RECORD_COUNT,

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

  parse(archive: Uint8Array): PostcodeRecord[] {
    const files = unzipSync(archive);
    const names = Object.keys(files);

    const headerName = names.find((name) => HEADER_ENTRY.test(name));
    if (!headerName) throw new Error("Code-Point Open: archive carried no column-header document");

    // Two lines: short codes, then the long names we map from.
    const headerLines = [...csvLines(strFromU8(files[headerName]))];
    const longNames = headerLines[1] ?? headerLines[0];
    const columns = requireColumns(columnIndex(longNames), REQUIRED_COLUMNS);

    const records: PostcodeRecord[] = [];

    for (const name of names.filter((entry) => DATA_ENTRY.test(entry))) {
      for (const line of csvLines(strFromU8(files[name]))) {
        const fields = parseCsvLine(line);
        const rawPostcode = fields[columns.Postcode] ?? "";
        const normalised = normalisePostcode(rawPostcode);

        // Code-Point pads the outward code to a fixed width, so whitespace varies by postcode
        // length; normalising removes it entirely. A row whose postcode will not parse is skipped
        // rather than stored as a key nothing can ever look up.
        const district = postcodeDistrictOf(normalised);
        const area = postcodeAreaOf(normalised);
        if (!district || !area) continue;

        const eastings = Number(fields[columns.Eastings]);
        const northings = Number(fields[columns.Northings]);
        if (!Number.isFinite(eastings) || !Number.isFinite(northings)) continue;

        records.push({
          normalisedPostcode: normalised,
          displayPostcode: formatPostcode(normalised),
          postcodeArea: area,
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

  validate(records: PostcodeRecord[]): ValidationOutcome {
    if (records.length < MINIMUM_RECORD_COUNT) {
      return {
        ok: false,
        error: `Code-Point Open: parsed ${records.length} records, below the ${MINIMUM_RECORD_COUNT} minimum — treating the release as damaged rather than replacing a complete dataset`,
      };
    }
    return { ok: true };
  },

  async apply(prisma: Db, records: PostcodeRecord[], version: string): Promise<ApplyOutcome> {
    return applyPostcodeRecords(prisma, records, version);
  },
};

/**
 * Write the parsed release.
 *
 * Exported so `tests/reference-sync-integrity.test.ts` can drive it directly with a handful of
 * records and a stub client, proving the insert/update/retire accounting without a 14 MB download.
 *
 * Rows that disappear from a release are marked `isActive = false`, never deleted: a postcode that
 * OS withdraws should stop being offered, but an `Address` or `CustomerAddress` already holding it
 * must remain explicable rather than pointing at nothing.
 */
export async function applyPostcodeRecords(
  prisma: Db,
  records: PostcodeRecord[],
  version: string,
): Promise<ApplyOutcome> {
  const existing = new Map<string, { signature: string; isActive: boolean }>();

  // Paged so the read does not materialise 1.7M rows in one statement. Only the fields that decide
  // "has this changed?" are selected; the full row is never needed here.
  let cursor: string | undefined;
  for (;;) {
    const page = await prisma.postcodeReference.findMany({
      take: CHUNK_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
      select: {
        id: true,
        normalisedPostcode: true,
        eastings: true,
        northings: true,
        adminDistrictCode: true,
        adminCountyCode: true,
        countryCode: true,
        isActive: true,
      },
    });
    if (page.length === 0) break;

    for (const row of page) {
      existing.set(row.normalisedPostcode, {
        signature: [
          row.eastings,
          row.northings,
          row.adminDistrictCode ?? "",
          row.adminCountyCode ?? "",
          row.countryCode ?? "",
        ].join("|"),
        isActive: row.isActive,
      });
    }

    cursor = page[page.length - 1].id;
    if (page.length < CHUNK_SIZE) break;
  }

  const toInsert: PostcodeRecord[] = [];
  const toUpdate: PostcodeRecord[] = [];
  const seen = new Set<string>();

  for (const record of records) {
    seen.add(record.normalisedPostcode);
    const previous = existing.get(record.normalisedPostcode);
    if (!previous) toInsert.push(record);
    else if (previous.signature !== signature(record) || !previous.isActive) toUpdate.push(record);
  }

  for (let i = 0; i < toInsert.length; i += CHUNK_SIZE) {
    await prisma.postcodeReference.createMany({
      data: toInsert.slice(i, i + CHUNK_SIZE).map((record) => ({ ...record, sourceVersion: version })), // prettier-ignore
      skipDuplicates: true,
    });
  }

  for (const record of toUpdate) {
    await prisma.postcodeReference.update({
      where: { normalisedPostcode: record.normalisedPostcode },
      data: { ...record, sourceVersion: version, isActive: true },
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

  return { inserted: toInsert.length, updated: toUpdate.length, retired };
}

async function readJson(response: Response): Promise<unknown> {
  if (!response.ok) {
    throw new Error(`Code-Point Open: ${response.url} returned HTTP ${response.status}`);
  }
  return response.json();
}
