/**
 * Keeps a promotion's SAVED target in its edit-page picker even when the picker's filter (active
 * bundles, active discount codes) would drop it. Without this the controlled <select> has no
 * option for the saved id, shows its placeholder ("-- Choose an active bundle --"), and a save
 * from that state loses the link (2026-11-12, BBQ Chicken Pack, whose bundle was switched off).
 */
export function keepCurrentOption<T extends { id: string }>(
  options: readonly T[],
  all: readonly T[],
  currentId: string | null | undefined,
  mark: (option: T) => T,
): T[] {
  if (!currentId || options.some((o) => o.id === currentId)) return [...options];
  const current = all.find((o) => o.id === currentId);
  return current ? [mark(current), ...options] : [...options];
}
