import type { getReferencePrisma } from "@/lib/reference-db";
import { gridDistanceMetres } from "@/lib/osgb36";

/**
 * Place reference reads (#764) — the ONLY DB access for `PlaceReference`.
 *
 * Enrichment only. Nothing here can make a postcode or an address invalid; a query returning
 * nothing is an ordinary outcome, not an error.
 *
 * Not vendor-scoped, for the same reason as `postcodes.ts`: a road is in the same place whoever is
 * looking. Every export takes `prisma` explicitly and reads no request context.
 *
 * ## Why the query is a bounding box and the distance is computed here
 *
 * The rule is "within 250 metres", which is a circle. Prisma's query API cannot express
 * `sqrt((e1-e2)^2 + (n1-n2)^2) <= 250` as a filter, and raw SQL is not permitted in application
 * code (CLAUDE.md allows exactly one unrelated statement, in `lib/error-event-fallback.ts`). So the
 * database is asked for the enclosing **square** — two indexed range filters it can serve from
 * `PlaceReference_postcodeDistrict_eastings_northings_idx` — and the corners are discarded here.
 *
 * The square is a strict superset of the circle, so nothing inside the radius is missed; its
 * corners reach 354 m, which is why the refinement is not optional. `rankNearbyStreets` below is
 * exported separately so that arithmetic, and the suppression rules built on it, are unit-testable
 * without a database.
 */

type Db = ReturnType<typeof getReferencePrisma>;

/** Open Names' own TYPE value for roads. */
const TRANSPORT_NETWORK = "transportNetwork";

/**
 * Candidate pool radius, in metres.
 *
 * Calibrated at Build against the real OS Open Names release rather than chosen a priori. Across
 * 4,000 real postcodes per city, 250 m captures a median of 10 distinct roads in Milton Keynes, 12
 * in central London and 7 in Birmingham — enough for the nearest few to be genuinely useful, while
 * staying tight enough that a road on the far side of a district never qualifies.
 */
export const SUGGESTION_RADIUS_METRES = 250;

/**
 * If the closest qualifying road is further away than this, no suggestion is offered at all.
 *
 * This is the rule that stops the most misleading output the feature could produce: a single road
 * name, presented confidently, that happens to be the only thing vaguely nearby. A real example
 * from the dataset — MK17 9AE has exactly one road within 250 m, at 213 m — is precisely the case
 * that should yield nothing rather than a guess.
 */
export const SUGGESTION_NEAREST_MAX_METRES = 200;

/**
 * Above this many distinct road names within the radius, the top few are arbitrary and the list is
 * suppressed entirely.
 *
 * Also calibrated against the real dataset. The first draft of this rule used 8, which measurement
 * showed would suppress the hint for 59% of Milton Keynes postcodes and 73% of central London —
 * disabling the feature for most shoppers while appearing to work. At 25 the rule serves roughly
 * 89% of Milton Keynes and central London and 77% of Birmingham, and still fires on genuinely dense
 * areas, so the protection is real rather than nominal.
 */
export const SUGGESTION_DENSITY_CEILING = 25;

/** At most this many names are ever returned. */
export const MAX_STREET_SUGGESTIONS = 3;

export interface PlaceReferenceRow {
  name: string;
  type: string;
  localType: string;
  eastings: number;
  northings: number;
  populatedPlace: string | null;
  districtBorough: string | null;
  countyUnitary: string | null;
  region: string | null;
  country: string | null;
}

/**
 * Every active place record in a postcode district whose coordinates fall inside the bounding
 * square around the given point.
 *
 * `postcodeDistrict` leads the filter because it leads the composite index, and because Open Names
 * publishes a district (`MK9`) rather than a full postcode unit — so district membership plus
 * proximity is the most specific relationship the dataset actually supports.
 */
