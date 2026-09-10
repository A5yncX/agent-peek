import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { clean, discover, readSession, projectEntry, snapshot, explicitProgress,
  progressBar, validateSummary, compactCard } from '../core.ts';
import { startPresence, liveSessions } from '../presence.ts';
import { contrast, styleLine, startIndicator } from '../card.ts';
import { discoverAgents, readAgentSession } from '../adapters.ts';
import { getConfig, getLanguage, getSummaryModel, setLanguage } from '../i18n.ts';
import { execFileSync, spawn } from 'node:child_process';
import extension from '../index.ts';

const header = cwd => ({ type: 'session', version: 3, id: 'other-id', cwd });
const msg = (id, parentId, role, content, extra = {}) => ({ type: 'message', id, parentId,
  timestamp: '2026-01-01T00:00:00Z', message: { role, content, ...extra } });
const project = entries => entries.map(projectEntry);

async function fixture(run) {
  const dir = await mkdtemp(join(tmpdir(), 'agent-peek-'));
  const previous = process.env.AGENT_PEEK_HOME;
  process.env.AGENT_PEEK_HOME = dir;
  try { await run(dir); } finally {
    if (previous === undefined) delete process.env.AGENT_PEEK_HOME; else process.env.AGENT_PEEK_HOME = previous;
    await rm(dir, { recursive: true, force: true });
  }
}

test('only same-directory siblings, partial line tolerated without modifying file', async () => fixture(async dir => {
  const file = join(dir, 'other.jsonl');
  const content = [header(dir), msg('u', null, 'user', 'Run benchmark'),
    msg('a', 'u', 'assistant', [{ type: 'toolCall', id: 't', name: 'bash', arguments: { command: 'SECRET' } }], { stopReason: 'toolUse' })]
    .map(x => JSON.stringify(x)).join('\n') + '\n{"type":';
  await writeFile(file, content);
  await writeFile(join(dir, 'self.jsonl'), JSON.stringify({ ...header(dir), id: 'self' }));
  await writeFile(join(dir, 'foreign.jsonl'), JSON.stringify(header(join(dir, 'foreign'))));
  await writeFile(join(dir, 'bad.jsonl'), 'bad');
  const before = await stat(file);
  const result = await discover(dir, dir, 'self', false);
  assert.deepEqual(result.sessions.map(s => s.id), ['other-id']);
  assert.equal(result.skipped, 1);
  const data = await readSession(file, dir);
  assert.match(data.status, /runtime unknown/);
  assert.deepEqual(data.pendingTools, ['bash']);
  assert.equal(data.skipped, 1);
  assert.ok(!JSON.stringify(data).includes('SECRET'));
  assert.equal(await readFile(file, 'utf8'), content);
  assert.equal((await stat(file)).mtimeMs, before.mtimeMs);
  await assert.rejects(readSession(file, join(dir, 'foreign')), /another directory/);
}));

test('persisted branch, not abandoned siblings; no running/completed inference', () => {
  const entries = project([
    msg('u', null, 'user', 'Goal A'),
    msg('old', 'u', 'assistant', 'Completed: 4/4 old work', { stopReason: 'stop' }),
    msg('new', 'u', 'user', 'Goal B'),
    msg('a', 'new', 'assistant', 'Planning', { stopReason: 'stop' }),
  ]);
  const data = snapshot(entries);
  assert.equal(data.goal, 'Goal B');
  assert.equal(data.progress, null);
  assert.match(data.status, /completion unverified/);
  assert.ok(!JSON.stringify(data).includes('old work'));
  entries.push(projectEntry(msg('broken', 'missing', 'assistant', 'Completed: 2/4 tests')));
  assert.equal(snapshot(entries).progress, null);
  assert.match(snapshot(entries).warning, /Incomplete branch/);
});

