## Description
Intermittent 500 Server Errors (and React Error 441 in production builds) were occurring randomly on pages that fetch data server-side (like `/categories` and `/checkout`). The failure presented as a generic Next.js fallback UI: `"This page couldn't load"`. 

## Root Cause
The root cause was **WebSocket Connection Exhaustion** within Cloudflare Workers' isolated environments. 
The application was using `PrismaNeon` (the WebSocket-based Neon serverless driver adapter) to connect to the database. Because Cloudflare Pages routes traffic to multiple isolated worker instances (V8 isolates), and the database connection was made within Next.js `cache()` boundaries in root layouts (e.g., verifying vendor context or user session), each request initiated a new persistent WebSocket connection.
Once an isolate reached its concurrent connection limit or violated Cloudflare's strict I/O context boundaries, any subsequent request hitting that specific isolate would crash with an unhandled `ErrorEvent`.

## Resolution
The database adapter in `lib/db.ts` was switched from `PrismaNeon` to `PrismaNeonHttp`.
- `PrismaNeonHttp` uses standard HTTP `fetch` requests instead of stateful WebSockets.
- HTTP requests are stateless, preventing connection pool exhaustion on Cloudflare edge nodes.
- It seamlessly integrates with Cloudflare's standard I/O context for fetch.

## How to Verify Future Regressions
Regression testing scripts have been moved to `tests/regression/`.
Run the following script to verify stability against the staging or production URL. The script loads the page 20 times concurrently to stress-test the connection pool. If any requests return a 500 error or contain "This page couldn’t load", the regression has returned.

```bash
node tests/regression/test-crash.js
```

## References
- Cloudflare Workers Limits: https://developers.cloudflare.com/workers/platform/limits/
- Prisma Neon HTTP Adapter: https://www.prisma.io/docs/orm/overview/databases/neon
