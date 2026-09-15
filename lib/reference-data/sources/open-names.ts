import { unzipSync, strFromU8 } from "fflate";
import { columnIndex, csvLines, parseCsvLine, requireColumns } from "../csv";
import type {
  ApplyOutcome,
  Db,
  DiscoveredRelease,
  ReferenceDataSource,
  ValidationOutcome,
} from "../source";

/**
 * OS Open Names (#764) — geographic ENRICHMENT ONLY.
 *
 * Open data under OGL v3, no credential required, same unauthenticated endpoint as Code-Point.
 * Attribution, verbatim from `Doc/licence.txt` inside the archive:
 *   Contains OS data (c) Crown Copyright and database rights 2026.
 *   Contains Royal Mail data (c) Royal Mail copyright and database right 2026.
 *   Contains National Statistics data (c) Crown copyright and database right 2026.
 *
 * **Absence from this dataset must never make a postcode or an address invalid.** Code-Point alone
 * answers existence; this answers "what is near here, and what is this place called".
 *
 * ## Archive shape, confirmed against the real 2026-07 release
 *
 * 824 entries: 819 `Data/<GRID TILE>.csv` files (`SP82.csv`, `TQ28.csv`, ... each covering a 20 km
 * square), plus `Doc/OS_Open_Names_Header.csv` carrying the 34 column names on a single line. Data
 * files have no header row. Fields are mostly unquoted, but a name containing a comma is quoted —
 * which is why `parseCsvLine` exists rather than `split(",")`.
 *
 * ## What is imported, and what is deliberately skipped
 *
 * Open Names contains roughly 2.9M records, of which about 1.6M are `LOCAL_TYPE = Postcode`.
 * **Those are skipped.** Importing them would create a second postcode authority inside a system
 * whose whole validity model rests on Code-Point being the only one, and the two would eventually
 * disagree. Landcover, hydrography and landform are skipped as irrelevant to an address form.
 *
 * What remains is what enrichment actually needs:
 * - `transportNetwork` — named and numbered roads, the source of street suggestions.
 * - `populatedPlace` — settlements, the source of a town name.
 *
 * Both carry `DISTRICT_BOROUGH` and `COUNTY_UNITARY` as human-readable NAMES, which is how a
 * lookup resolves "Milton Keynes" and a county. Code-Point supplies only administrative CODES
 * (`E06000042`), so without this dataset the API could report a postcode's location as a code no
 * shopper could read.
 */

const PRODUCT = "OpenNames";
const METADATA_URL = `https://api.os.uk/downloads/v1/products/${PRODUCT}`;
const DOWNLOADS_URL = `${METADATA_URL}/downloads`;

const HEADER_ENTRY = /OS_Open_Names_Header\.csv$/i;
const DATA_ENTRY = /^Data\/.+\.csv$/i;

const REQUIRED_COLUMNS = [
  "ID",
  "NAME1",
  "TYPE",
  "LOCAL_TYPE",
  "GEOMETRY_X",
  "GEOMETRY_Y",
  "POSTCODE_DISTRICT",
  "POPULATED_PLACE",
  "DISTRICT_BOROUGH",
  "COUNTY_UNITARY",
  "REGION",
  "COUNTRY",
] as const;

/** The two record types this application has a use for. */
export const TRANSPORT_NETWORK = "transportNetwork";
export const POPULATED_PLACE = "populatedPlace";
const IMPORTED_TYPES = new Set([TRANSPORT_NETWORK, POPULATED_PLACE]);

/**
 * Roads and settlements alone account for well over 800,000 records in a healthy release. A parse
 * yielding fewer than half a million means the archive is truncated or its schema moved.
 */
const MINIMUM_RECORD_COUNT = 500_000;

const CHUNK_SIZE = 5_000;

export interface PlaceRecord {
  sourceId: string;
  name: string;
  type: string;
  localType: string;
  eastings: number;
  northings: number;
  postcodeDistrict: string | null;
  populatedPlace: string | null;
  districtBorough: string | null;
  countyUnitary: string | null;
  region: string | null;
  country: string | null;
}

function signature(record: PlaceRecord): string {
  return [
    record.name,
    record.type,
    record.localType,
    record.eastings,
    record.northings,
    record.postcodeDistrict ?? "",
    record.populatedPlace ?? "",
    record.districtBorough ?? "",
    record.countyUnitary ?? "",
  ].join("|");
}

