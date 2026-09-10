import { mkdirSync, writeFileSync, renameSync, readdirSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { agentPeekHome } from './i18n.ts';

export function presenceRoot(root = agentPeekHome()) { return join(root, 'presence'); }
export function processAlive(pid) {
  try { process.kill(pid, 0); return true; }
  catch (error) { return error.code === 'EPERM'; }
}
export function writePresence(file, state) {
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, JSON.stringify({ ...state, updated: Date.now() }), { mode: 0o600 });
  renameSync(temp, file);
}
export function startPresence(getState, root = agentPeekHome()) {
  const directory = presenceRoot(root);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const file = join(directory, `${process.pid}-${randomUUID()}.json`);
  const update = () => writePresence(file, { ...getState(), pid: process.pid });
  update();
  const timer = setInterval(() => { try { update(); } catch { /* Expired heartbeats are ignored. */ } }, 5000);
  timer.unref();
  return { file, update, stop() {
    clearInterval(timer);
    try { unlinkSync(file); } catch {}
  } };
}

export function liveSessions(now = Date.now(), root = agentPeekHome()) {
  let files;
  try { files = readdirSync(presenceRoot(root)); } catch { return new Map(); }
  const sessions = new Map();
  for (const file of files.filter(f => f.endsWith('.json'))) {
    try {
      const p = JSON.parse(readFileSync(join(presenceRoot(root), file), 'utf8'));
      if (!Number.isInteger(p.pid) || p.pid < 1 || !Number.isFinite(p.updated) ||
        now - p.updated > 20000 || now < p.updated || typeof p.id !== 'string' ||
        typeof p.file !== 'string' || typeof p.cwd !== 'string' ||
        !['pi', 'claude', 'codex'].includes(p.source) || !processAlive(p.pid)) continue;
      const key = `${p.source}:${p.id}`;
      if (!sessions.has(key) || sessions.get(key).updated < p.updated) sessions.set(key, p);
    } catch { /* Ignore incomplete/unreadable presence records. */ }
  }
  return sessions;
}
