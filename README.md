# 🗡️ edge.libx.js

Provider-agnostic, edge-compatible, [itty-router](https://itty.dev/itty-router/) microrouter wrapper. 
Allowing you to crete multi-route endpoints that can work with Cloudflare, Vercel, Google Cloud Functions, Netlify Functions, and any other provider.

## Get Started:

```ts:
import { Route, Router, RouterType, error, json, cors, text } from 'itty-router';
import { RouterWrapper } from 'edge.libx.js';

const routerWrapper = RouterWrapper.getNew('/v1');

routerWrapper.router.all('/ping', async (req) => {
	return json({ message: 'pong' });
});
```

Useful package.json scripts:
```json:
...
    "scripts": {
        "build": "tsc",
        "debug": "tsx --inspect node_modules/edge.libx.js/src/helpers/localServer.ts src/index.ts",
        "debug:watch": "nodemon --watch 'src/**/*.ts' --exec tsx --inspect node_modules/edge.libx.js/src/helpers/localServer.ts src/index.ts",

        "set-secrets": "set-secrets .env.preview preview \"vercel env add\" remove",

    }
...
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

