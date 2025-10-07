# 🗡️ edge.libx.js

Provider-agnostic, edge-compatible, [itty-router](https://itty.dev/itty-router/) microrouter wrapper. 
Allowing you to create multi-route endpoints that can work with Cloudflare, Vercel, Google Cloud Functions, Netlify Functions, and any other provider.

## Get Started:

```ts
import { RouterWrapper, cors } from 'edge.libx.js';
import { json, error } from 'itty-router';

// Create router with base path and optional CORS configuration
const routerWrapper = RouterWrapper.getNew('/v1', {
	origin: '*',
	allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
	allowHeaders: ['Content-Type', 'Authorization']
});

// Add routes
routerWrapper.router.get('/ping', async (req) => {
	return json({ message: 'pong', timestamp: Date.now() });
});

routerWrapper.router.post('/users', async (req) => {
	const body = await req.json();
	return json({ success: true, user: body });
});

// Catch unmatched routes
routerWrapper.catchNotFound();

// Export for edge runtime (Cloudflare Workers, Vercel Edge, etc.)
export default {
	fetch: routerWrapper.fetchHandler.bind(routerWrapper)
};
```

Useful package.json scripts:
```json
{
    "scripts": {
        "build": "tsc",
        "watch": "tsc -w",
        "test": "jest",
        "format": "prettier --config .prettierrc 'src/**/*.ts' 'tests/**/*.ts' --write"
    }
}
```

## Features:

### CORS Support
Built-in CORS handling with configurable options:
```ts
const routerWrapper = RouterWrapper.getNew('/api', {
	origin: ['https://example.com', 'https://app.example.com'],
	allowMethods: ['GET', 'POST', 'PUT', 'DELETE'],
	allowHeaders: ['Content-Type', 'Authorization', 'X-API-Key']
});
```

### Error Handling
Automatic error handling with proper HTTP status codes:
```ts
routerWrapper.router.get('/error-example', async () => {
	throw new Error('Something went wrong'); // Returns 500 with error message
});
```

### Local Development
For local development with Express.js:
```ts
// Create server adapter for local development
const server = routerWrapper.createServerAdapter();

// Start local server (HTTP)
tsx node_modules/edge.libx.js/build/helpers/localServer.js src/index.js

// Start local server with HTTPS (self-signed certificate)
tsx node_modules/edge.libx.js/build/helpers/localServer.js src/index.js --https

// Or set environment variable
useHttps=true tsx node_modules/edge.libx.js/build/helpers/localServer.js src/index.js
```

Add these scripts to your `package.json`:
```json
{
    "scripts": {
        "dev": "tsx node_modules/edge.libx.js/build/helpers/localServer.js src/index.js",
        "dev:https": "tsx node_modules/edge.libx.js/build/helpers/localServer.js src/index.js --https",
        "dev:watch": "nodemon --watch 'src/**/*.ts' --exec tsx node_modules/edge.libx.js/build/helpers/localServer.js src/index.js"
    }
}
```

### Route Registration
Register sub-routers for modular organization:
```ts
const subRouter = RouterWrapper.getNew('/users');
subRouter.router.get('/:id', async (req) => {
	return json({ userId: req.params.id });
});

routerWrapper.registerRoute('/users', () => subRouter);
```

## Contribute:

### Build:

> `$ bun run build`

### Watch & Build:

> `$ bun run watch`

### Run tests:

> `$ bun run test <optional: path-to-test-file>`

---

Scaffolded with [🏗 TS-scaffold](https://github.com/Livshitz/ts-scaffold.git)

