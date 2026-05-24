import { RouterType, IRequest } from 'itty-router';
import { MCPAuth, MCPAuthOptions } from './MCPAuth';
export interface MCPOptions {
    name?: string;
    version?: string;
    instructions?: string;
    auth?: Partial<MCPAuthOptions>;
}
interface ToolAnnotations {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
}
interface ToolMeta {
    description?: string;
    params?: Record<string, {
        description?: string;
        type?: string;
        required?: boolean;
    }>;
    annotations?: ToolAnnotations;
}
interface ToolDefinition {
    name: string;
    description: string;
    inputSchema: {
        type: 'object';
        properties: Record<string, any>;
        required: string[];
    };
    annotations?: ToolAnnotations;
}
interface JsonRpcRequest {
    jsonrpc: '2.0';
    id?: string | number;
    method: string;
    params?: any;
}
export declare class MCPAdapter {
    private router;
    private base;
    private fetchHandler;
    private serverName;
    private serverVersion;
    private instructions?;
    private mcpMeta;
    auth?: MCPAuth;
    constructor(router: RouterType<any, any[], any>, base: string, fetchHandler: (request: IRequest, ctx?: any) => Promise<Response>, mcpMeta: Map<string, ToolMeta>, options?: MCPOptions);
    toolNameFromRoute(method: string, path: string): string;
    inferQueryParams(handlers: Function[]): string[];
    introspectRoutes(): ToolDefinition[];
    private findRoute;
    callTool(name: string, args?: Record<string, any>): Promise<any>;
    handleJsonRpc(message: JsonRpcRequest): Promise<any>;
    httpHandler: (request: Request) => Promise<Response>;
    serveStdio(): Promise<void>;
}
export {};
