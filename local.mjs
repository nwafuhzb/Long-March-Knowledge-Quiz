import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import worker from './src/worker.mjs';

export function database(path = ':memory:') {
  const sqlite = new DatabaseSync(path);
  sqlite.exec(readFileSync(new URL('./drizzle/0000_contest.sql', import.meta.url), 'utf8').replace('CREATE TABLE', 'CREATE TABLE IF NOT EXISTS'));
  return { prepare(sql) {
    const statement = sqlite.prepare(sql);
    const bind = (...args) => ({
      first: async () => statement.get(...args),
      run: async () => ({ meta: statement.run(...args) })
    });
    return { ...bind(), bind };
  } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const env = { DB: database('contest.sqlite'), QUIZ_SECRET: process.env.QUIZ_SECRET || randomBytes(20).toString('hex') };
  const port = Number(process.env.QUIZ_PORT || 8787);
  createServer(async (req, res) => {
    const body = req.method === 'POST' ? await Array.fromAsync(req) : null;
    const response = await worker.fetch(new Request('http://localhost' + req.url, {
      method: req.method, headers: req.headers, body: body ? Buffer.concat(body) : undefined
    }), env);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  }).listen(port, '127.0.0.1', () => console.log('http://127.0.0.1:' + port + ' — 主持口令 ' + env.QUIZ_SECRET));
}

