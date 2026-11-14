# Grocery naming standard and category-specific attributes (requirements)

Issue #1573, follow-up to #1570. Owner request and approval 2026-11-14.

## Requirements

- **R1** — Clean names are Title Case with the brand written as the store writes it, and sizes
  written g, kg, ml, L.
- **R2** — Word order follows a per-category rule (spices: heat/colour first, form last; rice: grain
  length first, "Rice" last; fish: Fresh/Frozen last). Words are moved, never added or removed.
- **R3** — A confident match keeps the till's extra descriptive words when the list's name is a
  subset of them (synonyms folded); till clutter (`noiseWords`) and numbers never count. Not applied
  to uncertain (REVIEW) lines, nor when a reviewer chooses another product.
- **R4** — Till names an earlier run replaced can be supplied (`--previous-run`), so a re-run can
  still keep them.
- **R5** — Shared rule sets (presets) for general, spices, rice and fish, merged under a store's
  profile; the profile's own values win. Any store can use them.
- **R6** — Filters are derived per category: Spices → Form; Rice → Variety, Grain; Fish → Species,
  Storage, Cut, Grade; snacks/sauces/pickles/drinks/biscuits/noodles → Flavour. Existing filters and
  options are reused. Dietary labels are never derived from names.
- **R7** — The plan report lists possible duplicates already in the catalogue (same brand, words and
  size) and every line whose name kept till words. Nothing is merged.
- **R8** — Apply refuses if a preset or the previous-run file changed since the plan.
- **R9** — PLUs, barcodes, prices, stock, VAT and staff-edited names are kept as before (#1570 R10).
- **R10** — Re-run the AFC staging spices and Shan lists with the standard: dry run, owner review,
  then apply to staging, everything new hidden. Production only on explicit approval.

## Out of scope

- A supplier field (none exists); a Vegan product flag (a Vegan filter can come from a column).
- Inventing a missing product type ("Shan Korma" stays as the list wrote it; the owner may edit it).