test('compaction retained tail and tool-result pairing', () => {
  const data = snapshot(project([
    msg('old', null, 'user', 'OLD RAW REQUEST'),
    { type: 'compaction', id: 'c', parentId: 'old', summary: 'Goal: new benchmark', retainedTail: [
      { role: 'user', content: 'Resume new benchmark' },
      { role: 'assistant', content: [{ type: 'toolCall', id: 't', name: 'bash' }] },
    ] },
    msg('r', 'c', 'toolResult', [{ type: 'text', text: 'SECRET OUTPUT' }], { toolCallId: 't', toolName: 'bash', isError: true }),
  ]));
  assert.equal(data.goal, 'Resume new benchmark');
  assert.deepEqual(data.pendingTools, []);
  assert.ok(!JSON.stringify(data).includes('OLD RAW'));
  assert.ok(!JSON.stringify(data).includes('SECRET OUTPUT'));
  assert.ok(data.evidence.some(e => e.error));
});

test('privacy projection, terminal controls, bounded model evidence', () => {
  const e = projectEntry(msg('a', null, 'assistant', [
    { type: 'thinking', thinking: 'PRIVATE THOUGHT', thinkingSignature: 'SIGNATURE' },
    { type: 'image', data: 'IMAGE DATA' },
    { type: 'text', text: 'api_key=abc password="xyz" Bearer abcd npm_ABCDEFGHIJKLMNOPQRSTUVWXYZ1234' },
  ]));
  assert.ok(!JSON.stringify(e).includes('PRIVATE'));
  assert.ok(!JSON.stringify(e).includes('SIGNATURE'));
  assert.ok(!JSON.stringify(e).includes('IMAGE'));
  assert.ok(!e.text.includes('abc'));
  assert.ok(!e.text.includes('npm_'));
  assert.equal(clean('\x1b[31mred\x1b[0m\u202e'), 'red');
  const entries = Array.from({ length: 100 }, (_, i) => projectEntry(msg(String(i), i ? String(i - 1) : null,
    i % 3 ? 'assistant' : 'user', 'x'.repeat(3000))));
  assert.ok(JSON.stringify(snapshot(entries).evidence).length <= 16000);
});

test('explicit progress only; labelled subtask scope, no fraction guesses', () => {
  for (const text of ['Step 2/4 started', 'F1: 2/4', 'Progress: 5/4 tests', 'Progress: 0/0 tests',
    'Completed: 2/4 tests [truncated]']) assert.equal(explicitProgress(text, 'a'), null);
  const p = explicitProgress('已完成 2/4 模型组合', 'a');
  assert.equal(progressBar(p).startsWith('[#####-----] 2/4 (50%)'), true);
  assert.equal(p.evidenceId, 'a');
  const checklist = explicitProgress('- [x] Build\n- [ ] Test', 'a');
  assert.equal(checklist.done, 1);
  assert.equal(checklist.total, 2);
  assert.match(checklist.scope, /message only/);
  assert.match(progressBar(null), /unknown/);
});

test('model output must cite evidence; does not control progress bar', () => {
  const evidence = [{ id: 'a' }];
  assert.throws(() => validateSummary('{"goal":{"text":"fake","evidenceId":"missing"}}', evidence));
  const summary = validateSummary('{"goal":{"text":"Test","evidenceId":"a"},"progress":99}', evidence);
  assert.equal(summary.progress, undefined);
  const data = snapshot(project([msg('a', null, 'user', 'Test')]));
  assert.ok(compactCard(data, summary).some(line => line.includes('Progress  Unknown')));
  assert.equal(compactCard(data, summary).length, 5);
});

test('language defaults to English, persists Chinese, and changes card labels', async () => fixture(async () => {
  assert.equal(getLanguage(), 'en');
  const data = snapshot(project([msg('u', null, 'user', 'Build API')]));
  assert.ok(compactCard(data).some(line => line.startsWith('Goal  ')));
  await writeFile(join(process.env.AGENT_PEEK_HOME, 'config.json'), JSON.stringify({ language: 'en', model: 'example/fast-model' }));
  assert.equal(getSummaryModel(), 'example/fast-model');
  setLanguage('zh');
  assert.equal(getLanguage(), 'zh');
  assert.equal(getConfig().model, 'example/fast-model');
  assert.ok(compactCard(data, undefined, 'busy', 'zh').some(line => line.startsWith('目标  ')));
  assert.throws(() => setLanguage('fr'), /en or zh/);
}));

