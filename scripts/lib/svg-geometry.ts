/**
 * Geometry extraction for the icon tests and the markup-equivalence script (#1223). Not a general SVG library: it reads only what the
 * parity and equivalence checks need.
 *
 * WHY PATH DATA IS NORMALISED, NOT COMPARED AS TEXT. Iconify stores icons after an SVG optimiser pass, and
 * `lucide-react` renders the original source, so the same shape is spelled differently:
 *
 *   lucide-react   `m21 21-4.34-4.34`      Iconify   `m21 21l-4.34-4.34`
 *
 * A literal comparison would flag nearly every icon, and a check that always fails is a check nobody
 * reads. So a path is parsed and re-expressed with absolute coordinates and every line command as `L`;
 * two spellings of one shape then compare equal, and a genuine artwork change still does not.
 */

const SHAPE_TAGS = new Set(["path", "circle", "rect", "line", "polyline", "polygon", "ellipse"]);
const GEOMETRY_ATTRIBUTES = [
  "d",
  "cx",
  "cy",
  "r",
  "x",
  "y",
  "x1",
  "y1",
  "x2",
  "y2",
  "width",
  "height",
  "rx",
  "ry",
  "points",
];

const PARAMS: Record<string, number> = {
  m: 2,
  l: 2,
  h: 1,
  v: 1,
  c: 6,
  s: 4,
  q: 4,
  t: 2,
  a: 7,
  z: 0,
};

const round = (n: number) => Math.round(n * 1000) / 1000;

