import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const json = async path => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));

test('Pi, Claude Code, Codex and marketplace manifests stay version-aligned', async () => {
  const [pkg, codex, claude, marketplace, hooks] = await Promise.all([
    json('../package.json'), json('../.codex-plugin/plugin.json'), json('../.claude-plugin/plugin.json'),
    json('../.claude-plugin/marketplace.json'), json('../hooks/hooks.json'),
  ]);
  assert.equal(codex.hooks, './hooks/hooks.json');
  assert.equal(codex.skills, './codex-skills');
  assert.equal(pkg.version, codex.version);
  assert.equal(pkg.version, claude.version);
  assert.equal(pkg.version, marketplace.version);
  assert.equal(marketplace.plugins[0].source, './');
  for (const event of ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PermissionRequest', 'Stop', 'SessionEnd']) {
    assert.ok(hooks.hooks[event]?.length, event);
  }
});

test('native entry docs use bounded shared CLI arguments', async () => {
  const command = await readFile(new URL('../commands/peek.md', import.meta.url), 'utf8');
  const skill = await readFile(new URL('../codex-skills/peek/SKILL.md', import.meta.url), 'utf8');
  assert.match(command, /CLAUDE_PLUGIN_ROOT/);
  assert.match(command, /CLAUDE_SESSION_ID/);
  assert.match(skill, /CODEX_SESSION_ID/);
  assert.match(skill, /\$agent-peek:peek/);
  assert.match(command, /letters, numbers, or hyphens/);
  assert.match(skill, /letters, numbers, or hyphens/);
});
