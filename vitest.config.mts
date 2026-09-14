import { configDefaults, defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    // .claude/worktrees/<agent-id>/ is a full separate checkout a forked sub-agent
    // builds in, own node_modules included — vitest's own defaults don't exclude it,
    // so a run here picks up and executes that worktree's test files too, against
    // ITS node_modules, crashing on version mismatches (#357).
    exclude: [...configDefaults.exclude, "**/.claude/**"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
      // `lib/db.ts` imports `@prisma/client/wasm` (mandatory on Workers — CLAUDE.md),
      // whose WASM query compiler Node cannot load. `features/checkout/slots.ts`
      // reaches `lib/db.ts` as a value import (via `lib/fulfilment-slots-service.ts`),
      // so any full-suite run that imports that chain needs this redirected to the
      // plain Node client — the same one `prisma/seed.ts` uses directly.
      "@prisma/client/wasm": "@prisma/client",
    },
  },
});
