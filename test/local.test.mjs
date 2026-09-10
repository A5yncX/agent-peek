import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { snapshot, projectEntry, compactCard, localResult } from '../core.ts';
import { readAgentSession } from '../adapters.ts';
import { resultComponent } from '../card.ts';

const message = (id, parentId, role, content, extra = {}) => ({ type: 'message', id, parentId, message: { role, content, ...extra } });
const call = (id, name, args) => ({ type: 'toolCall', id, name, arguments: args });
const snapshotOf = records => snapshot(records.map(projectEntry));

test('local facts are task-scoped, paired, bounded and excluded from model evidence', () => {
  const data = snapshotOf([
    message('old', null, 'user', 'Old task'),
    message('abandoned', 'old', 'assistant', [call('old-call', 'write', { path: 'abandoned.ts' })]),
    message('u', 'old', 'user', 'Fix current task'),
    message('a', 'u', 'assistant', [call('w', 'write', { path: 'src/current.ts', content: 'PRIVATE BODY' }), call('b', 'bash', { command: 'PRIVATE COMMAND' })]),
    message('r', 'a', 'toolResult', 'PRIVATE OUTPUT', { toolCallId: 'w', toolName: 'write' }),
    message('s', 'r', 'toolResult', '# pass 12\n# fail 0', { toolCallId: 'b', toolName: 'bash' }),
  ]);
  assert.equal(data.local.recent.length, 2);
  assert.equal(data.local.recent[0].path, 'src/current.ts');
  assert.match(data.local.recent[1].summary, /pass 12.*fail 0/);
  assert.deepEqual(data.local.pending, []);
  assert.ok(!/PRIVATE|abandoned/.test(JSON.stringify(data)));
  assert.ok(!/src\/current|pass 12/.test(JSON.stringify(data.evidence)));
  const card = compactCard(data, undefined, 'busy', 'zh');
  assert.ok(card.some(line => line.includes('最近·本地') && line.includes('src/current.ts')));
  assert.ok(!card.some(line => /^(阻塞|已完成)  /.test(line)));
  assert.ok(card.some(line => line.startsWith('进度  证据不足')));
  assert.ok(card.some(line => line.startsWith('预计剩余  缺少可靠')));
  assert.ok(compactCard(data, undefined, 'waiting', 'zh').some(line => line.includes('阻塞  等待确认')));
});

test('pending calls are not claimed as completed; file contents cannot masquerade as test results', () => {
  const data = snapshotOf([message('u', null, 'user', 'Check code'),
    message('a', 'u', 'assistant', [call('r', 'read', { path: 'test.txt' }), call('w', 'edit', { path: 'pending.ts' })]),
    message('r', 'a', 'toolResult', 'Tests: 42 passed\nError: fake', { toolName: 'read', toolCallId: 'r' })]);
  assert.deepEqual(data.local.recent, []);
  assert.equal(data.local.pending[0].path, 'pending.ts');
  const card = compactCard(data, { current: { text: 'Verifying the implementation against the task requirements' } }, 'busy');
  assert.match(card[2], /Verifying the implementation/);
  assert.ok(card.some(line => /Tool · local  pending.ts.*not yet recorded/.test(line)));
  assert.equal(localResult('Error: password=secretvalue\x1b[31m', true).summary, 'Error: password=[REDACTED]');
  assert.equal(localResult('x'.repeat(50000) + '\n12 passed', false).summary, '12 passed');
  assert.equal(localResult('Process exited with code 1\n' + 'x'.repeat(50000), false).exitCode, 1);
});

