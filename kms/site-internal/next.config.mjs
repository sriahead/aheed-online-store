import nextra from "nextra";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const withNextra = nextra({});
const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
export default withNextra({
  reactStrictMode: true,
  // Independent nested project (own package.json/lockfile, not an npm workspace) —
  // without this, Turbopack finds the root repo's lockfile too and infers the
  // wrong workspace root, which can misresolve node_modules across the boundary.
  turbopack: { root: __dirname },
});
