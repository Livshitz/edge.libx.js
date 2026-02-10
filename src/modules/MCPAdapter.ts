import { RouterType, IRequest } from 'itty-router';

export interface MCPOptions {
	name?: string;
	version?: string;
}

interface ToolMeta {
	description?: string;
	params?: Record<string, { description?: string; type?: string }>;
}

interface ToolDefinition {
	name: string;
	description: string;
	inputSchema: {
		type: 'object';
		properties: Record<string, any>;
		required: string[];
	};
}

interface JsonRpcRequest {
	jsonrpc: '2.0';
	id?: string | number;
	method: string;
	params?: any;
}

export class MCPAdapter {
	private router: RouterType<any, any[], any>;
	private base: string;
	private fetchHandler: (request: IRequest, ctx?: any) => Promise<Response>;
	private serverName: string;
	private serverVersion: string;
	private mcpMeta: Map<string, ToolMeta>;

	constructor(
		router: RouterType<any, any[], any>,
		base: string,
		fetchHandler: (request: IRequest, ctx?: any) => Promise<Response>,
		mcpMeta: Map<string, ToolMeta>,
		options?: MCPOptions,
	) {
		this.router = router;
		this.base = base;
		this.fetchHandler = fetchHandler;
		this.mcpMeta = mcpMeta;
		this.serverName = options?.name ?? 'MCP Server';
		this.serverVersion = options?.version ?? '1.0.0';
	}