function harness(dir, options = {}) {
  const callbacks = {};
  const widgets = [];
  const notices = [];
  const entries = [];
  const renderers = {};
  const placements = [];
  let calls = 0;
  const pi = { on: (name, fn) => { callbacks[name] = fn; },
    registerCommand: (name, command) => { callbacks[name] = command.handler; },
    registerEntryRenderer: (name, renderer) => { renderers[name] = renderer; },
    appendEntry: (customType, data) => { entries.push({ customType, data }); } };
  const ctx = {
    cwd: dir, hasUI: true, mode: 'rpc', isIdle: () => true,
    model: { provider: 'test', id: 'test' },
    sessionManager: { getSessionDir: () => dir, getSessionId: () => 'self',
      getSessionFile: () => join(dir, 'self.jsonl'),
      getBranch: () => [msg('u', null, 'user', 'Run tests')] },
    ui: { setWidget: (_, lines, options) => { widgets.push(lines); placements.push(options?.placement); }, setStatus() {},
      notify: text => notices.push(text), confirm: async () => options.consent ?? false,
      select: async (_, choices) => choices[0], editor: async () => undefined },
    modelRegistry: { find: (provider, id) => options.findModel?.(provider, id), complete: async (...args) => {
      calls++;
      if (options.complete) return options.complete(...args);
      return { stopReason: 'stop', content: [{ type: 'text', text: '{"goal":{"text":"Run tests","evidenceId":"u"}}' }],
        usage: { totalTokens: 20, cost: { total: 0.001 } } };
    } },
  };
  extension(pi);
  return { callbacks, ctx, widgets, notices, entries, renderers, placements, calls: () => calls };
}

test('command local mode / consent / model request isolation / clear', async () => fixture(async dir => {
  await writeFile(join(dir, 'other.jsonl'), [header(dir), msg('u', null, 'user', 'Run tests')].map(JSON.stringify).join('\n'));
  const presence = startPresence(() => ({ source: 'pi', id: 'other-id', cwd: dir, file: join(dir, 'other.jsonl'), activity: 'busy' }));
  const local = harness(dir);
  await local.callbacks.peek('local', local.ctx);
  assert.equal(local.calls(), 0);
  assert.equal(local.entries.length, 1);
  assert.equal(local.widgets.at(-1), undefined);
  assert.ok(local.placements.includes('belowEditor'));
  await local.callbacks.peek('', local.ctx);
  assert.equal(local.calls(), 0);
  assert.equal(local.entries.length, 2);
  const remote = harness(dir, { consent: true, complete: async (_model, context, options) => {
    assert.equal(context.tools, undefined);
    assert.match(context.systemPrompt, /untrusted/);
    assert.ok(options.signal);
    return { stopReason: 'stop', content: [{ type: 'text', text: '{}' }], usage: { totalTokens: 1, cost: { total: 0 } } };
  } });
  await remote.callbacks.peek('self', remote.ctx);
  assert.equal(remote.calls(), 1);
  assert.equal(remote.entries.length, 1);
  assert.equal(remote.entries[0].customType, 'agent-peek-result');
  assert.ok(remote.renderers['agent-peek-result']);
  await remote.callbacks.peek('clear', remote.ctx);
  assert.equal(remote.widgets.at(-1), undefined);
  presence.stop();
}));

test('configured summary model overrides the current Pi model without switching the session model', async () => fixture(async dir => {
  await writeFile(join(dir, 'config.json'), JSON.stringify({ model: 'example/fast-model' }));
  const configured = { provider: 'example', id: 'fast-model' };
  const h = harness(dir, {
    consent: true,
    findModel: (provider, id) => provider === configured.provider && id === configured.id ? configured : undefined,
    complete: async model => {
      assert.equal(model, configured);
      return { stopReason: 'stop', content: [{ type: 'text', text: '{}' }], usage: { totalTokens: 1, cost: { total: 0 } } };
    },
  });
  await h.callbacks.peek('self', h.ctx);
  assert.equal(h.calls(), 1);
  assert.deepEqual(h.ctx.model, { provider: 'test', id: 'test' });

  const missing = harness(dir);
  await missing.callbacks.peek('self', missing.ctx);
  assert.equal(missing.calls(), 0);
  assert.match(missing.notices.at(-1), /example\/fast-model.*unavailable/);
  assert.equal(missing.entries.length, 1);
}));

