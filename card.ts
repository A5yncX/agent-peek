import { matchesKey, truncateToWidth, visibleWidth, wrapTextWithAnsi } from '@earendil-works/pi-tui';
import { stripVTControlCharacters } from 'node:util';

// Respect terminal palette ownership: only use colors with measurable contrast.
function rgb(ansi) {
  const m = ansi.match(/(?:38|48);2;(\d+);(\d+);(\d+)m/);
  return m ? m.slice(1).map(Number) : null;
}
export function contrast(fg, bg) {
  const luminance = color => color.map(v => v / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
    .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
  const a = luminance(fg), b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
export function styleLine(theme, line, token, bold = true, background?) {
  const text = bold ? theme.bold(line) : line;
  if (process.env.NO_COLOR || process.env.TERM === 'dumb') return text;
  // Like pi-mcp-adapter panels, never paint a message background.
  // Default text inherits the terminal palette; only accents need RGB verification.
  if (background && token !== 'text') {
    for (const color of [token, 'text', 'syntaxKeyword']) {
      const fg = rgb(theme.getFgAnsi(color));
      if (fg && contrast(fg, background) >= 4.5) return theme.fg(color, text);
    }
  }
  return text;
}

const WIDGET = 'agent-peek';
const FRAMES = ['👀 ·  ', '👀 ·· ', '👀 ···', '👀  ··'];
const plain = text => stripVTControlCharacters(String(text)).replace(/[\x00-\x1f\x7f-\x9f]/g, ' ');

export function startIndicator(ctx, label = 'Agent Peek', cancel = '/peek cancel') {
  if (ctx.mode !== 'tui') {
    ctx.ui.setWidget(WIDGET, [`👀 ${label} · ${cancel}`], { placement: 'belowEditor' });
    return () => ctx.ui.setWidget(WIDGET, undefined);
  }
  let timer;
  ctx.ui.setWidget(WIDGET, (tui, theme) => {
    let frame = 0;
    if (process.env.TERM !== 'dumb') {
      timer = setInterval(() => { frame = (frame + 1) % FRAMES.length; tui.requestRender(); }, 240);
      timer.unref?.();
    }
    return {
      render(width) { return width > 1 ? [truncateToWidth(`${theme.bold(FRAMES[frame])} ${label} · ${cancel}`, width)] : []; },
      invalidate() {},
      dispose() { clearInterval(timer); },
    };
  }, { placement: 'belowEditor' });
  return () => {
    clearInterval(timer);
    ctx.ui.setWidget(WIDGET, undefined);
  };
}

// One layout for overlays and durable entries; wrapping never discards snapshot fields.
function cardBody(lines, width, theme, background?) {
  const safe = Array.isArray(lines) ? lines.slice(0, 16).map(plain) : ['Agent Peek: result unavailable'];
  const fields = safe.map(line => line.match(/^(\S.*?) {2,}(.*)$/));
  const labelWidth = Math.max(0, ...fields.map(field => field ? visibleWidth(field[1]) : 0));
  return safe.flatMap((line, index) => {
    const field = fields[index];
    const gap = field && width > labelWidth + 6 ? labelWidth + 2 : 0;
    const rows = wrapTextWithAnsi(field && gap ? field[2] : line, Math.max(2, width - gap));
    const result = rows.map((row, i) => {
      const label = gap ? (i ? ' '.repeat(gap) : field[1] + ' '.repeat(gap - visibleWidth(field[1]))) : '';
      return styleLine(theme, label, 'muted', false, background) + styleLine(theme, row, 'text', index === 2, background);
    });
    return index === 1 ? ['', ...result] : result;
  });
}

function frameCard(body, width, theme, title, footer = '', background?) {
  if (width < 6) return body.map(line => truncateToWidth(line, Math.max(0, width), ''));
  const inner = width - 4;
  const edge = text => styleLine(theme, text, 'muted', false, background);
  const row = line => edge('│ ') + line + edge(' '.repeat(Math.max(0, inner - visibleWidth(line))) + ' │');
  const heading = truncateToWidth(` ${plain(title)} `, width - 2, '');
  return [edge('╭') + styleLine(theme, heading, 'accent', true, background) + edge('─'.repeat(width - 2 - visibleWidth(heading)) + '╮'),
    ...body.map(row), ...(footer ? [row(styleLine(theme, truncateToWidth(footer, inner), 'muted', false, background))] : []),
    edge('╰' + '─'.repeat(width - 2) + '╯')];
}

export async function showResultWindow(ctx, lines, labels) {
  if (ctx.mode !== 'tui') return false;
  await ctx.ui.custom((tui, theme, _keybindings, done) => {
    let offset = 0, maximum = 0, page = 1;
    let background, disposed = false, query = 0;
    const readBackground = async () => {
      const current = ++query;
      background = undefined;
      if (process.env.NO_COLOR || process.env.TERM === 'dumb') return;
      try {
        const color = await tui.queryTerminalBackgroundColor?.({ timeoutMs: 150 });
        if (disposed || current !== query || !color) return;
        const values = [color.r, color.g, color.b];
        if (!values.every(v => Number.isInteger(v) && v >= 0 && v <= 255)) return;
        background = values;
        tui.requestRender();
      } catch { /* Unsupported terminals keep their default palette. */ }
    };
    void readBackground();
    return {
      render(width) {
        const body = cardBody(lines, Math.max(2, width - 4), theme, background);
        page = Math.max(1, Math.floor((tui.terminal?.rows ?? 24) * 0.8) - 3);
        maximum = Math.max(0, body.length - page);
        offset = Math.min(offset, maximum);
        const footer = maximum ? `↑↓ ${offset + 1}–${Math.min(offset + page, body.length)}/${body.length} · ${labels.close}` : labels.close;
        return frameCard(body.slice(offset, offset + page), width, theme, labels.title, footer, background);
      },
      invalidate() { void readBackground(); },
      dispose() { disposed = true; },
      handleInput(data) {
        if (matchesKey(data, 'enter') || matchesKey(data, 'escape') || ['q', 'Q', '\n'].includes(data)) { done(undefined); return; }
        if (matchesKey(data, 'up')) offset--;
        else if (matchesKey(data, 'down')) offset++;
        else if (matchesKey(data, 'pageUp')) offset -= page;
        else if (matchesKey(data, 'pageDown')) offset += page;
        else if (matchesKey(data, 'home')) offset = 0;
        else if (matchesKey(data, 'end')) offset = maximum;
        else return;
        offset = Math.max(0, Math.min(offset, maximum));
        tui.requestRender();
      },
    };
  }, { overlay: true, overlayOptions: { anchor: 'center', width: 80, maxHeight: '80%', margin: 1 } });
  return true;
}

export function resultComponent(lines, theme) {
  return {
    render(width) {
      const size = Math.min(width, 80);
      return frameCard(cardBody(lines, Math.max(2, size - 4), theme), size, theme, 'Agent Peek');
    },
    invalidate() {},
  };
}
