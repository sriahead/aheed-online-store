/**
 * Minimal CSV reading for the OS reference archives (#764). Pure, Node-safe, no dependency.
 *
 * Both datasets are plain comma-separated text, but they differ in ways a naive `split(",")` gets
 * wrong, and both shapes were confirmed against the real archives at Build rather than assumed:
 *
 * - **Code-Point Open** quotes its string fields and leaves numerics bare:
 *   `"MK1 1AS",10,488085,234837,"E92000001",...`
 * - **OS Open Names** leaves most fields unquoted:
 *   `osgb4000000074541653,http://...,Westing,,,,populatedPlace,Other Settlement,457077,...`
 *   but a place or road name containing a comma is quoted, which is exactly the row a
 *   `split(",")` would silently shift every subsequent column on.
 *
 * Neither file has a header row. Both ship their column names in a separate document inside the
 * archive (`Doc/Code-Point_Open_Column_Headers.csv`, `Doc/OS_Open_Names_Header.csv`), which is what
 * `columnIndex` below is for: the sources map names to positions from the publisher's own header
 * file instead of hardcoding ordinals. That way a column inserted upstream is caught as a missing
 * required column rather than silently read as the wrong field.
 */

/**
 * Split one CSV line into fields, honouring double-quoted values and `""` as an escaped quote.
 *
 * Deliberately not a streaming parser: these files have no embedded newlines inside quoted fields
 * (verified against both real archives), so line-at-a-time splitting is correct here and keeps the
 * memory profile flat over a 1.7M-row import.
 */
export function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      fields.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  fields.push(current);
  return fields;
}

/**
 * Iterate the non-empty lines of a CSV document, tolerating both line endings.
 *
 * A trailing newline is normal in these archives and must not yield a phantom empty record.
 */
export function* csvLines(text: string): Generator<string> {
  for (const raw of text.split("\n")) {
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    if (line.length > 0) yield line;
  }
}

/**
 * Build a name-to-position map from a publisher's header line.
 *
 * Names are upper-cased and trimmed so a change in the publisher's casing does not break the
 * mapping — the position is what matters, and the name is only how we find it.
 */
export function columnIndex(headerLine: string): Map<string, number> {
  const index = new Map<string, number>();
  parseCsvLine(headerLine).forEach((name, position) => {
    index.set(name.trim().toUpperCase(), position);
  });
  return index;
}

/**
 * Resolve the positions of the columns a source actually needs, failing loudly if any is absent.
 *
 * This is the schema check the sync performs before it will touch a row: a release that has
 * dropped or renamed a required column must abort the import, not import nulls into it.
 */
export function requireColumns(
  index: Map<string, number>,
  required: readonly string[],
): Record<string, number> {
  const resolved: Record<string, number> = {};
  const missing: string[] = [];

  for (const name of required) {
    const position = index.get(name.toUpperCase());
    if (position === undefined) missing.push(name);
    else resolved[name] = position;
  }

  if (missing.length > 0) {
    throw new Error(`reference data: required column(s) missing from source header: ${missing.join(", ")}`); // prettier-ignore
  }

  return resolved;
}
