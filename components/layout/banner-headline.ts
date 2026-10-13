/**
 * The header banner's first line (#1078).
 *
 * A vendor that has written a headline at /staff/storefront gets exactly that, as plain text.
 * Otherwise the line is derived from the vendor's own name and locality, which is what every vendor
 * saw before #1078 and must still see, character for character. That is why a blank headline falls
 * back here rather than hiding the line the way a blank `bannerNote` does: this line is the vendor's
 * own data, not copy the platform writes on its behalf (#239).
 */
export function bannerHeadlineText({
  bannerHeadline,
  name,
  localityName,
  offerCollection,
}: {
  bannerHeadline: string | null;
  name: string;
  localityName: string;
  offerCollection: boolean;
}): string {
  if (bannerHeadline !== null) return bannerHeadline;
  return offerCollection
    ? `${name} — local delivery across ${localityName} & click and collect`
    : `${name} — local delivery across ${localityName}`;
}
