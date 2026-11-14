# Grocery naming standard and category-specific attributes (build notes)

Issue #1573. Built 2026-11-14 in worktree `E:\GitRepositories\aheed-wt-1558`, branch
`feature/1573-grocery-naming`.

## Dry run on AFC staging (2026-11-14, read-only)

`--previous-run` = the #1570 run's plan. 132 lines: 17 name updates, 104 unchanged, 5 review,
4 create, 2 duplicates.

- 11 lines keep till words: Meat Tenderiser **Powder**, Brown Mustard **Seeds**, Black **Onion**
  Seeds, **Cinnamon Sticks** (was "Dalchini"), Keema/Kofta **Curry Mix**, Chicken Tikka **BBQ Mix**,
  Chicken Ginger **Mix**, Paya **Mix**.
- Word order: Black/White Sesame Seeds, Cloves Whole, Jeera Whole (2), Extra Hot Chilli Powder (2),
  Extra Hot Chilli Whole.
- Open lines carry the #1570 decisions (the 6 SKIP questions unchanged). Two old CREATE decisions
  were pointed at the products that run created, because their new names would have slipped past
  the re-run guard and created duplicates. That rule is now in the skill.
- Possible catalogue duplicate: TRS CHILLI POWDERS 100G (3406) and TRS Chilli Powder – 100g (3402).

## Changes from the plan

- Till words only on UPDATE lines: on a REVIEW line the matched product may be another one (the
  first dry run turned the owner's open "Rajah Seasoning" question into "Chicken Seasoning").
- "Crushed" is not a trailing form word ("TRS Crushed Chilli", not "Chilli Crushed").

## Open

- Apply to AFC staging after the owner reviews the dry run (R10).
