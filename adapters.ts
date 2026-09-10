import { open, stat } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { extname } from 'node:path';
import { readSession, sameDirectory, snapshot, clip } from './core.ts';
import { liveSessions } from './presence.ts';

const MAX_FILE = 64 * 1024 * 1024;
const MAX_LINE = 8 * 1024 * 1024;
const MAX_ENTRIES = 100000;

export async function discoverAgents(_piDirectory, cwd, selfId, registryRoot) {
  const sessions = [];
  let skipped = 0;
  for (const p of liveSessions(Date.now(), registryRoot).values()) {
    if (p.id === selfId || !await sameDirectory(p.cwd, cwd) || extname(p.file) !== '.jsonl') continue;
    try {
      const info = await stat(p.file);
      if (!info.isFile() || info.size > MAX_FILE) { skipped++; continue; }
      sessions.push({ id: p.id, file: p.file, cwd: p.cwd, modified: info.mtimeMs,
        activity: p.activity ?? 'unknown', source: p.source });
    } catch { skipped++; }
  }
  return { sessions: sessions.sort((a, b) => b.modified - a.modified), skipped };
}

function contentText(content) {
  if (typeof content === 'string') return clip(content, 2500);
  if (!Array.isArray(content)) return '';
  return clip(content.filter(x => ['text', 'input_text', 'output_text'].includes(x?.type) && typeof x.text === 'string')
    .map(x => x.text).join('\n'), 2500);
}

function claudeEntry(raw, index) {
  if (!['user', 'assistant'].includes(raw?.type) || !raw.message) return null;
  const content = raw.message.content;
  const result = Array.isArray(content) ? content.find(x => x?.type === 'tool_result') : null;
  return {
    id: String(raw.uuid ?? `claude-${index}`), parentId: raw.parentUuid ?? null,
    timestamp: raw.timestamp, type: 'message', role: result ? 'toolResult' : raw.message.role ?? raw.type,
    text: result ? '' : contentText(content), toolCallId: result?.tool_use_id,
    calls: Array.isArray(content) ? content.filter(x => x?.type === 'tool_use')
      .map(x => ({ id: String(x.id ?? ''), name: clip(x.name, 80) })) : [],
    isError: result?.is_error === true, stopReason: raw.message.stop_reason,
  };
}

function codexEntry(raw, index, parentId) {
  if (raw?.type !== 'response_item' || !raw.payload) return null;
  const p = raw.payload;
  const base = { id: String(p.id ?? raw.ordinal ?? `codex-${index}`), parentId,
    timestamp: raw.timestamp, type: 'message' };
  if (p.type === 'message' && ['user', 'assistant'].includes(p.role)) {
    return { ...base, role: p.role, text: contentText(p.content), calls: [], stopReason: p.role === 'assistant' ? 'stop' : undefined };
  }
  if (p.type === 'function_call') return { ...base, role: 'assistant', text: '',
    calls: [{ id: String(p.call_id ?? base.id), name: clip(p.name, 80) }], stopReason: 'toolUse' };
  if (p.type === 'function_call_output') return { ...base, role: 'toolResult', text: '',
    toolCallId: String(p.call_id ?? ''), toolName: '', calls: [], isError: false };
  return null;
}

async function readForeignSession(session, cwd) {
  const handle = await open(session.file, 'r');
  try {
    const info = await handle.stat();
    if (!info.isFile() || !info.size || info.size > MAX_FILE) throw new Error('Invalid or oversized session file.');
    const stream = handle.createReadStream({ autoClose: false, start: 0, end: info.size - 1 });
    const lines = createInterface({ input: stream, crlfDelay: Infinity });
    const entries = [];
    let recordedCwd, recordedId, parentId = null, skipped = 0, index = 0;
    try {
      for await (const line of lines) {
        if (line.length > MAX_LINE) throw new Error('Session line exceeds the 8 MiB limit.');
        let raw;
        try { raw = JSON.parse(line.replace(/^\uFEFF/, '')); } catch { skipped++; continue; }
        if (session.source === 'claude') {
          recordedCwd ??= raw.cwd;
          recordedId ??= raw.sessionId;
          const entry = claudeEntry(raw, index++);
          if (entry) entries.push(entry);
        } else {
          if (raw.type === 'session_meta') {
            recordedCwd ??= raw.payload?.cwd;
            recordedId ??= raw.payload?.session_id ?? raw.payload?.id;
          }
          const entry = codexEntry(raw, index++, parentId);
          if (entry) { entries.push(entry); parentId = entry.id; }
        }
        if (entries.length > MAX_ENTRIES) throw new Error('Session exceeds the 100,000 entry limit.');
      }
    } finally { lines.close(); stream.destroy(); }
    if (typeof recordedCwd !== 'string' || !await sameDirectory(recordedCwd, cwd)) throw new Error('Session belongs to another directory.');
    if (recordedId && String(recordedId) !== session.id) throw new Error('Session ID does not match its presence record.');
    return snapshot(entries, { id: session.id, modified: info.mtimeMs, skipped, source: session.source });
  } finally { await handle.close(); }
}

export function readAgentSession(session, cwd) {
  return session.source === 'pi' ? readSession(session.file, cwd) : readForeignSession(session, cwd);
}