test('/peek language switches and persists the shared interface language', async () => fixture(async dir => {
  const h = harness(dir);
  await h.callbacks.peek('language zh', h.ctx);
  assert.equal(getLanguage(), 'zh');
  assert.match(h.notices.at(-1), /中文/);
  await h.callbacks.peek('language en', h.ctx);
  assert.equal(getLanguage(), 'en');
  assert.match(h.notices.at(-1), /English/);
  assert.equal(h.entries.length, 0);
}));

test('automatic routing: self first, one working peer direct, multiple working peers select, no idle fallback', async () => {
  const cases = [
    { self: true, peers: ['busy', 'busy'], goal: 'Run tests', picks: 0 },
    { self: false, peers: ['idle', 'busy', 'waiting'], goal: 'Peer 1', picks: 0 },
    { self: false, peers: ['busy', 'idle', 'busy', 'waiting'], goal: 'Peer 2', picks: 1 },
    { self: false, peers: ['idle', 'waiting'], goal: null, picks: 0 },
    { self: false, peers: [], goal: null, picks: 0 },
    { self: true, waiting: true, peers: ['busy'], goal: 'Peer 0', picks: 0 },
    { self: true, peers: ['busy'], arg: 'local', goal: 'Run tests', picks: 0 },
    { self: false, peers: ['idle'], arg: 'self', goal: 'Run tests', picks: 0 },
    { self: true, peers: ['busy'], arg: 'peer-0', goal: 'Peer 0', picks: 0 },
  ];
  for (const c of cases) await fixture(async dir => {
    const presences = [];
    try {
      for (const [i, activity] of c.peers.entries()) {
        const id = `peer-${i}`, file = `${id}.jsonl`;
        await writeFile(join(dir, file), [{ ...header(dir), id }, msg('u', null, 'user', `Peer ${i}`)]
          .map(JSON.stringify).join('\n'));
        presences.push(startPresence(() => ({ source: 'pi', id, cwd: dir, file: join(dir, file), activity })));
      }
      const h = harness(dir);
      h.ctx.isIdle = () => !c.self;
      if (c.waiting) h.callbacks.ui_prompt_start();
      let picks = 0;
      h.ctx.ui.select = async (_title, choices) => {
        picks++;
        assert.equal(choices.length, 2);
        assert.ok(choices.every(s => s.includes('Working')));
        return choices.find(s => s.endsWith('peer-2'));
      };
      await h.callbacks.peek(c.arg ?? '', h.ctx);
      assert.equal(picks, c.picks, JSON.stringify(c));
      assert.equal(h.calls(), 0);
      if (c.goal) {
        assert.ok(h.entries.at(-1)?.data.lines.includes(`Goal  ${c.goal}`), JSON.stringify(c));
        assert.equal(h.widgets.at(-1), undefined);
        assert.equal(h.notices.length, 0);
      } else {
        assert.equal(h.widgets.at(-1), undefined);
        assert.match(h.notices[0], /No working task found/);
      }
    } finally { for (const p of presences) p.stop(); }
  });
});

test('shutdown cancels nested model request and does not render into replacement session', async () => fixture(async dir => {
  let entered;
  const ready = new Promise(resolve => { entered = resolve; });
  const h = harness(dir, { consent: true, complete: (_model, _context, options) => new Promise((_, reject) => {
    entered(); options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  }) });
  const pending = h.callbacks.peek('self', h.ctx);
  await ready;
  h.callbacks.session_shutdown();
  await pending;
  assert.equal(h.widgets.at(-1), undefined);
  assert.equal(h.entries.length, 0);
  assert.equal(h.notices.length, 0);
}));

