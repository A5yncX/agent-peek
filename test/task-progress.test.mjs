import { test } from 'node:test';
import assert from 'node:assert/strict';
import { snapshot, projectEntry, compactCard, validateSummary, SUMMARY_PROMPT } from '../core.ts';

const message = (id, parentId, role, content, extra = {}) => ({ type: 'message', id, parentId,
  timestamp: '2026-01-01T00:00:00Z', message: { role, content, ...extra } });
const build = records => snapshot(records.map(projectEntry));

test('continuation preserves the task goal, plan, start time and recent phase within the evidence budget', () => {
  const records = [message('goal', null, 'user', 'Build an API with authentication and deploy it'),
    message('plan', 'goal', 'assistant', 'Plan:\n1. Implement API\n2. Verify authentication\n3. Deploy')];
  for (let i = 0; i < 12; i++) records.push(message(`a${i}`, i ? `a${i - 1}` : 'plan', 'assistant', 'Implementation details '.repeat(160)));
  records.push({ ...message('continue', 'a11', 'user', '继续'), timestamp: '2026-01-01T00:10:00Z' },
    message('phase', 'continue', 'assistant', 'API implementation is complete. Checking authentication before deployment.'),
    message('tool', 'phase', 'assistant', [{ type: 'toolCall', id: 't', name: 'bash', arguments: { command: 'LOCAL_ONLY_COMMAND' } }]));
  const data = build(records);
  assert.equal(data.goal, 'Build an API with authentication and deploy it');
  assert.equal(data.taskStartedAt, records[0].timestamp);
  for (const id of ['goal', 'plan', 'continue', 'phase']) assert.ok(data.evidence.some(e => e.id === id), id);
  assert.ok(JSON.stringify(data.evidence).length <= 10000);
  assert.ok(!JSON.stringify(data.evidence).includes('LOCAL_ONLY_COMMAND'));
  assert.match(compactCard(data, undefined, 'busy')[2], /Checking authentication/);
  records.push(message('new-task', 'tool', 'user', 'Translate the release notes'));
  const nextTask = build(records);
  assert.equal(nextTask.goal, 'Translate the release notes');
  assert.deepEqual(nextTask.local.pending, []);
});

test('task milestones, next step and estimates appear before tool details without losing the AI stage', () => {
  const data = build([message('u', null, 'user', 'Build and deploy API'),
    message('p', 'u', 'assistant', 'Plan:\n1. Build\n2. Test\n3. Deploy'),
    message('a', 'p', 'assistant', 'Build complete, testing authentication before deployment'),
    message('t', 'a', 'assistant', [{ type: 'toolCall', id: 'tool', name: 'bash' }])]);
  const summary = validateSummary(JSON.stringify({
    goal: { text: 'Deliver a working API', evidenceId: 'u' },
    current: { text: 'Implementation is complete; authentication verification is the second stage, with deployment still remaining.', evidenceId: 'a' },
    done: { text: 'API implementation', evidenceId: 'a' },
    next: { text: 'Deploy after authentication checks', evidenceId: 'p' },
    progress: { percent: 60, confidence: 'medium', basis: 'Build done, verification active, deployment remains', evidenceIds: ['p', 'a'], etaMinutesLow: 10, etaMinutesHigh: 25 },
  }), data.evidence);
  const card = compactCard(data, summary, 'busy');
  assert.match(card[2], /second stage, with deployment still remaining/);
  const order = ['Goal', 'Stage', 'Done', 'Next', 'Progress', 'ETA', 'Basis', 'Tool · local'].map(label => card.findIndex(line => line.startsWith(`${label}  `)));
  assert.ok(order.every((index, i) => index >= 0 && (!i || index > order[i - 1])));
  assert.match(card[order[4]], /60% · estimated · medium confidence/);
  assert.match(card[order[5]], /~10 min–25 min/);
  assert.throws(() => validateSummary('{"next":{"text":"Deploy","evidenceId":"missing"}}', data.evidence), /evidence/);
  assert.equal(validateSummary('{}', data.evidence).next, null); // Older summary responses still work.
  assert.match(SUMMARY_PROMPT, /where it stands in its plan/);
});

test('unknown numeric progress remains explained instead of silently disappearing or being fabricated', () => {
  const data = build([message('u', null, 'user', 'Explore a new parser'), message('a', 'u', 'assistant', 'Investigating the input format')]);
  const card = compactCard(data, undefined, 'busy', 'zh');
  assert.match(card[2], /当前阶段  Investigating/);
  assert.ok(card.some(line => line === '进度  证据不足，暂不能估算整体进度'));
  assert.ok(card.some(line => line === '预计剩余  缺少可靠的耗时依据'));
  assert.ok(!card.some(line => /\d+%/.test(line)));
});
