/**
 * OAuth 2.1 Authorization Server for MCP.
 * Stateless JWT tokens via HMAC-SHA256, PKCE S256 code exchange.
 * ~200 lines, zero external deps.
 */

export class MCPAuthOptions {
	baseUrl: string = 'http://localhost:8100';
	secret: string = '';
	serviceName?: string = 'MCP Server';
	tokenTtl?: number = 3600;
	codeTtl?: number = 300;
	loginUrl?: string = '/_auth';
	validateLogin: (req: Request) => boolean | Promise<boolean> = () => false;
}

interface PendingCode {
	codeChallenge: string;
	clientId: string;
	redirectUri: string;
	expiresAt: number;
}

export class MCPAuth {
	public options: MCPAuthOptions;
	private pendingCodes = new Map<string, PendingCode>();
	private cryptoKey: Promise<CryptoKey>;

	constructor(options: Partial<MCPAuthOptions>) {
		this.options = { ...new MCPAuthOptions(), ...options };
		this.cryptoKey = crypto.subtle.importKey(
			'raw',
			new TextEncoder().encode(this.options.secret),
			{ name: 'HMAC', hash: 'SHA-256' },
			false,
			['sign', 'verify'],
		);
	}

	/** Single dispatcher — returns Response if matched, null otherwise. */
	public handleRequest(pathname: string, req: Request): Response | Promise<Response> | null {
		if (pathname === '/.well-known/oauth-protected-resource') return this.resourceMetadataHandler();
		if (pathname === '/.well-known/oauth-authorization-server') return this.authServerMetadataHandler();
		if (pathname === '/oauth/authorize') return this.authorizeHandler(req);
		if (pathname === '/oauth/token') return this.tokenHandler(req);
		if (pathname === '/oauth/register') return this.registerHandler(req);
		return null;
	}

	// ── Well-known endpoints ──────────────────────────────────────────

	private resourceMetadataHandler(): Response {
		return Response.json({
			resource: this.options.baseUrl,
			authorization_servers: [this.options.baseUrl],
		});
	}

	private authServerMetadataHandler(): Response {
		const b = this.options.baseUrl;
		return Response.json({
			issuer: b,
			authorization_endpoint: `${b}/oauth/authorize`,
			token_endpoint: `${b}/oauth/token`,
			registration_endpoint: `${b}/oauth/register`,
			response_types_supported: ['code'],
			grant_types_supported: ['authorization_code'],
			code_challenge_methods_supported: ['S256'],
			token_endpoint_auth_methods_supported: ['none'],
		});
	}

	// ── Authorization endpoint ────────────────────────────────────────

	private async authorizeHandler(req: Request): Promise<Response> {
		const url = new URL(req.url);

		// POST = consent form submission (approve)
		if (req.method === 'POST') {
			const form = await req.formData().catch(() => null);
			const code = crypto.randomUUID();
			const clientId = form?.get('client_id')?.toString() ?? '';
			const redirectUri = form?.get('redirect_uri')?.toString() ?? '';
			const codeChallenge = form?.get('code_challenge')?.toString() ?? '';

			this.pendingCodes.set(code, {
				codeChallenge,
				clientId,
				redirectUri,
				expiresAt: Date.now() + (this.options.codeTtl! * 1000),
			});

			const redirect = new URL(redirectUri);
			redirect.searchParams.set('code', code);
			const state = form?.get('state')?.toString();
			if (state) redirect.searchParams.set('state', state);
			return Response.redirect(redirect.toString(), 302);
		}

		// GET — check login, show consent page
		const loggedIn = await this.options.validateLogin(req);
		if (!loggedIn) {
			const loginRedirect = new URL(this.options.loginUrl!, this.options.baseUrl);
			loginRedirect.searchParams.set('redirect', req.url);
			return Response.redirect(loginRedirect.toString(), 302);
		}

		const clientId = url.searchParams.get('client_id') ?? 'unknown';
		const redirectUri = url.searchParams.get('redirect_uri') ?? '';
		const codeChallenge = url.searchParams.get('code_challenge') ?? '';
		const codeChallengeMethod = url.searchParams.get('code_challenge_method') ?? '';
		const state = url.searchParams.get('state') ?? '';

		if (codeChallengeMethod && codeChallengeMethod !== 'S256') {
			return new Response('Unsupported code_challenge_method', { status: 400 });
		}

		return new Response(this.consentPage(clientId, redirectUri, codeChallenge, state), {
			headers: { 'Content-Type': 'text/html' },
		});
	}

	// ── Dynamic Client Registration (RFC 7591) ───────────────────────

	private async registerHandler(req: Request): Promise<Response> {
		if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
		const body = await req.json().catch(() => ({})) as Record<string, any>;
		const clientId = crypto.randomUUID();
		return Response.json({
			client_id: clientId,
			client_name: body.client_name ?? 'MCP Client',
			redirect_uris: body.redirect_uris ?? [],
			grant_types: ['authorization_code'],
			response_types: ['code'],
			token_endpoint_auth_method: 'none',
		}, { status: 201 });
	}

	// ── Token endpoint ────────────────────────────────────────────────