export async function findPlacesNear(
  prisma: Db,
  postcodeDistrict: string,
  eastings: number,
  northings: number,
  radiusMetres: number = SUGGESTION_RADIUS_METRES,
): Promise<PlaceReferenceRow[]> {
  return prisma.placeReference.findMany({
    where: {
      postcodeDistrict,
      isActive: true,
      eastings: { gte: eastings - radiusMetres, lte: eastings + radiusMetres },
      northings: { gte: northings - radiusMetres, lte: northings + radiusMetres },
    },
    select: {
      name: true,
      type: true,
      localType: true,
      eastings: true,
      northings: true,
      populatedPlace: true,
      districtBorough: true,
      countyUnitary: true,
      region: true,
      country: true,
    },
    // Bounded so a pathologically dense district cannot return an unbounded result set on a
    // public, unauthenticated endpoint. Well above the density ceiling, so it never silently
    // changes which suggestions win.
    take: 500,
  });
}

/**
 * Turn a bounding-box result into the street names a shopper may be offered — or nothing.
 *
 * Pure, so every rule below is testable without a database. Returns an empty array in all three
 * suppression cases, never a partial or arbitrary list:
 *
 *  1. no road qualifies at all;
 *  2. the nearest qualifying road is beyond `SUGGESTION_NEAREST_MAX_METRES`;
 *  3. more than `SUGGESTION_DENSITY_CEILING` distinct names fall inside the radius.
 *
 * These are suggestions about where the postcode is. They are never evidence that a property
 * belongs to a particular street, which is why the caller puts them in `location`, never in
 * `addresses`, and why the address line stays empty and editable.
 */
export function rankNearbyStreets(
  places: PlaceReferenceRow[],
  eastings: number,
  northings: number,
): string[] {
  const withinRadius = places
    .filter((place) => place.type === TRANSPORT_NETWORK && place.name.trim() !== "")
    .map((place) => ({
      name: place.name.trim(),
      distance: gridDistanceMetres(place.eastings, place.northings, eastings, northings),
    }))
    .filter((place) => place.distance <= SUGGESTION_RADIUS_METRES)
    .sort((a, b) => a.distance - b.distance);

  if (withinRadius.length === 0) return [];

  // Deduplicate by name, keeping the closest occurrence of each — Open Names splits a long road
  // into several "Section Of Named Road" records, so the same name legitimately appears more than
  // once within the radius.
  const nearestByName = new Map<string, number>();
  for (const place of withinRadius) {
    if (!nearestByName.has(place.name)) nearestByName.set(place.name, place.distance);
  }

  if (nearestByName.size > SUGGESTION_DENSITY_CEILING) return [];
  if (withinRadius[0].distance > SUGGESTION_NEAREST_MAX_METRES) return [];

  return [...nearestByName.entries()]
    .sort((a, b) => a[1] - b[1])
    .slice(0, MAX_STREET_SUGGESTIONS)
    .map(([name]) => name);
}

/**
 * The best human-readable place names for a location, from the closest record that carries them.
 *
 * Code-Point supplies administrative CODES only (`E06000042`), which no shopper can read, so the
 * town and county a lookup reports come from here. A settlement record is preferred over a road
 * when both are equally close, since a settlement's own name is the more natural "town".
 */
export function resolveLocality(
  places: PlaceReferenceRow[],
  eastings: number,
  northings: number,
): { town: string | null; district: string | null; county: string | null } {
  const ranked = places
    .map((place) => ({
      place,
      distance: gridDistanceMetres(place.eastings, place.northings, eastings, northings),
      isSettlement: place.type !== TRANSPORT_NETWORK,
    }))
    .sort((a, b) => {
      if (a.isSettlement !== b.isSettlement) return a.isSettlement ? -1 : 1;
      return a.distance - b.distance;
    });

  const firstWith = <K extends keyof PlaceReferenceRow>(key: K): string | null => {
    for (const entry of ranked) {
      const value = entry.place[key];
      if (typeof value === "string" && value.trim() !== "") return value.trim();
    }
    return null;
  };

  // A settlement record names itself; a road record names the settlement it runs through.
  const nearestSettlement = ranked.find((entry) => entry.isSettlement);
  const town = nearestSettlement?.place.name.trim() || firstWith("populatedPlace");

  return {
    town: town && town !== "" ? town : null,
    district: firstWith("districtBorough"),
    county: firstWith("countyUnitary"),
  };
}
