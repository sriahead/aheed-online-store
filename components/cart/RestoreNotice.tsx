import type { RestoreEntry, RestoreNotice as Notice } from "@/lib/restore-notice";

/**
 * #957 — what a reorder or a cancelled order's restore could not put back in full, shown once on
 * `/cart` from the redirect's query string (`lib/restore-notice.ts`). Styled like the bundle notice
 * beside it on the same page. Copy is vendor-neutral: the names come from the order.
 *
 * #1088 — also the "shop your list" source, whose names come from the shopper's own typed lines.
 */

function entryText(entry: RestoreEntry): string {
  switch (entry.kind) {
    case "u":
      return `${entry.name}: not available right now`;
    case "p":
      return `${entry.name}: only ${entry.added} of ${entry.requested} added, limited stock`;
    case "h":
      return `${entry.name}: none added, your cart already holds all we have in stock`;
    case "s":
      return `${entry.name}: not added, no product chosen`;
  }
}

export function restoreHeading(notice: Notice): string {
  const k = notice.entries.length;
  const noun = notice.of === 1 ? "item" : "items";
  switch (notice.source) {
    case "reorder":
      return `${k} of ${notice.of} ${noun} from your past order couldn't be added in full:`;
    case "cancelled":
      return `${k} of ${notice.of} ${noun} from your cancelled order couldn't be put back in full:`;
    case "list":
      // "in full" rather than "weren't added": a list notice can carry a `p` entry too, because
      // #1088 reports the per-line outcome `addItems` returns alongside the skipped lines.
      return `${k} of ${notice.of} ${noun} from your list couldn't be added in full:`;
  }
}

export function RestoreNotice({ notice }: { notice: Notice }) {
  return (
    <div
      role="status"
      data-restore-notice
      className="mb-4 rounded-2xl border border-accent/30 bg-accent-tint px-4 py-3 text-sm text-primary"
    >
      <p className="font-bold">{restoreHeading(notice)}</p>
      <ul className="mt-1 list-disc ps-5">
        {notice.entries.map((entry, index) => (
          <li key={`${index}-${entry.name}`}>{entryText(entry)}</li>
        ))}
      </ul>
      {notice.entries.length < notice.of && (
        <p className="mt-1 text-primary-muted">Everything else is in your cart.</p>
      )}
    </div>
  );
}
