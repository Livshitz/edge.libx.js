import { createServerAdapter } from '@whatwg-node/server';
import 'isomorphic-fetch';
import { IRequest, Router, error, json } from 'itty-router';
import express from 'express';
import { getExpress } from './getExpress';
// import { router, server } from '../v5';
import fs from 'fs';
import { log, LogLevel } from 'libx.js/build/modules/log';
import { libx } from 'libx.js/build/bundles/node.essentials';
import path from 'path';

require('dotenv').config({ path: `.env.${process.env.NODE_ENV}` });

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
if (['debug', 'debug:watch', 'api:debug'].indexOf(process.env.npm_lifecycle_event) !== -1) {
	const env = getEnvVars() ?? { a: 1 };

	for (let entryPoint of entryPoints) {
		const dir = process.cwd(); // process.argv[1]
		const { handler, prefix } = require(`${dir}/${entryPoint}`);
		app.use(
			prefix ?? '/api',
			createServerAdapter((request, env) =>
				handler(<IRequest>request, env))
		);
	}

	// app.use(
	// 	'/v5-n',
	// 	createServerAdapter((request, env) =>
	// 		handler_node(<IRequest>request, env))
	// 		// handlerRedirect(<IRequest>request, env))
	// );

	const port = 8080;
	try {
		app.listen(port, () => {
			console.log(`Server listening on http://0.0.0.0:${port}`);
		});
	} catch (err) {
		console.warn(`LOCAL: Failed to start local server on port: ${port}`);
	}
}

// export default server; //routes.fetch;