test('online discovery excludes history, expired heartbeats, dead PIDs and shutdown', async () => fixture(async dir => {
  await writeFile(join(dir, 'other.jsonl'), JSON.stringify(header(dir)));
  assert.equal((await discover(dir, dir, 'self')).sessions.length, 0);
  const p = startPresence(() => ({ source: 'pi', id: 'other-id', cwd: dir, file: join(dir, 'other.jsonl'), activity: 'busy' }));
  try {
    const found = await discover(dir, dir, 'self');
    assert.equal(found.sessions.length, 1);
    assert.equal(found.sessions[0].activity, 'busy');
    assert.equal(liveSessions(Date.now() + 21000).size, 0);
    const { readdir } = await import('node:fs/promises');
    const file = join(dir, 'presence', (await readdir(join(dir, 'presence')))[0]);
    const record = JSON.parse(await readFile(file, 'utf8'));
    await writeFile(file, JSON.stringify({ ...record, pid: 2147483647 }));
    assert.equal(liveSessions().size, 0);
  } finally { p.stop(); }
  assert.equal(liveSessions().size, 0);
}));

test('Claude and Codex adapters discover only live same-directory sessions and normalize progress', async () => fixture(async dir => {
  const claudeFile = join(dir, 'claude.jsonl');
  await writeFile(claudeFile, [
    { type: 'user', uuid: 'cu', parentUuid: null, sessionId: 'claude-id', cwd: dir, timestamp: '2026-01-01T00:00:00Z', message: { role: 'user', content: 'Build API' } },
    { type: 'assistant', uuid: 'ca', parentUuid: 'cu', sessionId: 'claude-id', cwd: dir, timestamp: '2026-01-01T00:01:00Z', message: { role: 'assistant', content: [{ type: 'text', text: 'Completed: 1/2 endpoints' }], stop_reason: 'end_turn' } },
  ].map(JSON.stringify).join('\n'));
  const codexFile = join(dir, 'codex.jsonl');
  await writeFile(codexFile, [
    { type: 'session_meta', timestamp: '2026-01-01T00:00:00Z', payload: { session_id: 'codex-id', cwd: dir } },
    { type: 'response_item', timestamp: '2026-01-01T00:00:00Z', ordinal: 1, payload: { type: 'message', id: 'du', role: 'user', content: [{ type: 'input_text', text: 'Run tests' }] } },
    { type: 'response_item', timestamp: '2026-01-01T00:01:00Z', ordinal: 2, payload: { type: 'message', id: 'da', role: 'assistant', content: [{ type: 'output_text', text: 'Completed: 2/3 suites' }] } },
  ].map(JSON.stringify).join('\n'));
  const active = [
    startPresence(() => ({ source: 'claude', id: 'claude-id', cwd: dir, file: claudeFile, activity: 'busy' })),
    startPresence(() => ({ source: 'codex', id: 'codex-id', cwd: dir, file: codexFile, activity: 'busy' })),
  ];
  try {
    const { sessions } = await discoverAgents('', dir, 'none');
    assert.deepEqual(new Set(sessions.map(s => s.source)), new Set(['claude', 'codex']));
    for (const session of sessions) {
      const data = await readAgentSession(session, dir);
      assert.equal(data.source, session.source);
      assert.ok(data.progress?.done > 0);
      assert.ok(!JSON.stringify(data).includes('tool_input'));
    }
    const cli = fileURLToPath(new URL('../bin/agent-peek.mjs', import.meta.url));
    const output = execFileSync(process.execPath, [cli, 'peek', 'claude'], { cwd: dir, env: process.env, encoding: 'utf8' });
    assert.match(output, /Other session · claude/);
    assert.match(output, /Goal  Build API/);
  } finally { active.forEach(p => p.stop()); }
}));

