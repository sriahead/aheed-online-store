/**
 * British National Grid (OSGB36, EPSG:27700) to WGS84 latitude/longitude (#764).
 *
 * Pure, dependency-free, and deliberately the ONLY place in the application that
 * knows this transformation exists.
 *
 * ## Why coordinates are stored as eastings/northings and converted here
 *
 * Both reference datasets supply British National Grid coordinates: Code-Point
 * Open gives each postcode unit an easting/northing, and OS Open Names gives each
 * road and place a `GEOMETRY_X`/`GEOMETRY_Y` in the same grid. Because the grid is
 * planar and metric, the distance between a postcode and a road is plain
 * Euclidean arithmetic in metres — no reprojection, no haversine, no accumulated
 * error. That is what makes `lib/repositories/places.ts`'s proximity query a
 * bounding box plus a subtraction rather than something needing PostGIS.
 *
 * Latitude and longitude are therefore needed only for values LEAVING the system
 * through `GET /api/address/lookup`, where a caller (and eventually a map) expects
 * degrees. Converting at read time costs one call per response instead of 1.7M
 * calls at import, and keeps the stored value byte-identical to what OS published.
 *
 * ## The maths
 *
 * Two steps, both from Ordnance Survey's "A guide to coordinate systems in Great
 * Britain" (annexes C.1 and C.2):
 *
 *   1. Reverse transverse Mercator projection, giving latitude/longitude on the
 *      **Airy 1830** ellipsoid that OSGB36 is defined against. Iterative, because
 *      the meridional arc cannot be inverted in closed form.
 *   2. A seven-parameter **Helmert transformation** from OSGB36 to WGS84, applied
 *      in geocentric cartesian space.
 *
 * Accuracy is roughly 5 metres, which is the inherent limit of a Helmert
 * transformation — OS's own OSTN15 grid would give centimetres, but it is a 20 MB
 * shift table and this value exists to place a pin on a map, not to survey a
 * boundary. `tests/osgb36.test.ts` asserts agreement within 10 metres against five
 * published reference points spread from Edinburgh to Cardiff.
 */

/** Ellipsoid OSGB36 is defined against. */
const AIRY_1830 = { a: 6377563.396, b: 6356256.909 } as const;

/** Ellipsoid WGS84 is defined against. */
const WGS84 = { a: 6378137.0, b: 6356752.3141 } as const;

/** National Grid projection constants: scale factor and true origin. */
const SCALE_FACTOR = 0.9996012717;
const TRUE_ORIGIN_LAT = degreesToRadians(49);
const TRUE_ORIGIN_LON = degreesToRadians(-2);
const TRUE_ORIGIN_EASTING = 400000;
const TRUE_ORIGIN_NORTHING = -100000;

/**
 * Seven-parameter Helmert transformation, OSGB36 to WGS84.
 * Translations in metres, rotations in seconds of arc, scale in parts per million.
 */
const HELMERT = {
  tx: 446.448,
  ty: -125.157,
  tz: 542.06,
  rx: 0.1502,
  ry: 0.247,
  rz: 0.8421,
  s: -20.4894,
} as const;

function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function radiansToDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

function secondsToRadians(seconds: number): number {
  return (seconds / 3600) * (Math.PI / 180);
}

export interface LatLon {
  latitude: number;
  longitude: number;
}

/**
 * Convert a British National Grid coordinate to WGS84 degrees.
 *
 * Returns latitude and longitude rounded to six decimal places — roughly 0.1 m of
 * resolution, comfortably finer than the transformation's own ~5 m accuracy, and
 * enough to stop a float's full tail leaking into an API response as false
 * precision.
 */
