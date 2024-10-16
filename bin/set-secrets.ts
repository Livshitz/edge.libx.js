#!/usr/bin/env bun

import { readFileSync } from 'fs';
import { execSync } from 'child_process';

const args = process.argv.slice(2);
const file = args[0] || '.dev.vars';
const env = args[1] || 'preview';
const setCommand = args[2] || 'vercel env add';
const removeExisting = args[3] === 'remove'; // Additional flag to remove existing keys

console.log(`DBG: ${file} | ${env} | ${setCommand} | Remove existing: ${removeExisting}`);

try {
	const fileContents = readFileSync(file, 'utf8');
	const lines = fileContents.split('\n');

	for (const line of lines) {
		if (!line.trim() || line.startsWith('#')) {
			const glimpse = line.substring(0, 10);
			console.log(`Skipping comment or empty line: ${glimpse}...`);
			continue;
		}

		const firstEqualIndex = line.indexOf('=');
		if (firstEqualIndex === -1) {
			console.log(`Skipping invalid line: ${line}`);
			continue;
		}

		const key = line.substring(0, firstEqualIndex).trim();
		const rawValue = line.substring(firstEqualIndex + 1).trim();
		// Escape double quotes in the value
		let value = rawValue.replace(/"/g, '\\"');
		value = rawValue.replace(/"/g, '\\"');

		console.log(`Processing key: ${key}`);

		if (removeExisting) {
			try {
				execSync(`vercel env rm "${key}" ${env} --yes`, { stdio: 'ignore' });
				console.log(`Removed existing key: ${key}`);
			} catch (error) {
				console.log(`No existing key to remove or error removing key: ${key}`);
			}
		}

		if (!value) {
			console.log(`No value for "${key}", skipping...`);
			continue;
		}

		const command = `printf "%s" "${value}" | ${setCommand} "${key}" ${env}`;
		console.log('Running command...');
		console.log(`DBG: ${command}`);

		try {
			const result = execSync(command, { stdio: 'pipe' });
			console.log(`Command successfully executed for key: ${key}`);
		} catch (error) {
			console.error(`Error executing command for key: ${key}`);
			console.error(`Error message: ${error.message}`);
		}

		console.log('---------------------');
	}
} catch (error) {
	console.error(`Error: `, error);
	process.exit(1);
}
