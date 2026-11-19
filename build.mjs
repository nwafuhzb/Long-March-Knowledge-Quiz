import { mkdir, readFile, writeFile, copyFile, cp } from 'node:fs/promises';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const bank = (await read('./src/questions.mjs')).replace('export default', 'const questions =');
const fullBank = (await read('./src/question-bank.mjs')).replace('export default', 'const questionBank =');
const ui = (await read('./src/ui.mjs')).replaceAll('export const', 'const');
const worker = (await read('./src/worker.mjs')).replace(/^import .*\r?\n/gm, '');
await mkdir('dist/server', { recursive: true });
await mkdir('dist/.openai', { recursive: true });
await writeFile('dist/server/index.js', [bank, fullBank, ui, worker].join('\n'));
await copyFile('.openai/hosting.json', 'dist/.openai/hosting.json');
await cp('drizzle', 'dist/.openai/drizzle', { recursive: true });
