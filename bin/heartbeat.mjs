import { mkdirSync, openSync, closeSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { agentPeekHome } from '../i18n.ts';
import { presenceRoot, processAlive, writePresence } from '../presence.ts';

const stateFile = process.argv[2];
const hostPid = Number(process.argv[3]);
if (!stateFile) process.exit(0);
const root = agentPeekHome();
const lock = `${stateFile}.lock`;
let fd;
try { fd = openSync(lock, 'wx', 0o600); }
catch {
  try {
    const owner = Number(readFileSync(lock, 'utf8'));
    if (processAlive(owner)) process.exit(0);
    unlinkSync(lock);
    fd = openSync(lock, 'wx', 0o600);
  } catch { process.exit(0); }
}
writeFileSync(fd, String(process.pid));
mkdirSync(presenceRoot(root), { recursive: true, mode: 0o700 });
const presenceFile = join(presenceRoot(root), basename(stateFile));

function stop(removeState = false) {
  for (const file of [presenceFile, lock, ...(removeState ? [stateFile] : [])]) { try { unlinkSync(file); } catch {} }
  try { closeSync(fd); } catch {}
  process.exit(0);
}
function tick() {
  try {
    const state = JSON.parse(readFileSync(stateFile, 'utf8'));
    if (state.activity === 'ended' || (hostPid > 0 && !processAlive(hostPid)) ||
      (hostPid < 1 && Date.now() - state.changed > 30000)) return stop(true);
    if (!state.file) return;
    writePresence(presenceFile, { ...state, pid: hostPid > 0 ? hostPid : process.pid });
  } catch { stop(); }
}
process.on('SIGTERM', () => stop());
process.on('SIGINT', () => stop());
tick();
setInterval(tick, Math.max(25, Number(process.env.AGENT_PEEK_HEARTBEAT_MS) || 5000));
