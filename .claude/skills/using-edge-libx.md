---
name: using-edge-libx
description: Use edge.libx.js to build edge-compatible HTTP APIs with auto-CORS, error handling, and MCP (Model Context Protocol) support. Covers RouterWrapper setup, route registration, MCP tool generation, metadata enrichment, and both HTTP and stdio transports.
---

# Using edge.libx.js

## When to Use
- Setting up a new HTTP API with edge.libx.js
- Exposing REST routes as MCP tools for Claude Code or other MCP clients
- Adding MCP support to an existing `RouterWrapper` setup
- Configuring stdio vs HTTP MCP transport

---

## Router Setup

```typescript
import { RouterWrapper } from 'edge.libx.js';

const rw = RouterWrapper.getNew('/api');  // base path prefix
```

Register routes **without** the base path — itty-router prepends it:
```typescript
// Correct: registers as GET /api/users/:id
rw.router.get('/users/:id', (req) => ({ id: req.params.id }));

// Wrong: would become GET /api/api/users/:id
rw.router.get('/api/users/:id', ...);
```

For Node.js HTTP server:
```typescript
import { createServer } from 'http';
const server = createServer(rw.createServerAdapter());
server.listen(3000);
```

---

## MCP Support

### Minimal Setup

```typescript
const mcp = rw.asMCP({ name: 'My API', version: '1.0.0' });
```

Tools are auto-generated from routes. Naming: strip base, convert `:param` → `by_param`, join with `_`, prefix method:
- `GET /api/users/:id` → `get_users_by_id`
- `POST /api/todos` → `post_todos`

### Enrich Tool Descriptions

`describeMCP` adds human-readable descriptions and parameter docs. Call before or after `asMCP()`.

```typescript
rw.describeMCP('/todos', 'GET', {
  description: 'List all todos. Optionally filter by done status.',
  params: {
    done: { description: 'Filter by done status: "true" or "false"' },
  },
});

rw.describeMCP('/todos/:id', 'PUT', {
  description: 'Update an existing todo.',
  params: {
    id: { description: 'The todo ID to update' },
    body: { description: 'JSON with optional "title" and/or "done" fields' },
  },
});
```

### MCPOptions

```typescript
const mcp = rw.asMCP({
  name: 'My API',        // Default: 'MCP Server'
  version: '1.0.0',     // Default: '1.0.0'
  instructions: '...',  // Optional: system-level instructions injected on initialize
});
```

---

## Transports

### HTTP Transport

Mount the MCP handler as a route, then call via POST JSON-RPC:

```typescript
rw.router.all('/mcp', mcp.httpHandler as any);
rw.catchNotFound();
```

```bash
# Initialize
curl -X POST http://localhost:3000/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'

# List tools
curl -X POST http://localhost:3000/mcp \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'

# Call a tool
curl -X POST http://localhost:3000/mcp \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_todos","arguments":{}}}'
```

GET returns an SSE stream (`Content-Type: text/event-stream`).

### Stdio Transport (for Claude Code)

```typescript
if (process.argv.includes('--stdio')) {
  mcp.serveStdio();
} else {
  // HTTP mode
}
```

Register in Claude Code:
```bash
claude mcp add -s project my-api -- npx tsx path/to/server.ts --stdio
```

This writes to `.mcp.json` at the project root.

---

## Auto-Inferred Behaviors

| Feature | How it works |
|---|---|
| Path params | Extracted from route pattern (`:id` → required param) |
| Query params | Regex scan of handler `.toString()` for `req.query.X` |
| Body param | Auto-added for POST/PUT/PATCH methods |
| Dynamic routes | `introspectRoutes()` reflects routes added after `asMCP()` |

---

## Full Working Example

See `examples/mcp-server.ts` — a complete Todo CRUD API with REST + MCP, demonstrating:
- Route registration
- `describeMCP` enrichment for all routes
- HTTP mode with MCP endpoint mounted
- Stdio mode with `--stdio` flag
- `createServer` adapter for Node.js

---

## Key Gotchas

- Route paths on `rw.router` must **not** include the base path
- `describeMCP` key is `METHOD:/path` — path is without base prefix, matching how routes are registered
- Query param inference via `.toString()` is regex-based — fragile for minified or complex handlers; prefer explicit `describeMCP` for reliability
- `MCPAdapter` uses `(globalThis as any).process` for edge compatibility — don't assume Node.js globals are available outside stdio mode
