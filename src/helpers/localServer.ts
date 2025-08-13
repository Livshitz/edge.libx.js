// $ npm_lifecycle_event=debug tsx --inspect ./src/helpers/localServer.ts --https
import { createServerAdapter } from '@whatwg-node/server';
import 'isomorphic-fetch';
import { IRequest, Router, error, json } from 'itty-router';
import express, { Express, Request, Response } from "express";
import { getExpress } from './getExpress';
// import { router, server } from '../v5';
import fs from 'fs';
import { log, LogLevel } from 'libx.js/build/modules/log';
import { libx } from 'libx.js/build/bundles/node.essentials';
import path from 'path';
import https, { createServer } from 'https';
import selfsigned from 'selfsigned';

declare const process: NodeJS.Process;

libx.node.loadEnv({ path: `.env.${process.env.NODE_ENV}` });

log.isDebug = true;
log.filterLevel = LogLevel.All;

const envFile = '.env'; //'.dev.vars'
const entryPoints = libx.node.args._;

const { app } = getExpress();

// node-wrangler bridge:
// global.crypto = require('crypto');
// global.TransformStream = require('web-streams-polyfill').TransformStream;

function getEnvVars() {
	const envFilePath = path.join(process.cwd(), envFile);
	if (!fs.existsSync(envFilePath)) return null;
	const content = fs.readFileSync(envFilePath)?.toString();
	const ret = {};
	for (let line of content.split('\n')) {
		const parts = line.split('=');
		if (parts[0].trim().startsWith('#') || parts[1] == null) continue;
		ret[parts[0].trim()] = parts[1].replace(/\s*[\"\'](.+)[\"\']\s*/gi, '$1');
	}
	return ret;
}

libx.node.catchErrors((err) => {
	console.error('!!!!!! ERROR: ', err);
}, false);


// only lunch manual local server if using 'dev' command
if (true || ['debug', 'debug:watch', 'api:debug', ''].indexOf(process.env.npm_lifecycle_event) !== -1) {
	const env = getEnvVars() ?? { a: 1 };

	for (let entryPoint of entryPoints) {
		const dir = process.cwd(); // process.argv[1]
		const { handler, prefix } = require(`${dir}/${entryPoint}`);
		app.use(
			prefix ?? '/api',
			createServerAdapter((request, ctx) =>
				handler(<IRequest>request, env, ctx))
		);
	}

	// app.use(
	// 	'/v5-n',
	// 	createServerAdapter((request, env) =>
	// 		handler_node(<IRequest>request, env))
	// 		// handlerRedirect(<IRequest>request, env))
	// );

	const port = process.env.PORT || 8080;
	try {
		let server: https.Server | Express = app;

		const isHttps = process.env.useHttps ?? (libx.node.args.https != null) ?? false;
		if (isHttps) {
			libx.log.v('localServer: using https');
			const attrs = [{ name: 'commonName', value: 'localhost' }];
			const pems = selfsigned.generate(attrs, { days: 365 });

			server = createServer({
				key: pems.private,
				cert: pems.cert,
			}, app);
		}

		server.listen(port, () => {
			console.log(`Server listening on http${isHttps ? 's' : ''}://0.0.0.0:${port}`);
		});
	} catch (err) {
		console.error(`LOCAL: Failed to start local server on port: ${port}`, err);
	}
}

// export default server; //routes.fetch;