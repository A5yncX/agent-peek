import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripVTControlCharacters } from 'node:util';
import { visibleWidth } from '@earendil-works/pi-tui';
import { resultComponent, showResultWindow, styleLine } from '../card.ts';

const theme = {
  bold: s => `\x1b[1m${s}\x1b[22m`,
  getBgAnsi: () => '', getFgAnsi: () => '',
};
const lines = ['● Working · codex · 10:20 snapshot',
  'Goal  Compare extraction models 中文 👩‍💻 e\u0301',
  'Current  Testing the third model with a longer description',
  'Done  Two completed', 'Progress  ██████░░░░ 60% · estimated · medium confidence',
  'ETA  ~15 min–35 min', 'Blocker  Not confirmed', 'Basis  Two of four recorded; third stage active'];

test('card wraps mixed-width text, aligns borders and preserves content without terminal injection', () => {
  const component = resultComponent(lines, theme);
  for (const width of [0, 1, 4, 6, 12, 32, 48, 80, 120]) {
    const rendered = component.render(width);
    assert.ok(rendered.every(line => visibleWidth(line) <= width), `overflow at ${width}`);
    if (width >= 6) assert.ok(rendered.every(line => visibleWidth(line) === Math.min(width, 80)), `border at ${width}`);
  }
  const text = component.render(48).map(stripVTControlCharacters).join('\n');
  assert.match(text, /👩‍💻/);
  assert.match(text, /e\u0301/);
  assert.match(text.replace(/[│\s]+/g, ' '), /third stage active/);
  const injected = resultComponent(['Goal  \x1b[31mred\x1b[0m\nunsafe\x07'], theme).render(40).join('');
  assert.ok(!injected.includes('\x1b[31m'));
  assert.ok(!injected.includes('\x07'));
  assert.ok(!injected.includes('\n'));
});

test('short overlays keep footer visible, scroll to final field, and clamp after resizing', async () => {
  let component, closed = 0, renders = 0;
  const tui = { terminal: { rows: 12 }, requestRender: () => renders++ };
  const ctx = { mode: 'tui', ui: { custom: async factory => {
    component = factory(tui, theme, {}, () => closed++);
    let screen = component.render(40).map(stripVTControlCharacters);
    assert.ok(screen.length <= Math.floor(12 * 0.8));
    assert.match(screen.at(-2), /close/);
    assert.match(screen.at(-2), /↑↓/);
    component.handleInput('\x1b[F'); // End
    screen = component.render(40).map(stripVTControlCharacters);
    assert.match(screen.join('\n'), /third stage active/);
    tui.terminal.rows = 60;
    screen = component.render(80).map(stripVTControlCharacters);
    assert.match(screen[1], /Working/);
    component.handleInput('q');
  } } };
  await showResultWindow(ctx, lines, { title: 'Agent Peek', close: 'Enter / Esc / q: close' });
  assert.equal(closed, 1);
  assert.equal(renders, 1);
  assert.equal(await showResultWindow({ mode: 'rpc' }, lines, {}), false);
});

test('panels inherit terminal background and validate accents against OSC 11, not message colors', async () => {
  const colored = {
    bold: theme.bold,
    getBgAnsi: () => { throw new Error('Message background must not be read'); },
    bg: () => { throw new Error('Background must not be painted'); },
    getFgAnsi: () => '\x1b[38;2;255;255;255m',
    fg: (_, text) => `\x1b[38;2;255;255;255m${text}\x1b[39m`,
  };
  for (const color of [{ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }, undefined, { r: -1, g: 0, b: 0 }, 'error']) {
    const ctx = { mode: 'tui', ui: { custom: async factory => {
      let resolve, renders = 0;
      const tui = {
        requestRender: () => renders++,
        queryTerminalBackgroundColor: ({ timeoutMs }) => {
          assert.equal(timeoutMs, 150);
          if (color === 'error') return Promise.reject(new Error('unsupported'));
          return new Promise(done => { resolve = done; });
        },
      };
      const component = factory(tui, colored, {}, () => {});
      const screen = () => component.render(80).join('\n');
      assert.ok(!screen().includes('38;2;'));
      resolve?.(color);
      await Promise.resolve();
      assert.equal(screen().includes('38;2;'), color?.r === 0);
      assert.ok(!/\x1b\[(?:4[0-8]|10[0-7])(?:;|m)/.test(screen()));
      component.invalidate();
      assert.ok(!screen().includes('38;2;'), 'stale background cleared after theme changes');
      component.dispose();
      const before = renders;
      resolve?.({ r: 0, g: 0, b: 0 });
      await Promise.resolve();
      assert.equal(renders, before, 'closed panel must not rerender');
    } } };
    await showResultWindow(ctx, lines, { title: 'Agent Peek', close: 'Esc: close' });
  }
  assert.ok(!resultComponent(lines, colored).render(80).join('\n').includes('38;2;'));
});

test('body stays regular weight and unknown terminal palettes add no colors', () => {
  assert.equal(styleLine(theme, 'Body', 'text', false), 'Body');
  const rendered = resultComponent(lines, theme).render(80);
  assert.ok(rendered.some(line => line.includes('\x1b[1mTesting')));
  assert.ok(!rendered.some(line => line.includes('\x1b[1mNot confirmed')));
});