function emptyToNull(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

export const openNamesSource: ReferenceDataSource<PlaceRecord> = {
  key: "os-open-names",
  displayName: "OS Open Names",
  refreshFrequencyDays: 30,
  minimumRecordCount: MINIMUM_RECORD_COUNT,

  async discoverLatest(): Promise<DiscoveredRelease> {
    const [product, downloads] = await Promise.all([
      fetch(METADATA_URL, { headers: { Accept: "application/json" } }).then(readJson),
      fetch(DOWNLOADS_URL, { headers: { Accept: "application/json" } }).then(readJson),
    ]);

    const version = (product as { version?: string }).version;
    if (!version) throw new Error("OS Open Names: product metadata carried no version");

    const csv = (downloads as { format: string; url: string; md5: string; size: number }[]).find(
      (entry) => entry.format === "CSV",
    );
    if (!csv) throw new Error("OS Open Names: no CSV download offered for this release");

    return { version, checksum: csv.md5, downloadUrl: csv.url, sizeBytes: csv.size };
  },

  async download(release: DiscoveredRelease): Promise<Uint8Array> {
    const response = await fetch(release.downloadUrl);
    if (!response.ok) {
      throw new Error(`OS Open Names: download failed with HTTP ${response.status}`);
    }
    return new Uint8Array(await response.arrayBuffer());
  },

  parse(archive: Uint8Array): PlaceRecord[] {
    const files = unzipSync(archive);
    const names = Object.keys(files);

    const headerName = names.find((name) => HEADER_ENTRY.test(name));
    if (!headerName) throw new Error("OS Open Names: archive carried no column-header document");

    const headerLine = [...csvLines(strFromU8(files[headerName]))][0] ?? "";
    const columns = requireColumns(columnIndex(headerLine), REQUIRED_COLUMNS);

    const records: PlaceRecord[] = [];

    for (const name of names.filter((entry) => DATA_ENTRY.test(entry))) {
      for (const line of csvLines(strFromU8(files[name]))) {
        const fields = parseCsvLine(line);

        const type = fields[columns.TYPE]?.trim() ?? "";
        if (!IMPORTED_TYPES.has(type)) continue;

        const sourceId = fields[columns.ID]?.trim() ?? "";
        const placeName = fields[columns.NAME1]?.trim() ?? "";
        if (!sourceId || !placeName) continue;

        const eastings = Number(fields[columns.GEOMETRY_X]);
        const northings = Number(fields[columns.GEOMETRY_Y]);
        if (!Number.isFinite(eastings) || !Number.isFinite(northings)) continue;

        records.push({
          sourceId,
          name: placeName,
          type,
          localType: fields[columns.LOCAL_TYPE]?.trim() ?? "",
          eastings,
          northings,
          postcodeDistrict: emptyToNull(fields[columns.POSTCODE_DISTRICT]),
          populatedPlace: emptyToNull(fields[columns.POPULATED_PLACE]),
          districtBorough: emptyToNull(fields[columns.DISTRICT_BOROUGH]),
          countyUnitary: emptyToNull(fields[columns.COUNTY_UNITARY]),
          region: emptyToNull(fields[columns.REGION]),
          country: emptyToNull(fields[columns.COUNTRY]),
        });
      }
    }

    return records;
  },

  validate(records: PlaceRecord[]): ValidationOutcome {
    if (records.length < MINIMUM_RECORD_COUNT) {
      return {
        ok: false,
        error: `OS Open Names: parsed ${records.length} records, below the ${MINIMUM_RECORD_COUNT} minimum — treating the release as damaged rather than replacing a complete dataset`,
      };
    }
    return { ok: true };
  },

  async apply(prisma: Db, records: PlaceRecord[], version: string): Promise<ApplyOutcome> {
    return applyPlaceRecords(prisma, records, version);
  },
};

/**
 * Write the parsed release, retiring rather than deleting anything that disappeared.
 *
 * Exported for `tests/reference-sync-integrity.test.ts`, which drives it with a few records and a
 * stub client rather than a 103 MB archive.
 */
export async function applyPlaceRecords(
  prisma: Db,
  records: PlaceRecord[],
  version: string,
): Promise<ApplyOutcome> {
  const existing = new Map<string, { signature: string; isActive: boolean }>();

  let cursor: string | undefined;
  for (;;) {
    const page = await prisma.placeReference.findMany({
      take: CHUNK_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
      select: {
        id: true,
        sourceId: true,
        name: true,
        type: true,
        localType: true,
        eastings: true,
        northings: true,
        postcodeDistrict: true,
        populatedPlace: true,
        districtBorough: true,
        countyUnitary: true,
        isActive: true,
      },
    });
    if (page.length === 0) break;

    for (const row of page) {
      existing.set(row.sourceId, {
        signature: [
          row.name,
          row.type,
          row.localType,
          row.eastings,
          row.northings,
          row.postcodeDistrict ?? "",
          row.populatedPlace ?? "",
          row.districtBorough ?? "",
          row.countyUnitary ?? "",
        ].join("|"),
        isActive: row.isActive,
      });
    }

    cursor = page[page.length - 1].id;
    if (page.length < CHUNK_SIZE) break;
  }

  const toInsert: PlaceRecord[] = [];
  const toUpdate: PlaceRecord[] = [];
  const seen = new Set<string>();

  for (const record of records) {
    seen.add(record.sourceId);
    const previous = existing.get(record.sourceId);
    if (!previous) toInsert.push(record);
    else if (previous.signature !== signature(record) || !previous.isActive) toUpdate.push(record);
  }

  for (let i = 0; i < toInsert.length; i += CHUNK_SIZE) {
    await prisma.placeReference.createMany({
      data: toInsert.slice(i, i + CHUNK_SIZE).map((record) => ({ ...record, sourceVersion: version })), // prettier-ignore
      skipDuplicates: true,
    });
  }

  for (const record of toUpdate) {
    await prisma.placeReference.update({
      where: { sourceId: record.sourceId },
      data: { ...record, sourceVersion: version, isActive: true },
    });
  }

  const disappeared = [...existing.entries()]
    .filter(([sourceId, previous]) => previous.isActive && !seen.has(sourceId))
    .map(([sourceId]) => sourceId);

  let retired = 0;
  for (let i = 0; i < disappeared.length; i += CHUNK_SIZE) {
    const result = await prisma.placeReference.updateMany({
      where: { sourceId: { in: disappeared.slice(i, i + CHUNK_SIZE) } },
      data: { isActive: false },
    });
    retired += result.count;
  }

  return { inserted: toInsert.length, updated: toUpdate.length, retired };
}

async function readJson(response: Response): Promise<unknown> {
  if (!response.ok) {
    throw new Error(`OS Open Names: ${response.url} returned HTTP ${response.status}`);
  }
  return response.json();
}