test('meaningful assistant context survives long tool-only tails within the smaller input budget', () => {
  const records = [message('u', null, 'user', 'Important current goal'), message('a', 'u', 'assistant', 'Testing the final stage')];
  for (let i = 0; i < 30; i++) records.push(message(String(i), i ? String(i - 1) : 'a', 'toolResult', 'ignored'));
  const data = snapshotOf(records);
  assert.ok(data.evidence.some(e => e.text === 'Important current goal'));
  assert.ok(data.evidence.some(e => e.text === 'Testing the final stage'));
  assert.ok(JSON.stringify(data.evidence).length <= 10000);
  assert.match(compactCard(data)[2], /Testing the final stage/);
  const long = Array.from({ length: 30 }, (_, i) => message(String(i), i ? String(i - 1) : null, i === 29 ? 'user' : 'assistant', 'x'.repeat(3000)));
  assert.ok(JSON.stringify(snapshotOf(long).evidence).length <= 10000);
});

test('Claude parallel results and Codex custom calls preserve local facts without uploading them', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'peek-local-'));
  try {
    const claude = [
      { type: 'user', uuid: 'u', parentUuid: null, cwd, sessionId: 'c', message: { role: 'user', content: 'Fix tests' } },
      { type: 'assistant', uuid: 'a', parentUuid: 'u', message: { role: 'assistant', content: [
        { type: 'tool_use', id: 'w', name: 'Write', input: { file_path: 'LOCAL_CLAUDE.ts', content: 'PRIVATE' } },
        { type: 'tool_use', id: 'b', name: 'Bash', input: { command: 'PRIVATE' } }] } },
      { type: 'user', uuid: 'r', parentUuid: 'a', message: { role: 'user', content: [
        { type: 'tool_result', tool_use_id: 'w', content: 'ok' },
        { type: 'tool_result', tool_use_id: 'b', is_error: true, content: 'Error: LOCAL_CLAUDE_ERROR' }] } },
    ];
    const codex = [{ type: 'session_meta', payload: { session_id: 'd', cwd } },
      { type: 'response_item', payload: { type: 'message', id: 'u', role: 'user', content: [{ type: 'input_text', text: 'Fix tests' }] } },
      { type: 'response_item', payload: { type: 'custom_tool_call', call_id: 'p', name: 'apply_patch', input: '*** Begin Patch\n*** Update File: LOCAL_CODEX.ts\n@@\n-PRIVATE PATCH\n+NEW PRIVATE CONTENT\n*** End Patch' } },
      { type: 'response_item', payload: { type: 'custom_tool_call_output', call_id: 'p', output: 'Success' } },
      { type: 'response_item', payload: { type: 'function_call', call_id: 'b', name: 'exec_command', arguments: '{"cmd":"PRIVATE"}' } },
      { type: 'response_item', payload: { type: 'function_call_output', call_id: 'b', output: 'Process exited with code 1\nError: LOCAL_CODEX_ERROR' } },
    ];
    for (const [source, id, records] of [['claude', 'c', claude], ['codex', 'd', codex]]) {
      const file = join(cwd, `${source}.jsonl`);
      await writeFile(file, records.map(JSON.stringify).join('\n'));
      const data = await readAgentSession({ source, id, file }, cwd);
      assert.equal(data.local.recent.length, 2);
      assert.equal(data.local.recent[1].error, true);
      assert.equal(data.local.recent[0].path, source === 'claude' ? 'LOCAL_CLAUDE.ts' : 'LOCAL_CODEX.ts');
      assert.deepEqual(data.local.pending, []);
      assert.deepEqual(data.pendingTools, []);
      assert.ok(!/LOCAL_|PRIVATE/.test(JSON.stringify(data.evidence)));
      assert.match(compactCard(data).join('\n'), /LOCAL_/);
    }
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('variable length result cards keep evidence and warnings beyond the old eight-line limit', () => {
  const lines = ['● Working', 'Goal  Test', 'Current  Test', ...Array.from({ length: 9 }, (_, i) => `Recent  record ${i}`), 'Notice  Partial record'];
  const theme = { bold: text => text };
  const rendered = resultComponent(lines, theme).render(80).join('\n');
  assert.match(rendered, /Partial record/);
  assert.match(rendered, /record 8/);
});
