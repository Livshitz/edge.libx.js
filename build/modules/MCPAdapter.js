"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MCPAdapter = void 0;
const MCPAuth_1 = require("./MCPAuth");
class MCPAdapter {
    constructor(router, base, fetchHandler, mcpMeta, options) {
        var _a, _b;
        this.httpHandler = (request) => __awaiter(this, void 0, void 0, function* () {
            if (this.auth) {
                const valid = yield this.auth.validateToken(request);
                if (!valid)
                    return this.auth.unauthorizedResponse();
            }
            if (request.method === 'GET') {
                const stream = new ReadableStream({
                    start(controller) {
                        const encoder = new TextEncoder();
                        controller.enqueue(encoder.encode(`event: endpoint\ndata: /mcp\n\n`));
                    },
                });
                return new Response(stream, {
                    headers: {
                        'Content-Type': 'text/event-stream',
                        'Cache-Control': 'no-cache',
                        'Connection': 'keep-alive',
                    },
                });
            }
            try {
                const body = yield request.json();
                const result = yield this.handleJsonRpc(body);
                if (result === null) {
                    return new Response(null, { status: 204 });
                }
                return new Response(JSON.stringify(result), {
                    headers: { 'Content-Type': 'application/json' },
                });
            }
            catch (err) {
                return new Response(JSON.stringify({
                    jsonrpc: '2.0',
                    id: null,
                    error: { code: -32700, message: 'Parse error' },
                }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' },
                });
            }
        });
        this.router = router;
        this.base = base;
        this.fetchHandler = fetchHandler;
        this.mcpMeta = mcpMeta;
        this.serverName = (_a = options === null || options === void 0 ? void 0 : options.name) !== null && _a !== void 0 ? _a : 'MCP Server';
        this.serverVersion = (_b = options === null || options === void 0 ? void 0 : options.version) !== null && _b !== void 0 ? _b : '1.0.0';
        this.instructions = options === null || options === void 0 ? void 0 : options.instructions;
        if (options === null || options === void 0 ? void 0 : options.auth) {
            this.auth = new MCPAuth_1.MCPAuth(options.auth);
        }
    }
    toolNameFromRoute(method, path) {
        let name = path;
        if (this.base && name.startsWith(this.base)) {
            name = name.slice(this.base.length);
        }
        name = name.replace(/^\//, '');
        name = name.replace(/:(\w+)/g, 'by_$1');
        name = name.replace(/\//g, '_');
        name = `${method.toLowerCase()}_${name}`;
        name = name.replace(/_+/g, '_').replace(/_$/, '');
        return name;
    }
    inferQueryParams(handlers) {
        const params = new Set();
        for (const handler of handlers) {
            try {
                const src = handler.toString();
                const dotPattern = /(?:req(?:uest)?\.)?query\.(\w+)/g;
                let match;
                while ((match = dotPattern.exec(src)) !== null) {
                    params.add(match[1]);
                }
                const bracketPattern = /(?:req(?:uest)?\.)?query\[['"](\w+)['"]\]/g;
                while ((match = bracketPattern.exec(src)) !== null) {
                    params.add(match[1]);
                }
                const destructPattern = /(?:const|let|var)\s*\{\s*([^}]+)\}\s*=\s*(?:req(?:uest)?\.)?query/g;
                while ((match = destructPattern.exec(src)) !== null) {
                    for (const name of match[1].split(',')) {
                        const clean = name.trim().split(/[\s:]/)[0];
                        if (clean && /^\w+$/.test(clean))
                            params.add(clean);
                    }
                }
            }
            catch (_a) {
            }
        }
        return Array.from(params);
    }
    introspectRoutes() {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s;
        const routes = (_a = this.router.routes) !== null && _a !== void 0 ? _a : [];
        const tools = [];
        for (const route of routes) {
            const [method, , handlers, originalPath] = route;
            if (!originalPath || originalPath === '*' || originalPath.endsWith('/*'))
                continue;
            if (method === 'OPTIONS' || method === 'ALL')
                continue;
            const toolName = this.toolNameFromRoute(method, originalPath);
            const metaKey = `${method}:${originalPath}`;
            const meta = this.mcpMeta.get(metaKey);
            const properties = {};
            const required = [];
            const paramPattern = /:(\w+)/g;
            let match;
            while ((match = paramPattern.exec(originalPath)) !== null) {
                const paramName = match[1];
                properties[paramName] = Object.assign({ type: (_d = (_c = (_b = meta === null || meta === void 0 ? void 0 : meta.params) === null || _b === void 0 ? void 0 : _b[paramName]) === null || _c === void 0 ? void 0 : _c.type) !== null && _d !== void 0 ? _d : 'string' }, (((_f = (_e = meta === null || meta === void 0 ? void 0 : meta.params) === null || _e === void 0 ? void 0 : _e[paramName]) === null || _f === void 0 ? void 0 : _f.description) && { description: meta.params[paramName].description }));
                required.push(paramName);
            }
            if (['POST', 'PUT', 'PATCH'].includes(method)) {
                properties['body'] = {
                    type: 'object',
                    description: (_j = (_h = (_g = meta === null || meta === void 0 ? void 0 : meta.params) === null || _g === void 0 ? void 0 : _g['body']) === null || _h === void 0 ? void 0 : _h.description) !== null && _j !== void 0 ? _j : 'Request body',
                };
            }
            const queryParams = this.inferQueryParams(handlers);
            for (const qp of queryParams) {
                if (!properties[qp]) {
                    properties[qp] = Object.assign({ type: (_m = (_l = (_k = meta === null || meta === void 0 ? void 0 : meta.params) === null || _k === void 0 ? void 0 : _k[qp]) === null || _l === void 0 ? void 0 : _l.type) !== null && _m !== void 0 ? _m : 'string' }, (((_p = (_o = meta === null || meta === void 0 ? void 0 : meta.params) === null || _o === void 0 ? void 0 : _o[qp]) === null || _p === void 0 ? void 0 : _p.description) && { description: meta.params[qp].description }));
                }
                if (((_r = (_q = meta === null || meta === void 0 ? void 0 : meta.params) === null || _q === void 0 ? void 0 : _q[qp]) === null || _r === void 0 ? void 0 : _r.required) && !required.includes(qp)) {
                    required.push(qp);
                }
            }
            const description = (_s = meta === null || meta === void 0 ? void 0 : meta.description) !== null && _s !== void 0 ? _s : `${method} ${originalPath}`;
            tools.push(Object.assign({ name: toolName, description, inputSchema: {
                    type: 'object',
                    properties,
                    required,
                } }, ((meta === null || meta === void 0 ? void 0 : meta.annotations) && { annotations: meta.annotations })));
        }
        return tools;
    }
    findRoute(toolName) {
        var _a;
        const routes = (_a = this.router.routes) !== null && _a !== void 0 ? _a : [];
        for (const route of routes) {
            const [method, , handlers, originalPath] = route;
            if (!originalPath || originalPath === '*' || originalPath.endsWith('/*'))
                continue;
            if (method === 'OPTIONS' || method === 'ALL')
                continue;
            if (this.toolNameFromRoute(method, originalPath) === toolName) {
                return { method, path: originalPath, handlers };
            }
        }
        return null;
    }
    callTool(name_1) {
        return __awaiter(this, arguments, void 0, function* (name, args = {}) {
            var _a, _b;
            const route = this.findRoute(name);
            if (!route) {
                return { isError: true, content: [{ type: 'text', text: `Unknown tool: ${name}` }] };
            }
            const { method, path } = route;
            let url = path;
            const pathParamPattern = /:(\w+)/g;
            let match;
            while ((match = pathParamPattern.exec(path)) !== null) {
                const paramName = match[1];
                if (args[paramName] != null) {
                    url = url.replace(`:${paramName}`, encodeURIComponent(String(args[paramName])));
                }
            }
            const pathParams = new Set();
            const ppPattern = /:(\w+)/g;
            let m;
            while ((m = ppPattern.exec(path)) !== null)
                pathParams.add(m[1]);
            const queryParams = [];
            for (const [key, value] of Object.entries(args)) {
                if (key === 'body' || pathParams.has(key))
                    continue;
                queryParams.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
            }
            if (queryParams.length > 0) {
                url += '?' + queryParams.join('&');
            }
            const fullUrl = `http://localhost${url}`;
            const headers = {};
            if ((_a = this.auth) === null || _a === void 0 ? void 0 : _a.options.secret)
                headers['Authorization'] = `Bearer ${this.auth.options.secret}`;
            if (['POST', 'PUT', 'PATCH'].includes(method))
                headers['Content-Type'] = 'application/json';
            const requestInit = { method, headers };
            if (['POST', 'PUT', 'PATCH'].includes(method)) {
                requestInit.body = JSON.stringify(args.body || {});
            }
            const request = new Request(fullUrl, requestInit);
            try {
                const response = yield this.fetchHandler(request);
                const text = yield response.text();
                let content;
                try {
                    content = JSON.parse(text);
                }
                catch (_c) {
                    content = text;
                }
                const isError = !response.ok;
                if (!isError && content && typeof content === 'object' && typeof content.dataUrl === 'string' && content.dataUrl.startsWith('data:')) {
                    const match = content.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
                    if (match) {
                        const blocks = [];
                        const rest = Object.fromEntries(Object.entries(content).filter(([k]) => k !== 'dataUrl'));
                        if (Object.keys(rest).length > 0)
                            blocks.push({ type: 'text', text: JSON.stringify(rest) });
                        blocks.push({ type: 'image', data: match[2], mimeType: match[1] });
                        return { content: blocks };
                    }
                }
                return Object.assign(Object.assign({}, (isError && { isError: true })), { content: [{ type: 'text', text: typeof content === 'string' ? content : JSON.stringify(content) }] });
            }
            catch (err) {
                return {
                    isError: true,
                    content: [{ type: 'text', text: (_b = err === null || err === void 0 ? void 0 : err.message) !== null && _b !== void 0 ? _b : String(err) }],
                };
            }
        });
    }
    handleJsonRpc(message) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const { method, id, params } = message;
            switch (method) {
                case 'initialize':
                    return {
                        jsonrpc: '2.0',
                        id,
                        result: Object.assign({ protocolVersion: '2024-11-05', capabilities: { tools: { listChanged: true } }, serverInfo: { name: this.serverName, version: this.serverVersion } }, (this.instructions && { instructions: this.instructions })),
                    };
                case 'notifications/initialized':
                    return null;
                case 'tools/list':
                    return {
                        jsonrpc: '2.0',
                        id,
                        result: { tools: this.introspectRoutes() },
                    };
                case 'tools/call': {
                    const result = yield this.callTool(params === null || params === void 0 ? void 0 : params.name, (_a = params === null || params === void 0 ? void 0 : params.arguments) !== null && _a !== void 0 ? _a : {});
                    return {
                        jsonrpc: '2.0',
                        id,
                        result,
                    };
                }
                default:
                    return {
                        jsonrpc: '2.0',
                        id,
                        error: { code: -32601, message: `Method not found: ${method}` },
                    };
            }
        });
    }
    serveStdio() {
        return __awaiter(this, void 0, void 0, function* () {
            const stdin = globalThis.process.stdin;
            const stdout = globalThis.process.stdout;
            stdin.setEncoding('utf8');
            let buffer = '';
            stdin.on('data', (chunk) => __awaiter(this, void 0, void 0, function* () {
                var _a;
                buffer += chunk;
                const lines = buffer.split('\n');
                buffer = (_a = lines.pop()) !== null && _a !== void 0 ? _a : '';
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed)
                        continue;
                    try {
                        const message = JSON.parse(trimmed);
                        const result = yield this.handleJsonRpc(message);
                        if (result !== null) {
                            stdout.write(JSON.stringify(result) + '\n');
                        }
                    }
                    catch (_b) {
                        stdout.write(JSON.stringify({
                            jsonrpc: '2.0',
                            id: null,
                            error: { code: -32700, message: 'Parse error' },
                        }) + '\n');
                    }
                }
            }));
        });
    }
}
exports.MCPAdapter = MCPAdapter;
//# sourceMappingURL=MCPAdapter.js.map