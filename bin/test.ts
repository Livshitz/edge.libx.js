
import { readFileSync } from 'fs';
import { execSync } from 'child_process';

const args = process.argv.slice(2);
const file = args[0] || '.dev.vars';
const env = args[1] || 'preview';
const setCommand = args[2] || 'vercel env add';
const removeExisting = args[3] === 'remove'; // Additional flag to remove existing keys

console.log(`DBG: ${file} | ${env} | ${setCommand} | Remove existing: ${removeExisting}`);

try {
	console.log('---------------------');
} catch (error) {
	console.error(`${file} does not exist.`);
	process.exit(1);
}
