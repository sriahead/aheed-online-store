import { unzipSync, strFromU8 } from "fflate";
import { columnIndex, csvLines, parseCsvLine, requireColumns } from "../csv";
import { postcodeAreaOf } from "@/lib/postcode-normalisation";
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
 * The smallest plausible count for one postcode area.
 *
 * Deliberately low. Open Names coverage varies enormously by area — a dense urban area yields tens
 * of thousands of roads while a sparse rural one yields hundreds — so this floor only catches an
 * archive that is truncated or whose schema moved, never a genuinely small area.
 */
const MINIMUM_RECORDS_PER_AREA = 50;

const CHUNK_SIZE = 5_000;

export interface PlaceRecord {
  sourceId: string;
  postcodeArea: string | null;
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
  minimumRecordsPerArea: MINIMUM_RECORDS_PER_AREA,

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

  parse(archive: Uint8Array, _release: DiscoveredRelease, areas: string[]): PlaceRecord[] {
    // Open Names is tiled by GRID SQUARE, not by postcode area, so unlike Code-Point every tile has
    // to be read and rows filtered on the area prefix of their POSTCODE_DISTRICT. The archive is
    // decompressed once either way; what demand-driven coverage saves here is the writing, not the
    // reading.
    const wanted = new Set(areas);
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

        // A record with no postcode district cannot be attributed to an area, so it can never be
        // covered, retired or served — skipping it keeps the table honest about what it holds.
        const district = emptyToNull(fields[columns.POSTCODE_DISTRICT]);
        const area = district
          ? (postcodeAreaOf(district + "1AA") ?? districtAreaPrefix(district))
          : null;
        if (!area || !wanted.has(area)) continue;

        const eastings = Number(fields[columns.GEOMETRY_X]);
        const northings = Number(fields[columns.GEOMETRY_Y]);
        if (!Number.isFinite(eastings) || !Number.isFinite(northings)) continue;

        records.push({
          sourceId,
          postcodeArea: area,
          name: placeName,
          type,
          localType: fields[columns.LOCAL_TYPE]?.trim() ?? "",
          eastings,
          northings,
          postcodeDistrict: district,
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

  validate(records: PlaceRecord[], areas: string[]): ValidationOutcome {
    for (const area of areas) {
      const count = records.filter((record) => record.postcodeArea === area).length;
      if (count < MINIMUM_RECORDS_PER_AREA) {
        return {
          ok: false,
          error: `OS Open Names: postcode area ${area} parsed ${count} records, below the ${MINIMUM_RECORDS_PER_AREA} minimum — treating the release as damaged rather than replacing good data`,
        };
      }
    }
    return { ok: true };
  },

  async apply(
    prisma: Db,
    records: PlaceRecord[],
    _version: string,
    areas: string[],
  ): Promise<ApplyOutcome> {
    return applyPlaceRecords(prisma, records, areas);
  },
};

/**
 * The letters at the front of a postcode district, when the district alone is all we have.
 *
 * Open Names publishes `"MK9"`, not a full unit, so `postcodeAreaOf` cannot be used on it directly —
 * that function deliberately refuses anything that is not a complete postcode. Synthesising a unit
 * is the cheap path; this is the fallback when even that does not parse.
 */
function districtAreaPrefix(district: string): string | null {
  return (
    district
      .trim()
      .toUpperCase()
      .match(/^[A-Z]{1,2}/)?.[0] ?? null
  );
}

/**
 * Write the parsed release for the given areas, retiring rather than deleting anything that
 * disappeared from within them.
 *
 * Exported for `tests/reference-sync-integrity.test.ts`, which drives it with a few records and a
 * stub client rather than a 103 MB archive.
 */
export async function applyPlaceRecords(
  prisma: Db,
  records: PlaceRecord[],
  areas: string[],
): Promise<ApplyOutcome> {
  const existing = new Map<string, { signature: string; isActive: boolean }>();

  // Scoped to the areas being imported: the comparison map stays proportional to the work rather
  // than to the whole table, and retirement below cannot reach another area's rows.
  for (const row of await prisma.placeReference.findMany({
    where: { postcodeArea: { in: areas } },
    select: {
      sourceId: true,
      name: true,
      type: true,
      localType: true,
      eastings: true,
      northings: true,
      postcodeArea: true,
      postcodeDistrict: true,
      populatedPlace: true,
      districtBorough: true,
      countyUnitary: true,
      region: true,
      country: true,
      isActive: true,
    },
  })) {
    existing.set(row.sourceId, { signature: signature(row), isActive: row.isActive });
  }

  const toInsert: PlaceRecord[] = [];
  const toUpdate: PlaceRecord[] = [];
  const seen = new Set<string>();
  const perArea: Record<string, number> = {};

  for (const record of records) {
    seen.add(record.sourceId);
    if (record.postcodeArea) {
      perArea[record.postcodeArea] = (perArea[record.postcodeArea] ?? 0) + 1;
    }

    const previous = existing.get(record.sourceId);
    if (!previous) toInsert.push(record);
    else if (previous.signature !== signature(record) || !previous.isActive) toUpdate.push(record);
  }

  for (let i = 0; i < toInsert.length; i += CHUNK_SIZE) {
    await prisma.placeReference.createMany({
      data: toInsert.slice(i, i + CHUNK_SIZE),
      skipDuplicates: true,
    });
  }

  for (const record of toUpdate) {
    await prisma.placeReference.update({
      where: { sourceId: record.sourceId },
      data: { ...record, isActive: true },
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

  return { inserted: toInsert.length, updated: toUpdate.length, retired, perArea };
}

async function readJson(response: Response): Promise<unknown> {
  if (!response.ok) {
    throw new Error(`OS Open Names: ${response.url} returned HTTP ${response.status}`);
  }
  return response.json();
}