	public toolNameFromRoute(method: string, path: string): string {
		let name = path;
		// Strip base path
		if (this.base && name.startsWith(this.base)) {
			name = name.slice(this.base.length);
		}
		// Remove leading slash
		name = name.replace(/^\//, '');
		// Replace :param with "by_param"
		name = name.replace(/:(\w+)/g, 'by_$1');
		// Replace slashes with underscores
		name = name.replace(/\//g, '_');
		// Prepend method
		name = `${method.toLowerCase()}_${name}`;
		// Clean up double underscores
		name = name.replace(/_+/g, '_').replace(/_$/, '');
		return name;
	}

	public inferQueryParams(handlers: Function[]): string[] {
		const params = new Set<string>();
		for (const handler of handlers) {
			try {
				const src = handler.toString();
				// Match req.query.paramName, request.query.paramName, query.paramName
				const dotPattern = /(?:req(?:uest)?\.)?query\.(\w+)/g;
				let match: RegExpExecArray | null;
				while ((match = dotPattern.exec(src)) !== null) {
					params.add(match[1]);
				}
				// Match req.query['paramName'] or req.query["paramName"]
				const bracketPattern = /(?:req(?:uest)?\.)?query\[['"](\w+)['"]\]/g;
				while ((match = bracketPattern.exec(src)) !== null) {
					params.add(match[1]);
				}
			} catch {
				// handler.toString() may fail for native code
			}
		}
		return Array.from(params);
	}

	public introspectRoutes(): ToolDefinition[] {
		const routes: any[] = (this.router as any).routes ?? [];
		const tools: ToolDefinition[] = [];

		for (const route of routes) {
			// itty-router v5 stores routes as [method, regex, handlers[], path]
			const [method, , handlers, originalPath] = route;

			// Skip wildcard catch-alls and OPTIONS
			if (!originalPath || originalPath === '*' || originalPath.endsWith('/*')) continue;
			if (method === 'OPTIONS' || method === 'ALL') continue;

			const toolName = this.toolNameFromRoute(method, originalPath);
			const metaKey = `${method}:${originalPath}`;
			const meta = this.mcpMeta.get(metaKey);

			const properties: Record<string, any> = {};
			const required: string[] = [];

			// Extract path params
			const paramPattern = /:(\w+)/g;
			let match: RegExpExecArray | null;
			while ((match = paramPattern.exec(originalPath)) !== null) {
				const paramName = match[1];
				properties[paramName] = {
					type: meta?.params?.[paramName]?.type ?? 'string',
					...(meta?.params?.[paramName]?.description && { description: meta.params[paramName].description }),
				};
				required.push(paramName);
			}

			// POST/PUT/PATCH get a body property
			if (['POST', 'PUT', 'PATCH'].includes(method)) {
				properties['body'] = {
					type: 'object',
					description: meta?.params?.['body']?.description ?? 'Request body',
				};
			}

			// Infer query params for GET/DELETE
			if (['GET', 'DELETE'].includes(method)) {
				const queryParams = this.inferQueryParams(handlers);
				for (const qp of queryParams) {
					if (!properties[qp]) {
						properties[qp] = {
							type: meta?.params?.[qp]?.type ?? 'string',
							...(meta?.params?.[qp]?.description && { description: meta.params[qp].description }),
						};
					}
				}
			}

			const description = meta?.description ?? `${method} ${originalPath}`;

			tools.push({
				name: toolName,
				description,
				inputSchema: {
					type: 'object',
					properties,
					required,
				},
			});
		}

		return tools;
	}

	private findRoute(toolName: string): { method: string; path: string; handlers: Function[] } | null {
		const routes: any[] = (this.router as any).routes ?? [];
		for (const route of routes) {
			const [method, , handlers, originalPath] = route;
			if (!originalPath || originalPath === '*' || originalPath.endsWith('/*')) continue;
			if (method === 'OPTIONS' || method === 'ALL') continue;
			if (this.toolNameFromRoute(method, originalPath) === toolName) {
				return { method, path: originalPath, handlers };
			}
		}
		return null;
	}

	public async callTool(name: string, args: Record<string, any> = {}): Promise<any> {
		const route = this.findRoute(name);
		if (!route) {
			return { isError: true, content: [{ type: 'text', text: `Unknown tool: ${name}` }] };
		}

		const { method, path } = route;

		// Build URL with path params substituted
		let url = path;
		const pathParamPattern = /:(\w+)/g;
		let match: RegExpExecArray | null;
		while ((match = pathParamPattern.exec(path)) !== null) {
			const paramName = match[1];
			if (args[paramName] != null) {
				url = url.replace(`:${paramName}`, encodeURIComponent(String(args[paramName])));
			}
		}

		// Build query string for non-path, non-body params
		const pathParams = new Set<string>();
		const ppPattern = /:(\w+)/g;
		let m: RegExpExecArray | null;
		while ((m = ppPattern.exec(path)) !== null) pathParams.add(m[1]);

		const queryParams: string[] = [];
		for (const [key, value] of Object.entries(args)) {
			if (key === 'body' || pathParams.has(key)) continue;
			queryParams.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
		}
		if (queryParams.length > 0) {
			url += '?' + queryParams.join('&');
		}

		const fullUrl = `http://localhost${url}`;
		const requestInit: RequestInit = { method };
		if (args.body && ['POST', 'PUT', 'PATCH'].includes(method)) {
			requestInit.body = JSON.stringify(args.body);
			requestInit.headers = { 'Content-Type': 'application/json' };
		}

		const request = new Request(fullUrl, requestInit);

		try {
			const response = await this.fetchHandler(request as any);
			const text = await response.text();
			let content: any;
			try {
				content = JSON.parse(text);
			} catch {
				content = text;
			}
			return {
				content: [{ type: 'text', text: typeof content === 'string' ? content : JSON.stringify(content) }],
			};
		} catch (err: any) {
			return {
				isError: true,
				content: [{ type: 'text', text: err?.message ?? String(err) }],
			};
		}
	}

	public async handleJsonRpc(message: JsonRpcRequest): Promise<any> {
		const { method, id, params } = message;

		switch (method) {
			case 'initialize':
				return {
					jsonrpc: '2.0',
					id,
					result: {
						protocolVersion: '2024-11-05',
						capabilities: { tools: { listChanged: true } },
						serverInfo: { name: this.serverName, version: this.serverVersion },
					},
				};

			case 'notifications/initialized':
				// No response needed for notifications
				return null;

			case 'tools/list':
				return {
					jsonrpc: '2.0',
					id,
					result: { tools: this.introspectRoutes() },
				};

			case 'tools/call': {
				const result = await this.callTool(params?.name, params?.arguments ?? {});
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
	}

	public httpHandler = async (request: Request): Promise<Response> => {
		if (request.method === 'GET') {
			// SSE endpoint for server-sent events (Streamable HTTP)
			const stream = new ReadableStream({
				start(controller) {
					const encoder = new TextEncoder();
					controller.enqueue(encoder.encode(`event: endpoint\ndata: /mcp\n\n`));
					// Keep connection open - client will close
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

		// POST: JSON-RPC request
		try {
			const body = await request.json() as JsonRpcRequest;
			const result = await this.handleJsonRpc(body);
			if (result === null) {
				return new Response(null, { status: 204 });
			}
			return new Response(JSON.stringify(result), {
				headers: { 'Content-Type': 'application/json' },
			});
		} catch (err: any) {
			return new Response(JSON.stringify({
				jsonrpc: '2.0',
				id: null,
				error: { code: -32700, message: 'Parse error' },
			}), {
				status: 400,
				headers: { 'Content-Type': 'application/json' },
			});
		}
	};

	public async serveStdio(): Promise<void> {
		const stdin = (globalThis as any).process.stdin;
		const stdout = (globalThis as any).process.stdout;

		stdin.setEncoding('utf8');

		let buffer = '';
		stdin.on('data', async (chunk: string) => {
			buffer += chunk;
			// Process complete lines
			const lines = buffer.split('\n');
			buffer = lines.pop() ?? '';

			for (const line of lines) {
				const trimmed = line.trim();
				if (!trimmed) continue;
				try {
					const message = JSON.parse(trimmed) as JsonRpcRequest;
					const result = await this.handleJsonRpc(message);
					if (result !== null) {
						stdout.write(JSON.stringify(result) + '\n');
					}
				} catch {
					stdout.write(JSON.stringify({
						jsonrpc: '2.0',
						id: null,
						error: { code: -32700, message: 'Parse error' },
					}) + '\n');
				}
			}
		});
	}
}
