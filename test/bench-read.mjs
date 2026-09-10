// Synthetic sessions only. Run: node test/bench-read.mjs
import { mkdtemp, writeFile, appendFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { readAgentSession } from '../adapters.ts';

const cwd = await mkdtemp(join(tmpdir(), 'peek-bench-'));
try {
  const file = join(cwd, 'session.jsonl');
  const rows = [{ type: 'session', version: 3, id: 'bench', cwd }];
  for (let i = 0; i < 2000; i++) rows.push({ type: 'message', id: String(i), parentId: i ? String(i - 1) : null,
    message: { role: i ? 'toolResult' : 'user', content: i ? 'synthetic output '.repeat(500) : 'Run benchmark', toolName: 'read' } });
  const text = rows.map(JSON.stringify).join('\n') + '\n';
  await writeFile(file, text);
  const session = { source: 'pi', id: 'bench', file };
  const measure = async () => { const start = performance.now(); await readAgentSession(session, cwd); return performance.now() - start; };
  const cold = await measure(), repeated = [], changed = [];
  for (let i = 0; i < 5; i++) repeated.push(await measure());
  for (let i = 2000; i < 2005; i++) {
    await appendFile(file, JSON.stringify({ type: 'message', id: String(i), parentId: String(i - 1),
      message: { role: 'assistant', content: 'Completed: 2/4 benchmark stages' } }) + '\n');
    changed.push(await measure());
  }
  const median = values => values.sort((a, b) => a - b)[Math.floor(values.length / 2)].toFixed(1);
  console.log(`${(Buffer.byteLength(text) / 1024 / 1024).toFixed(1)} MiB · cold ${cold.toFixed(1)} ms · unchanged median ${median(repeated)} ms · appended median ${median(changed)} ms`);
} finally { await rm(cwd, { recursive: true, force: true }); }
