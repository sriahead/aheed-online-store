/**
 * A vendor's square brand MARK (#1069) — the five files one upload produces, and their keys.
 *
 * One upload writes five PNGs into one folder, `vendors/{vendorId}/mark-{uuid}/`. The database
 * stores only the `512.png` key (`VendorBranding.markStorageKey`, a real object key per ADR-003);
 * the other four are derived here by fixed name, because they are only ever written together.
 * Every upload gets a fresh `{uuid}`, so keys are immutable and a re-upload never needs a CDN
 * purge.
 *
 * Pure: no request context, no database, no storage client. The server actions in
 * `features/admin/storefront.ts` and the head/manifest/favicon builders in `lib/vendor-icons.ts`
 * both read through these, so the key shape is defined exactly once.
 */

export type MarkFileId = "icon32" | "apple180" | "icon192" | "icon512" | "og";

export interface MarkFile {
  id: MarkFileId;
  /** The file's fixed name inside the mark folder. */
  name: string;
  width: number;
  height: number;
  /**
   * Filled with the vendor's `brandCream` before the mark is drawn. iOS paints a transparent
   * apple-touch-icon black, and a link preview with a transparent background renders on whatever
   * colour the receiving app chooses — so those two are opaque; the rest keep transparency.
   */
  creamBackground: boolean;
}

export const MARK_FILES: readonly MarkFile[] = [
  { id: "icon32", name: "32.png", width: 32, height: 32, creamBackground: false },
  { id: "apple180", name: "180.png", width: 180, height: 180, creamBackground: true },
  { id: "icon192", name: "192.png", width: 192, height: 192, creamBackground: false },
  { id: "icon512", name: "512.png", width: 512, height: 512, creamBackground: false },
  { id: "og", name: "og.png", width: 1200, height: 630, creamBackground: true },
];

/** The edge the mark is drawn at inside `og.png`, centred. */
export const MARK_OG_EDGE_PX = 480;

/** A source whose longer edge is under this would blur as a home-screen icon. */
export const MARK_MIN_SOURCE_EDGE_PX = 512;

export const MARK_CONTENT_TYPE = "image/png";

export type MarkFileKeys = Record<MarkFileId, string>;

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const STORED_KEY = new RegExp(`^vendors/([^/]+)/mark-(${UUID})/512\\.png$`);

/** A fresh folder for one upload: `vendors/{vendorId}/mark-{uuid}`. */
export function buildVendorMarkFolder(vendorId: string): string {
  return `vendors/${vendorId}/mark-${crypto.randomUUID()}`;
}

function folderOf(markStorageKey: string): string | null {
  const match = STORED_KEY.exec(markStorageKey);
  if (!match) return null;
  // A vendor id never contains a dot segment; refuse one rather than compose a traversal.
  if (match[1] === "." || match[1] === "..") return null;
  return `vendors/${match[1]}/mark-${match[2]}`;
}

/** The five keys for a stored `512.png` key, or `null` if it is not exactly that shape. */
export function markFileKeys(markStorageKey: string): MarkFileKeys | null {
  const folder = folderOf(markStorageKey);
  if (!folder) return null;
  return Object.fromEntries(MARK_FILES.map((f) => [f.id, `${folder}/${f.name}`])) as MarkFileKeys;
}

/** True only for a `512.png` mark key inside THIS vendor's own prefix. */
export function isVendorMarkKey(key: string, vendorId: string): boolean {
  const match = STORED_KEY.exec(key);
  return match !== null && match[1] === vendorId;
}

/**
 * Where to draw a `srcWidth`×`srcHeight` source inside a `canvasWidth`×`canvasHeight` file so it is
 * CONTAINED in a centred `edge`×`edge` square: scaled to fit, never cropped, never stretched. A
 * non-square source gets equal padding on the short axis.
 */
export function containInSquare(
  srcWidth: number,
  srcHeight: number,
  canvasWidth: number,
  canvasHeight: number,
  edge: number,
): { x: number; y: number; width: number; height: number } {
  const scale = edge / Math.max(srcWidth, srcHeight);
  const width = srcWidth * scale;
  const height = srcHeight * scale;
  return {
    x: (canvasWidth - width) / 2,
    y: (canvasHeight - height) / 2,
    width,
    height,
  };
}

/** The square the mark is drawn in for a given file: the whole file, or 480px centred in `og.png`. */
export function markEdgeFor(file: MarkFile): number {
  return file.id === "og" ? MARK_OG_EDGE_PX : Math.min(file.width, file.height);
}
