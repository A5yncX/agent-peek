import { createHash } from 'node:crypto';
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { agentPeekHome } from '../i18n.ts';

async function input() {
  let text = '';
  for await (const chunk of process.stdin) {
    text += chunk;
    if (text.length > 1024 * 1024) throw new Error('Hook input exceeds 1 MiB.');
  }
  return JSON.parse(text || '{}');
}
function processInfo(pid) {
  try {
    if (process.platform === 'win32') {
      const script = `$p=Get-CimInstance Win32_Process -Filter "ProcessId=${pid}"; if($p){@{pid=$p.ProcessId;ppid=$p.ParentProcessId;cmd=$p.CommandLine;name=$p.Name}|ConvertTo-Json -Compress}`;
      const out = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', timeout: 3000 }).stdout;
      return out.trim() ? JSON.parse(out) : null;
    }
    const out = spawnSync('ps', ['-o', 'ppid=,comm=,args=', '-p', String(pid)], { encoding: 'utf8', timeout: 3000 }).stdout.trim();
    const match = out.match(/^(\d+)\s+(\S+)\s*(.*)$/s);
    return match ? { pid, ppid: Number(match[1]), name: match[2], cmd: match[3] } : null;
  } catch { return null; }
}
function hostPid(source) {
  const forced = Number(process.env.AGENT_PEEK_HOST_PID);
  if (Number.isInteger(forced) && forced > 0) return forced;
  let pid = process.ppid;
  for (let i = 0; i < 8 && pid > 1; i++) {
    const info = processInfo(pid);
    if (!info) break;
    const command = `${info.name ?? ''} ${info.cmd ?? ''}`.toLowerCase();
    if (source === 'codex' ? /(^|[\\/\s])codex(?:\.exe)?([\s]|$)/.test(command)
      : /(^|[\\/\s])claude(?:\.exe|\.js)?([\s]|$)/.test(command)) return pid;
    pid = Number(info.ppid);
  }
  return 0;
}
function sourceOf(data) {
  const path = String(data.transcript_path ?? '').toLowerCase();
  if (path.includes('.codex')) return 'codex';
  if (path.includes('.claude')) return 'claude';
  return process.env.PLUGIN_DATA ? 'codex' : 'claude';
}

try {
  const data = await input();
  if (typeof data.session_id !== 'string' || typeof data.cwd !== 'string') process.exit(0);
  const source = sourceOf(data);
  const event = data.hook_event_name;
  const activity = ['UserPromptSubmit', 'PreToolUse', 'PostToolUse'].includes(event) ? 'busy'
    : ['PermissionRequest', 'Notification'].includes(event) ? 'waiting'
    : event === 'SessionEnd' ? 'ended' : 'idle';
  const directory = join(agentPeekHome(), 'state');
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const key = `${source}-${createHash('sha256').update(data.session_id).digest('hex').slice(0, 24)}`;
  const file = join(directory, `${key}.json`);
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, JSON.stringify({ source, id: data.session_id, cwd: data.cwd,
    file: data.transcript_path ?? '', activity, changed: Date.now() }), { mode: 0o600 });
  renameSync(temp, file);
  if (activity !== 'ended') {
    spawn(process.execPath, [join(import.meta.dirname, '../bin/heartbeat.mjs'), file, String(hostPid(source))],
      { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  }
} catch { /* Status integration must never block an agent hook. */ }
