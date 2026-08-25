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
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
});