/** Tokenise path data, reading an arc's two flag arguments as single characters (they may be unspaced). */
function tokenise(d: string): Array<string | number> {
  const tokens: Array<string | number> = [];
  const re = /([a-zA-Z])|([-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?)/g;
  let arcArg = -1; // -1 when the current command is not an arc
  let m: RegExpExecArray | null;
  while ((m = re.exec(d)) !== null) {
    if (m[1]) {
      tokens.push(m[1]);
      arcArg = m[1].toLowerCase() === "a" ? 0 : -1;
      continue;
    }
    if (arcArg === 3 || arcArg === 4) {
      // A flag is exactly one 0 or 1; split a run such as `01.5` into 0, 1, .5.
      const text = m[2];
      tokens.push(Number(text[0]));
      if (text.length > 1) re.lastIndex -= text.length - 1;
      arcArg += 1;
      continue;
    }
    tokens.push(Number(m[2]));
    if (arcArg >= 0) arcArg = arcArg === 6 ? 0 : arcArg + 1;
  }
  return tokens;
}

/** Absolute-coordinate form of a path, as a flat list of command letters and rounded numbers. */
export function normalisePath(d: string): Array<string | number> {
  const tokens = tokenise(d);
  const out: Array<string | number> = [];
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  let command = "";
  let i = 0;
  while (i < tokens.length) {
    if (typeof tokens[i] === "string") {
      command = tokens[i] as string;
      i += 1;
      if (command === "z" || command === "Z") {
        out.push("Z");
        cx = sx;
        cy = sy;
        continue;
      }
    }
    const lower = command.toLowerCase();
    const count = PARAMS[lower];
    const args = tokens.slice(i, i + count) as number[];
    if (args.length < count) break;
    i += count;
    const rel = command === lower;
    const ox = rel ? cx : 0;
    const oy = rel ? cy : 0;
    switch (lower) {
      case "m": {
        cx = args[0] + ox;
        cy = args[1] + oy;
        sx = cx;
        sy = cy;
        out.push("M", round(cx), round(cy));
        command = rel ? "l" : "L"; // further pairs after a moveto are implicit linetos
        break;
      }
      case "l":
        cx = args[0] + ox;
        cy = args[1] + oy;
        out.push("L", round(cx), round(cy));
        break;
      case "h":
        cx = args[0] + ox;
        out.push("L", round(cx), round(cy));
        break;
      case "v":
        cy = args[0] + oy;
        out.push("L", round(cx), round(cy));
        break;
      case "c":
        out.push(
          "C",
          round(args[0] + ox),
          round(args[1] + oy),
          round(args[2] + ox),
          round(args[3] + oy),
          round(args[4] + ox),
          round(args[5] + oy),
        );
        cx = args[4] + ox;
        cy = args[5] + oy;
        break;
      case "s":
        out.push(
          "S",
          round(args[0] + ox),
          round(args[1] + oy),
          round(args[2] + ox),
          round(args[3] + oy),
        );
        cx = args[2] + ox;
        cy = args[3] + oy;
        break;
      case "q":
        out.push(
          "Q",
          round(args[0] + ox),
          round(args[1] + oy),
          round(args[2] + ox),
          round(args[3] + oy),
        );
        cx = args[2] + ox;
        cy = args[3] + oy;
        break;
      case "t":
        out.push("T", round(args[0] + ox), round(args[1] + oy));
        cx = args[0] + ox;
        cy = args[1] + oy;
        break;
      case "a":
        out.push(
          "A",
          round(args[0]),
          round(args[1]),
          round(args[2]),
          args[3],
          args[4],
          round(args[5] + ox),
          round(args[6] + oy),
        );
        cx = args[5] + ox;
        cy = args[6] + oy;
        break;
      default:
        i = tokens.length;
    }
  }
  return out;
}

/**
 * Canonical form of one subpath: a subpath that ends exactly where it started is closed with `Z`, and an
 * explicit final `L` back to the start before a `Z` is dropped. Optimisers spell "closed" three ways
 * (`... L start Z`, `... Z`, or just ending at the start point) and all draw the same stroke.
 */
function canonicalSubpath(tokens: Array<string | number>): string {
  const t = [...tokens];
  const sx = t[1] as number;
  const sy = t[2] as number;
  const closed = t[t.length - 1] === "Z";
  if (closed) t.pop();
  const ey = t[t.length - 1] as number;
  const ex = t[t.length - 2] as number;
  const endsAtStart = t.length > 3 && ex === sx && ey === sy;
  if (endsAtStart && t[t.length - 3] === "L") t.splice(t.length - 3, 3);
  if (closed || endsAtStart) t.push("Z");
  return t.join(" ");
}

/** Split a normalised path into its subpaths (each starts at an `M`). */
function subpaths(normalised: Array<string | number>): string[] {
  const out: string[] = [];
  let current: Array<string | number> = [];
  for (const token of normalised) {
    if (token === "M" && current.length > 0) {
      out.push(canonicalSubpath(current));
      current = [];
    }
    current.push(token);
  }
  if (current.length > 0) out.push(canonicalSubpath(current));
  return out;
}

const pointsOf = (value: string): number[] =>
  value
    .trim()
    .split(/[\s,]+/)
    .map(Number);

/** `line`, `polyline` and `polygon` as subpaths, because Iconify stores all three as paths. */
function shapeAsSubpath(tag: string, attributes: Map<string, string>): string | null {
  const n = (name: string) => Number(attributes.get(name) ?? 0);
  if (tag === "line")
    return canonicalSubpath([
      "M",
      round(n("x1")),
      round(n("y1")),
      "L",
      round(n("x2")),
      round(n("y2")),
    ]);
  if (tag === "polyline" || tag === "polygon") {
    const p = pointsOf(attributes.get("points") ?? "");
    const tokens: Array<string | number> = ["M", round(p[0]), round(p[1])];
    for (let i = 2; i + 1 < p.length; i += 2) tokens.push("L", round(p[i]), round(p[i + 1]));
    if (tag === "polygon") tokens.push("Z");
    return canonicalSubpath(tokens);
  }
  return null;
}

/**
 * The geometry of a markup string, comparable across spellings of the same artwork.
 *
 * - `circle`, `rect` and `ellipse` are listed in document order as `tag|attr=value|...`.
 * - Every `path`, `line`, `polyline` and `polygon` becomes subpaths, and the subpaths of ALL of them are
 *   listed once, sorted. Iconify's optimiser merges an icon's separate shapes into one path with several
 *   subpaths (and turns lines into paths); `lucide-react` keeps them apart. For a stroke-only icon the draw
 *   order of subpaths does not change the picture, so the multiset of subpaths is what must match.
 */
export function geometryOf(markup: string): string[] {
  const shapes: string[] = [];
  const paths: string[] = [];
  for (const match of markup.matchAll(/<([A-Za-z][\w-]*)((?:\s+[\w:-]+="[^"]*")*)\s*\/?>/g)) {
    const tag = match[1];
    if (!SHAPE_TAGS.has(tag)) continue;
    const attributes = new Map<string, string>();
    for (const a of match[2].matchAll(/([\w:-]+)="([^"]*)"/g)) attributes.set(a[1], a[2]);
    if (tag === "path") {
      paths.push(...subpaths(normalisePath(attributes.get("d") ?? "")));
      continue;
    }
    const asPath = shapeAsSubpath(tag, attributes);
    if (asPath) {
      paths.push(asPath);
      continue;
    }
    const parts: string[] = [tag];
    for (const name of GEOMETRY_ATTRIBUTES) {
      const value = attributes.get(name);
      if (value === undefined) continue;
      parts.push(`${name}=${Number.isNaN(Number(value)) ? value : round(Number(value))}`);
    }
    shapes.push(parts.join("|"));
  }
  return [...shapes, ...paths.sort().map((p) => `path|${p}`)];
}

/**
 * Whether two `geometryOf` results describe the same artwork to within `tolerance` user units.
 * Iconify rounds some coordinates (`10.747` is stored as `10.8`), a difference of about 0.05 on a 24 unit
 * grid, i.e. 0.05 px at the default size and invisible. The tolerance is 0.06; anything larger is a real
 * redrawing and must be listed as an exception with a reason.
 */
export function sameGeometry(a: string[], b: string[], tolerance = 0.06): boolean {
  if (a.length !== b.length) return false;
  return a.every((shape, index) => {
    const left = shape.split(/[\s|]+/);
    const right = b[index].split(/[\s|]+/);
    if (left.length !== right.length) return false;
    return left.every((token, i) => {
      const x = Number(token);
      const y = Number(right[i]);
      return Number.isNaN(x) || Number.isNaN(y) ? token === right[i] : Math.abs(x - y) <= tolerance;
    });
  });
}
