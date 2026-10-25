import { csvLines, parseCsvLine } from "@/lib/reference-data/csv";

/**
 * Pure, dependency-free CSV grid parser for catalogue uploads.
 * Parses raw CSV string into a 2D string grid (string[][]).
 */
export function parseCsvToGrid(text: string): string[][] {
  const cleanText = text.replace(/^\uFEFF/, "");
  const grid: string[][] = [];
  for (const line of csvLines(cleanText)) {
    grid.push(parseCsvLine(line));
  }
  return grid;
}
