#!/usr/bin/env node
import { discoverAgents, readAgentSession } from '../adapters.ts';
import { compactCard } from '../core.ts';
import { getLanguage, setLanguage, t } from '../i18n.ts';

const args = process.argv.slice(2);
let command = args.shift() || 'peek';
if (command === 'peek' && args[0] === 'language') { args.shift(); command = 'language'; }
if (command === 'language') {
  const requested = args[0];
  const current = getLanguage();
  const language = requested ? setLanguage(requested) : setLanguage(current === 'en' ? 'zh' : 'en');
  console.log(language === 'zh' ? 'Agent Peek 语言：中文' : 'Agent Peek language: English');
  process.exit(0);
}
if (command !== 'peek') {
  console.error('Usage: agent-peek [peek [session-id-prefix] | language [en|zh]]');
  process.exit(2);
}
let cwd = process.cwd(), selfId = process.env.CODEX_SESSION_ID || '';
for (let i = 0; i < args.length;) {
  if (args[i] === '--cwd') { cwd = args[i + 1] || cwd; args.splice(i, 2); }
  else if (args[i] === '--self') { selfId = args[i + 1] || selfId; args.splice(i, 2); }
  else i++;
}
const language = getLanguage();
try {
  const { sessions } = await discoverAgents('', cwd, selfId);
  const prefix = args[0];
  const working = sessions.filter(s => s.activity === 'busy' && (!prefix || s.id.startsWith(prefix)));
  if (!working.length) { console.log(t(language, 'noWorking')); process.exit(0); }
  if (working.length > 1) {
    console.log(language === 'zh' ? '发现多个运行中的会话，请使用 ID 前缀重新执行：' : 'Multiple working sessions; rerun with an ID prefix:');
    for (const session of working) console.log(`- ${session.source} ${session.id}`);
    process.exit(0);
  }
  const session = working[0];
  const data = await readAgentSession(session, cwd);
  const lines = compactCard(data, undefined, session.activity, language);
  lines[0] = `${t(language, 'otherSession')} · ${lines[0]}`;
  const bold = process.stdout.isTTY && !process.env.NO_COLOR ? text => `\x1b[1m${text}\x1b[22m` : text => text;
  console.log(lines.map(bold).join('\n'));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
