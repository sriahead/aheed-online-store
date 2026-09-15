/**
 * Vitest global setup — must run before any test file imports the Neon
 * serverless driver or Prisma adapters.
 *
 * @neondatabase/serverless v1.x uses a module-level singleton `neonConfig` to
 * select the WebSocket implementation. When the Prisma adapter-neon factory calls
 * `new neon.Pool(config)` inside `.connect()`, it reads `neonConfig.webSocketConstructor`
 * at that moment. If ws has not been registered yet the pool silently falls back
 * to the browser's native WebSocket (which doesn't exist in Node.js) and emits
 * the confusing "No database host" error on the first transaction attempt.
 *
 * Setting it once here — before any test module is imported — avoids the ordering
 * sensitivity that caused intermittent failures when the pool was created at
 * module scope in individual test files.
 */
import "dotenv/config";
import ws from "ws";
import { neonConfig } from "@neondatabase/serverless";

neonConfig.webSocketConstructor = ws;
