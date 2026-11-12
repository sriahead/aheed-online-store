# Bundle and promotion images (validation)

| Req | How to verify |
| --- | --- |
| R1 | `prisma validate` passes. The migration SQL is read: one `ADD VALUE` and two `ADD COLUMN ... DEFAULT false`. The staging deploy applies it. |
| R2 | `tests/bundle-promotion-images.test.ts` ("generate a bundle photo", "prompts"). After deploy, an admin on staging generates a photo for one bundle and sees it with "needs review". |
| R3 | Same test ("fill missing bundle photos"). On staging the button reports how many were generated, and the list's "No photo" labels go. |
| R4 | On staging: Approve removes the banner, Remove leaves a plain card, and an upload shows no flag. |
| R5 | On staging, the list shows the labels. |
| R6 | Same test ("generate a promotion banner only"). On staging the headline is unchanged after generating. |
| R7 | Same test ("promotion form review flag"). On staging the flag survives a save and Approve then Save clears it. |
| R8 | `docs/staff-playbook/staff-tabs-guide.md` 2.20.0. |

Lint, typecheck and the full vitest suite (`--maxWorkers=4`) pass.