export function eastingsNorthingsToWgs84(eastings: number, northings: number): LatLon {
  const { a, b } = AIRY_1830;
  const eccentricitySquared = (a * a - b * b) / (a * a);
  const n = (a - b) / (a + b);

  // Step 1: reverse transverse Mercator onto the Airy 1830 ellipsoid.
  //
  // The northing fixes the latitude only implicitly, through the meridional arc
  // M, so latitude is found by iteration: guess, compute the arc that guess
  // implies, correct by the residual, repeat. It converges in a handful of passes
  // over Great Britain; the 0.01 mm threshold is far below the accuracy this
  // function can claim and simply guarantees the loop has stopped moving.
  let latitude = TRUE_ORIGIN_LAT;
  let meridionalArc = 0;

  do {
    latitude = (northings - TRUE_ORIGIN_NORTHING - meridionalArc) / (a * SCALE_FACTOR) + latitude;

    const latDifference = latitude - TRUE_ORIGIN_LAT;
    const latSum = latitude + TRUE_ORIGIN_LAT;

    const termA = (1 + n + 1.25 * n * n + 1.25 * n * n * n) * latDifference;
    const termB = (3 * n + 3 * n * n + 2.625 * n * n * n) * Math.sin(latDifference) * Math.cos(latSum); // prettier-ignore
    const termC = (1.875 * n * n + 1.875 * n * n * n) * Math.sin(2 * latDifference) * Math.cos(2 * latSum); // prettier-ignore
    const termD = (35 / 24) * n * n * n * Math.sin(3 * latDifference) * Math.cos(3 * latSum);

    meridionalArc = b * SCALE_FACTOR * (termA - termB + termC - termD);
  } while (Math.abs(northings - TRUE_ORIGIN_NORTHING - meridionalArc) >= 0.00001);

  const sinLat = Math.sin(latitude);
  const cosLat = Math.cos(latitude);
  const tanLat = Math.tan(latitude);

  const oneMinusE2SinSq = 1 - eccentricitySquared * sinLat * sinLat;
  // Radius of curvature in the prime vertical, and in the meridian.
  const nu = (a * SCALE_FACTOR) / Math.sqrt(oneMinusE2SinSq);
  const rho = (a * SCALE_FACTOR * (1 - eccentricitySquared)) / Math.pow(oneMinusE2SinSq, 1.5);
  const eta2 = nu / rho - 1;

  const tan2 = tanLat * tanLat;
  const tan4 = tan2 * tan2;
  const tan6 = tan4 * tan2;
  const secLat = 1 / cosLat;

  const nu3 = nu * nu * nu;
  const nu5 = nu3 * nu * nu;
  const nu7 = nu5 * nu * nu;

  const vii = tanLat / (2 * rho * nu);
  const viii = (tanLat / (24 * rho * nu3)) * (5 + 3 * tan2 + eta2 - 9 * tan2 * eta2);
  const ix = (tanLat / (720 * rho * nu5)) * (61 + 90 * tan2 + 45 * tan4);
  const x = secLat / nu;
  const xi = (secLat / (6 * nu3)) * (nu / rho + 2 * tan2);
  const xii = (secLat / (120 * nu5)) * (5 + 28 * tan2 + 24 * tan4);
  const xiia = (secLat / (5040 * nu7)) * (61 + 662 * tan2 + 1320 * tan4 + 720 * tan6);

  const dE = eastings - TRUE_ORIGIN_EASTING;
  const dE2 = dE * dE;
  const dE3 = dE2 * dE;
  const dE4 = dE3 * dE;
  const dE5 = dE4 * dE;
  const dE6 = dE5 * dE;
  const dE7 = dE6 * dE;

  const airyLat = latitude - vii * dE2 + viii * dE4 - ix * dE6;
  const airyLon = TRUE_ORIGIN_LON + x * dE - xi * dE3 + xii * dE5 - xiia * dE7;

  // Step 2: Helmert OSGB36 -> WGS84, performed in geocentric cartesian space.
  const wgs = helmertAiryToWgs84(airyLat, airyLon);

  return {
    latitude: round6(radiansToDegrees(wgs.latitude)),
    longitude: round6(radiansToDegrees(wgs.longitude)),
  };
}

/**
 * Apply the seven-parameter Helmert shift, converting geodetic coordinates on
 * Airy 1830 to geodetic coordinates on WGS84 by way of cartesian XYZ.
 *
 * Height is taken as zero throughout. The datasets carry no height, and an
 * assumed zero contributes well under a metre of horizontal error at these
 * latitudes — immaterial against the transformation's own ~5 m.
 */
function helmertAiryToWgs84(
  latitude: number,
  longitude: number,
): { latitude: number; longitude: number } {
  const from = AIRY_1830;
  const to = WGS84;

  const sinLat = Math.sin(latitude);
  const cosLat = Math.cos(latitude);
  const sinLon = Math.sin(longitude);
  const cosLon = Math.cos(longitude);

  const fromE2 = (from.a * from.a - from.b * from.b) / (from.a * from.a);
  const nu = from.a / Math.sqrt(1 - fromE2 * sinLat * sinLat);

  const x1 = nu * cosLat * cosLon;
  const y1 = nu * cosLat * sinLon;
  const z1 = (1 - fromE2) * nu * sinLat;

  const rx = secondsToRadians(HELMERT.rx);
  const ry = secondsToRadians(HELMERT.ry);
  const rz = secondsToRadians(HELMERT.rz);
  const scale = HELMERT.s / 1_000_000 + 1;

  const x2 = HELMERT.tx + x1 * scale - y1 * rz + z1 * ry;
  const y2 = HELMERT.ty + x1 * rz + y1 * scale - z1 * rx;
  const z2 = HELMERT.tz - x1 * ry + y1 * rx + z1 * scale;

  // Cartesian back to geodetic on the target ellipsoid. Latitude is again
  // iterative, for the same reason as above.
  const toE2 = (to.a * to.a - to.b * to.b) / (to.a * to.a);
  const p = Math.sqrt(x2 * x2 + y2 * y2);

  let newLatitude = Math.atan2(z2, p * (1 - toE2));
  let previous = 0;
  let guard = 0;

  while (Math.abs(newLatitude - previous) > 1e-12 && guard < 100) {
    previous = newLatitude;
    const sinNew = Math.sin(newLatitude);
    const nuTo = to.a / Math.sqrt(1 - toE2 * sinNew * sinNew);
    newLatitude = Math.atan2(z2 + toE2 * nuTo * sinNew, p);
    guard += 1;
  }

  return { latitude: newLatitude, longitude: Math.atan2(y2, x2) };
}

function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

/**
 * Straight-line distance in metres between two British National Grid points.
 *
 * Exported separately from the repository query on purpose: the query narrows to a
 * bounding box (which is all Prisma can express, and raw SQL is not permitted in
 * application code), and this refines that square to a true circle. Keeping it
 * here means the ranking rule is unit-testable without a database.
 */
export function gridDistanceMetres(
  aEastings: number,
  aNorthings: number,
  bEastings: number,
  bNorthings: number,
): number {
  const dx = aEastings - bEastings;
  const dy = aNorthings - bNorthings;
  return Math.sqrt(dx * dx + dy * dy);
}
