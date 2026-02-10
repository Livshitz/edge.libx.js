/**
 * MCP-enabled API server example.
 *
 * Demonstrates exposing standard REST routes as MCP tools automatically.
 * Works with both:
 *   - Postman / curl (regular HTTP)
 *   - Claude Code / any MCP client (via /mcp endpoint or stdio)
 *
 * Usage:
 *   # HTTP mode (default) — serves REST + MCP on port 3000:
 *   npx tsx examples/mcp-server.ts
 *
 *   # Stdio mode — for Claude Code local MCP config:
 *   npx tsx examples/mcp-server.ts --stdio
 *
 * Claude Code config (~/.claude/claude_code_config.json):
 *   {
 *     "mcpServers": {
 *       "todo-api": {
 *         "command": "npx",
 *         "args": ["tsx", "<path-to>/examples/mcp-server.ts", "--stdio"]
 *       }
 *     }
 *   }
 *
 * Postman examples:
 *   GET  http://localhost:3000/api/todos
 *   POST http://localhost:3000/api/todos      { "title": "Buy milk" }
 *   GET  http://localhost:3000/api/todos/1
 *   PUT  http://localhost:3000/api/todos/1     { "title": "Updated", "done": true }
 *   DELETE http://localhost:3000/api/todos/1
 *   GET  http://localhost:3000/api/search?q=milk&limit=5
 *
 * MCP via HTTP (Postman):
 *   POST http://localhost:3000/mcp
 *   Body: { "jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {} }
 *   Body: { "jsonrpc": "2.0", "id": 2, "method": "tools/list" }
 *   Body: { "jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": { "name": "get_todos", "arguments": {} } }
 */

import { createServer } from 'http';
import { RouterWrapper } from '../src/main';
import { IRequest } from 'itty-router';

// ---------------------------------------------------------------------------
// In-memory data store
// ---------------------------------------------------------------------------
interface Todo {
    id: number;
    title: string;
    done: boolean;
}

let nextId = 1;
const todos: Map<number, Todo> = new Map();

// Seed some data
todos.set(nextId, { id: nextId++, title: 'Learn about MCP', done: false });
todos.set(nextId, { id: nextId++, title: 'Build an API', done: true });
todos.set(nextId, { id: nextId++, title: 'Connect Claude Code', done: false });

// ---------------------------------------------------------------------------
// Router setup
// ---------------------------------------------------------------------------
const rw = RouterWrapper.getNew('/api');

// GET /api/todos — list all todos, optional ?done=true/false filter
rw.router.get('/todos', (req: IRequest) => {
    let items = Array.from(todos.values());
    if (req.query.done !== undefined) {
        const filterDone = req.query.done === 'true';
        items = items.filter((t) => t.done === filterDone);
    }
    return items;
});

// GET /api/todos/:id — get a single todo
rw.router.get('/todos/:id', (req: IRequest) => {
    const todo = todos.get(Number(req.params.id));
    if (!todo) throw { status: 404, message: `Todo ${req.params.id} not found` };
    return todo;
});

// POST /api/todos — create a new todo
rw.router.post('/todos', async (req: IRequest) => {
    const body = await req.json();
    const todo: Todo = { id: nextId++, title: body.title ?? 'Untitled', done: false };
    todos.set(todo.id, todo);
    return todo;
});

// PUT /api/todos/:id — update a todo
rw.router.put('/todos/:id', async (req: IRequest) => {
    const todo = todos.get(Number(req.params.id));
    if (!todo) throw { status: 404, message: `Todo ${req.params.id} not found` };
    const body = await req.json();
    if (body.title !== undefined) todo.title = body.title;
    if (body.done !== undefined) todo.done = body.done;
    return todo;
});

// DELETE /api/todos/:id — delete a todo
rw.router.delete('/todos/:id', (req: IRequest) => {
    const id = Number(req.params.id);
    if (!todos.has(id)) throw { status: 404, message: `Todo ${id} not found` };
    todos.delete(id);
    return { deleted: id };
});

// GET /api/search — search todos by query string
rw.router.get('/search', (req: IRequest) => {
    const q = String(req.query.q ?? '').toLowerCase();
    const limit = Number(req.query.limit) || 10;
    const results = Array.from(todos.values())
        .filter((t) => t.title.toLowerCase().includes(q))
        .slice(0, limit);
    return { q, limit, results };
});

// ---------------------------------------------------------------------------
// MCP enrichment (optional — adds descriptions to auto-generated tools)
// ---------------------------------------------------------------------------
rw.describeMCP('/todos', 'GET', {
    description: 'List all todos. Optionally filter by done status.',
    params: { done: { description: 'Filter by done status: "true" or "false"' } },
});
rw.describeMCP('/todos/:id', 'GET', {
    description: 'Get a single todo by its ID.',
    params: { id: { description: 'The todo ID (number)' } },
});
rw.describeMCP('/todos', 'POST', {
    description: 'Create a new todo.',
    params: { body: { description: 'JSON with "title" field' } },
});
rw.describeMCP('/todos/:id', 'PUT', {
    description: 'Update an existing todo.',
    params: {
        id: { description: 'The todo ID to update' },
        body: { description: 'JSON with optional "title" and/or "done" fields' },
    },
});
rw.describeMCP('/todos/:id', 'DELETE', {
    description: 'Delete a todo by ID.',
    params: { id: { description: 'The todo ID to delete' } },
});
rw.describeMCP('/search', 'GET', {
    description: 'Search todos by title substring.',
    params: {
        q: { description: 'Search query string' },
        limit: { description: 'Max results to return (default 10)' },
    },
});

// ---------------------------------------------------------------------------
// MCP adapter
// ---------------------------------------------------------------------------
const mcp = rw.asMCP({ name: 'Todo API', version: '1.0.0' });

// ---------------------------------------------------------------------------
// Stdio mode — for Claude Code
// ---------------------------------------------------------------------------
if (process.argv.includes('--stdio')) {
    mcp.serveStdio();
} else {
    // HTTP mode — mount MCP endpoint alongside REST routes
    rw.router.all('/mcp', mcp.httpHandler as any);
    rw.catchNotFound();

    const server = createServer(rw.createServerAdapter());
    const port = Number(process.env.PORT) || 3033;
    server.listen(port, () => {
        console.log(`Todo API running on http://localhost:${port}`);
        console.log(`  REST:  http://localhost:${port}/api/todos`);
        console.log(`  MCP:   http://localhost:${port}/api/mcp  (POST JSON-RPC)`);
        console.log(`  Stdio: npx tsx examples/mcp-server.ts --stdio`);
    });
}
