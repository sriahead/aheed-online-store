// `ws` ships no bundled type declarations resolvable through its package.json
// `exports` map on this TS/Node setup, and `@types/ws` isn't installed. Only
// used here to register `neonConfig.webSocketConstructor` (tests/setup.ts) —
// the default export is passed straight through as an opaque constructor, so
// no real typing is needed beyond silencing TS7016.
declare module "ws";
