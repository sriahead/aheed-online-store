---
description: Implement to the approved spec — reuse existing patterns, no scope creep
---

Implement the approved spec for: $ARGUMENTS

Follow the **Build** stage of `specs/sdd-workflow.md` (read it if not already in context):

1. Confirm an approved `specs/<date-feature>/requirements.md` exists for this work before writing
   any source. If it doesn't, stop and go back to `/spec`. Move the issue to **In Progress** on the
   delivery board.
2. Reuse before create — check for an existing port/adapter/utility/component before writing a new
   one.
3. Match existing conventions: semantic design tokens (not raw hex/px) in UI code; Clean
   Architecture layering (components never import Prisma or the storage client directly); this
   repo's existing file/module shape for the area you're touching.
4. Build exactly what `requirements.md` describes — nothing more. If you notice a gap or
   improvement outside its scope, note it rather than silently adding it; it becomes a `/propose`
   candidate for later, not a scope-creep addition now.
5. **Design for testability against the acceptance criteria.** If a requirement asserts a runtime
   property (a transaction is atomic, a handler is idempotent), the code must expose a way to prove
   it from a plain script — pass `prisma`/`vendorId` as explicit arguments rather than resolving
   them from request context inside the function. `placeOrder(prisma, vendorId, input)` has exactly
   that shape because the earlier version couldn't be exercised outside a request.
6. When done, move to `/build-notes` — **not** `/validate`. Validation runs from a fresh context
   after a Clear, so everything load-bearing has to reach disk first. Do not self-certify the build
   from a read-through, and do not validate it in the context that wrote it.