test('lifecycle records busy, waiting, idle; shutdown unregisters presence', async () => fixture(async dir => {
  const h = harness(dir);
  h.callbacks.session_start({}, h.ctx);
  const state = () => [...liveSessions().values()][0]?.activity;
  assert.equal(state(), 'idle');
  h.callbacks.agent_start();
  assert.equal(state(), 'busy');
  h.callbacks.ui_prompt_start();
  assert.equal(state(), 'waiting');
  h.callbacks.ui_prompt_end();
  h.callbacks.agent_settled();
  assert.equal(state(), 'idle');
  h.callbacks.session_shutdown();
  assert.equal(liveSessions().size, 0);
}));

test('shared hooks publish Codex lifecycle state and remove it on session end', async () => fixture(async dir => {
  const transcript = join(dir, 'codex.jsonl');
  await writeFile(transcript, JSON.stringify({ type: 'session_meta', payload: { session_id: 'hook-id', cwd: dir } }));
  const hook = fileURLToPath(new URL('../hooks/hook.mjs', import.meta.url));
  const runHook = event => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [hook], { env: { ...process.env, AGENT_PEEK_HOME: dir,
      AGENT_PEEK_HOST_PID: String(process.pid), AGENT_PEEK_HEARTBEAT_MS: '25', PLUGIN_DATA: dir }, stdio: ['pipe', 'ignore', 'pipe'] });
    let error = '';
    child.stderr.on('data', chunk => { error += chunk; });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(error || `hook exited ${code}`)));
    child.stdin.end(JSON.stringify({ hook_event_name: event, session_id: 'hook-id', cwd: dir, transcript_path: transcript }));
  });
  const waitFor = async check => {
    for (let i = 0; i < 40; i++) {
      const value = check();
      if (value) return value;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    assert.fail('timed out waiting for hook state');
  };
  await runHook('SessionStart');
  await waitFor(() => [...liveSessions().values()][0]?.activity === 'idle');
  await runHook('UserPromptSubmit');
  await waitFor(() => [...liveSessions().values()][0]?.activity === 'busy');
  await runHook('SessionEnd');
  await waitFor(() => liveSessions().size === 0);
}));

test('eye indicator animates below editor and stops cleanly', async () => {
  let factory, placement, renders = 0, cleared = false;
  const ctx = { mode: 'tui', ui: { setWidget: (_key, content, options) => {
    if (content === undefined) { cleared = true; return; }
    factory = content;
    placement = options?.placement;
  } } };
  const stop = startIndicator(ctx);
  const component = factory({ requestRender: () => renders++ }, { bold: value => value });
  const first = component.render(20)[0];
  await new Promise(resolve => setTimeout(resolve, 260));
  assert.notEqual(component.render(20)[0], first);
  assert.equal(placement, 'belowEditor');
  assert.ok(renders > 0);
  stop();
  assert.equal(cleared, true);
});

test('color contrast in dark/light palettes; inaccessible/unknown pairs use bold only', () => {
  assert.equal(contrast([0, 0, 0], [255, 255, 255]), 21);
  const theme = (fg, bg) => ({
    getFgAnsi: () => `\x1b[38;2;${fg.join(';')}m`,
    getBgAnsi: () => `\x1b[48;2;${bg.join(';')}m`,
    bold: s => `<bold>${s}</bold>`, fg: (_, s) => `<fg>${s}</fg>`, bg: (_, s) => `<bg>${s}</bg>`,
  });
  for (const pair of [[[0, 0, 0], [255, 255, 255]], [[255, 255, 255], [0, 0, 0]]]) {
    assert.match(styleLine(theme(...pair), 'Goal', 'accent'), /<bg>/);
  }
  assert.equal(styleLine(theme([120, 120, 120], [125, 125, 125]), 'Goal', 'accent'), '<bold>Goal</bold>');
  const prior = process.env.NO_COLOR;
  try {
    process.env.NO_COLOR = '1';
    assert.equal(styleLine(theme([0, 0, 0], [255, 255, 255]), 'Goal', 'accent'), '<bold>Goal</bold>');
  } finally { if (prior === undefined) delete process.env.NO_COLOR; else process.env.NO_COLOR = prior; }
});