	private async tokenHandler(req: Request): Promise<Response> {
		if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

		// Lazy cleanup of expired codes
		const now = Date.now();
		for (const [k, v] of this.pendingCodes) {
			if (v.expiresAt < now) this.pendingCodes.delete(k);
		}

		const ct = req.headers.get('content-type') ?? '';
		let params: URLSearchParams;
		if (ct.includes('json')) {
			const body = await req.json() as Record<string, string>;
			params = new URLSearchParams(body);
		} else {
			params = new URLSearchParams(await req.text());
		}

		const grantType = params.get('grant_type');
		if (grantType !== 'authorization_code') {
			return Response.json({ error: 'unsupported_grant_type' }, { status: 400 });
		}

		const code = params.get('code') ?? '';
		const codeVerifier = params.get('code_verifier') ?? '';
		const pending = this.pendingCodes.get(code);

		if (!pending || pending.expiresAt < now) {
			this.pendingCodes.delete(code);
			return Response.json({ error: 'invalid_grant' }, { status: 400 });
		}

		// PKCE S256 verification
		const challengeBytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier));
		const computed = base64url(new Uint8Array(challengeBytes));
		if (computed !== pending.codeChallenge) {
			this.pendingCodes.delete(code);
			return Response.json({ error: 'invalid_grant', error_description: 'PKCE verification failed' }, { status: 400 });
		}

		this.pendingCodes.delete(code);

		// Mint JWT
		const token = await this.mintJwt();
		return Response.json({
			access_token: token,
			token_type: 'Bearer',
			expires_in: this.options.tokenTtl!,
		});
	}

	// ── Token validation ──────────────────────────────────────────────

	public async validateToken(req: Request): Promise<boolean> {
		const auth = req.headers.get('Authorization');
		if (!auth?.startsWith('Bearer ')) return false;
		const token = auth.slice(7);
		return this.verifyJwt(token);
	}

	public unauthorizedResponse(): Response {
		return new Response('Unauthorized', {
			status: 401,
			headers: {
				'WWW-Authenticate': `Bearer resource_metadata="${this.options.baseUrl}/.well-known/oauth-protected-resource"`,
			},
		});
	}

	// ── JWT helpers (HMAC-SHA256, no deps) ────────────────────────────

	private async mintJwt(): Promise<string> {
		const now = Math.floor(Date.now() / 1000);
		const header = base64url(new TextEncoder().encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
		const payload = base64url(new TextEncoder().encode(JSON.stringify({
			sub: 'mcp-client',
			iss: this.options.baseUrl,
			iat: now,
			exp: now + this.options.tokenTtl!,
		})));
		const data = `${header}.${payload}`;
		const sig = await crypto.subtle.sign('HMAC', await this.cryptoKey, new TextEncoder().encode(data));
		return `${data}.${base64url(new Uint8Array(sig))}`;
	}

	private async verifyJwt(token: string): Promise<boolean> {
		const parts = token.split('.');
		if (parts.length !== 3) return false;
		try {
			const data = `${parts[0]}.${parts[1]}`;
			const sig = base64urlDecode(parts[2]);
			const valid = await crypto.subtle.verify('HMAC', await this.cryptoKey, sig, new TextEncoder().encode(data));
			if (!valid) return false;
			const payload = JSON.parse(new TextDecoder().decode(base64urlDecode(parts[1])));
			if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return false;
			return true;
		} catch {
			return false;
		}
	}

	// ── Consent page ──────────────────────────────────────────────────

	private consentPage(clientId: string, redirectUri: string, codeChallenge: string, state: string): string {
		const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
		return `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Authorize — ${esc(this.options.serviceName!)}</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{min-height:100svh;display:flex;align-items:center;justify-content:center;background:#09090b;color:#fafafa;font-family:system-ui,sans-serif}
.card{background:#18181b;border:1px solid #27272a;border-radius:8px;padding:2rem;width:100%;max-width:400px;text-align:center}
h1{font-size:1.1rem;font-weight:600;margin-bottom:.5rem}
p{color:#a1a1aa;font-size:.875rem;margin-bottom:1.5rem}
code{background:#27272a;padding:.125rem .375rem;border-radius:4px;font-size:.8rem}
button{padding:.5rem 1.5rem;background:#fafafa;color:#09090b;border:none;border-radius:6px;font-size:.875rem;font-weight:500;cursor:pointer}
</style></head><body>
<div class="card">
<h1>Authorize Access</h1>
<p><code>${esc(clientId)}</code> wants to access <strong>${esc(this.options.serviceName!)}</strong>.</p>
<form method="POST" action="/oauth/authorize">
<input type="hidden" name="client_id" value="${esc(clientId)}">
<input type="hidden" name="redirect_uri" value="${esc(redirectUri)}">
<input type="hidden" name="code_challenge" value="${esc(codeChallenge)}">
<input type="hidden" name="state" value="${esc(state)}">
<button type="submit">Approve</button>
</form>
</div></body></html>`;
	}
}

// ── Base64url helpers ─────────────────────────────────────────────────

function base64url(bytes: Uint8Array): string {
	let binary = '';
	for (const b of bytes) binary += String.fromCharCode(b);
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(s: string): Uint8Array {
	const padded = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice(0, (4 - (s.length % 4)) % 4);
	const binary = atob(padded);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}
