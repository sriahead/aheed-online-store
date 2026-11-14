# Grocery naming standard and category-specific attributes (validation)

| Req | How to verify |
| --- | --- |
| R1, R2 | `tests/stock-import-naming.test.ts`: word order per category, a spice list named in order, sizes normalised. |
| R3, R4 | `tests/stock-import-naming.test.ts`: Black Onion Seeds, Cinnamon Sticks, Keema Curry Mix; no change when the list has a word the till lacks; switch off; earlier-run names; staff-edited name kept. |
| R5, R6 | `tests/stock-import-naming.test.ts`: presets validate and merge; filters only in their categories; no dietary rule in any preset. |
| R7 | `tests/stock-import-naming.test.ts`: duplicates listed by brand, words and size. |
| R8 | Apply after editing a preset is refused (run once). |
| R9 | `tests/stock-import.test.ts` (#1570 merge tests) still pass. |
| R10 | Dry run report on AFC staging; after owner approval, apply, then a second apply showing 0 changes. |
