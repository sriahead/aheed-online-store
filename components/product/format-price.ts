/** Pure, unit-tested. Formats integer pence as a GBP display string: 450 -> "£4.50". */
export function formatPrice(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}
