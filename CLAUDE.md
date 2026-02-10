# edge.libx.js

Edge-compatible HTTP API toolkit wrapping itty-router, with built-in CORS and zero-config MCP adapter.

## Tech Stack

- **Runtime**: Node.js / Edge (Cloudflare Workers, Vercel Edge)
- **Router**: itty-router v5
- **CORS**: Custom web-API-only implementation (not the npm `cors` package)
- **Server adapter**: `@whatwg-node/server` for Node.js `http.createServer` compatibility
- **Build**: TypeScript → `build/` via `tsc`
- **Tests**: Jest with ts-jest

## Commands

- `npm run build` — Build to `build/`
- `npm test -- --config jest.config.js` — Run tests (must pass `--config` due to duplicate config in package.json)
- `npx tsc --noEmit` — Type-check only

## Architecture

- `src/main.ts` — Public barrel exports: `RouterWrapper`, `MCPAdapter`, `cors`
- `src/modules/RouterWrapper.ts` — Core class. Wraps itty-router with auto-CORS, error handling, subrouter mounting, and `@whatwg-node/server` adapter.
- `src/modules/MCPAdapter.ts` — MCP (Model Context Protocol) adapter. Introspects itty-router's internal `router.routes` array to auto-generate MCP tool definitions from routes.
- `src/modules/cors.ts` — Standalone CORS using only web APIs (Request/Response/Headers). Not itty-router's built-in cors.
- `src/helpers/` — Utilities: JWT, request parsing, Express adapter, edge network helpers, local dev server.

## Key Details

- **Route registration**: Routes on `rw.router` must NOT include the base path — itty-router prepends it automatically. `rw.router.get('/users/:id', ...)` with base `/api` becomes `GET /api/users/:id`. Registering as `/api/users/:id` would double the prefix.
- **itty-router route internals**: Routes are stored as `[method, RegExp, handlers[], originalPath]` in `router.routes`. The MCP adapter reads this for introspection.
- **MCP tool naming**: Strips base path, replaces `:param` with `by_param`, joins with underscores. `GET /api/users/:id` → `get_users_by_id`.
- **MCP query param inference**: Parses handler `.toString()` for `req.query.X` patterns. Fragile but works for common cases.
- **MCP transports**: HTTP (POST JSON-RPC to a mounted endpoint) and stdio (reads JSON-RPC lines from stdin, writes to stdout).
- **MCP enrichment**: `describeMCP(path, method, meta)` stores metadata in a `Map` keyed as `METHOD:/base/path`. Shared by reference — can be called before or after `asMCP()`.
- **CORS**: `RouterWrapper.getNew()` sets up itty-router's `before` hook with CORS preflight. `fetchHandler` wraps responses with `corsify`. The `cors.ts` module is a separate standalone utility.
- **Error handling**: `RouterWrapper.errorHandler` extracts status from `error.status`, `error.statusCode`, `error.code`, or `error.error.code`. Falls back to 500.
- **process.stdin/stdout**: The MCPAdapter uses `(globalThis as any).process` to access Node.js process — the tsconfig's type definitions don't fully expose it for edge compatibility.

## Claude Code MCP Setup

Register a stdio MCP server pointing at a server script with `--stdio` flag:

```bash
claude mcp add -s project my-api -- npx tsx path/to/server.ts --stdio
```

This writes to `.mcp.json` at the project root. See `examples/mcp-server.ts` for a complete working example (Todo CRUD API with REST + MCP).

## Testing

Tests are in `tests/`. The `MCPAdapter.spec.ts` test creates a `RouterWrapper` with routes, calls `asMCP()`, and tests introspection, JSON-RPC handling, HTTP transport, and dynamic route reflection. Routes in tests are registered without the base prefix (matching real usage).
