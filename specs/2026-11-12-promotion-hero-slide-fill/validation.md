# Landing promotion slides fill the carousel when stacked (validation)

| Req | How to verify |
| --- | --- |
| R1 | `tests/promotion-hero-slide-fill.test.ts` passes. In a browser under 1024px wide, every slide's photo reaches the carousel's bottom edge. |
| R2 | Same test (`flex-1` on the copy column). The "Shop Deal" button sits at the bottom of each slide. |
