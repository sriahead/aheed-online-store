---
description: "Correct a failed validation at the root cause, then re-run /validate from the top"
---

Fix what validation found.

Follow the **Fix** stage of `specs/sdd-workflow.md` (read it if not already in context).

1. Fix the **root cause, not the check**. If a requirement can't be proven because the code isn't
   shaped to allow it, reshape the code — that is what produced `placeOrder(prisma, vendorId, input)`
   and `getWebhookOrderService()`, both found at exactly this stage. Loosening a `validation.md` row
   so it passes is only correct when the row itself was wrong; say which one you're doing.
2. **Know when a fix is really a redesign.** If it needs a new decision rather than a correction,
   stop and say so — that's a Spec-level change, and improvising it here (on the validation model,
   in a validation mindset) is how scope quietly escapes review.
3. Update `specs/<date-feature>/build-notes.md` with what changed and why, and the `CHANGELOG.md`
   entry if the fix changed observable behaviour.
4. Re-run `/validate` **from the top** — not just the row that failed. A fix can break a row that
   previously passed.
