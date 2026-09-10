// Respect terminal palette ownership: when RGB contrast cannot be measured, use bold only.
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
export function styleLine(theme, line, token) {
  if (process.env.NO_COLOR || process.env.TERM === 'dumb') return theme.bold(line);
  const bg = rgb(theme.getBgAnsi('customMessageBg'));
  if (bg) {
    for (const color of [token, 'syntaxKeyword', 'text']) {
      const fg = rgb(theme.getFgAnsi(color));
      if (fg && contrast(fg, bg) >= 4.5) return theme.bg('customMessageBg', theme.fg(color, theme.bold(line)));
    }
  }
  return theme.bold(line);
}

const WIDGET = 'agent-peek';
const FRAMES = ['👀', '👀 ·', '👀 ··', '👀 ···'];

export function startIndicator(ctx) {
  if (ctx.mode !== 'tui') {
    ctx.ui.setWidget(WIDGET, ['👀'], { placement: 'belowEditor' });
    return () => ctx.ui.setWidget(WIDGET, undefined);
  }
  let timer;
  ctx.ui.setWidget(WIDGET, (tui, theme) => {
    let frame = 0;
    timer = setInterval(() => { frame = (frame + 1) % FRAMES.length; tui.requestRender(); }, 240);
    timer.unref?.();
    return {
      render(width) { return width > 1 ? [theme.bold(FRAMES[frame])] : []; },
      invalidate() {},
      dispose() { clearInterval(timer); },
    };
  }, { placement: 'belowEditor' });
  return () => {
    clearInterval(timer);
    ctx.ui.setWidget(WIDGET, undefined);
  };
}

function fit(text, width) {
  let result = '', used = 0;
  for (const char of String(text).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')) {
    const size = (char.codePointAt(0) ?? 0) > 0xff ? 2 : 1;
    if (used + size > width) break;
    result += char;
    used += size;
  }
  return result;
}

export async function showResultWindow(ctx, lines, labels) {
  if (ctx.mode !== 'tui') return false;
  await ctx.ui.custom((_tui, theme, _keybindings, done) => ({
    render(width) {
      return [labels.title, ...lines, labels.close].map((line, index) => styleLine(theme,
        fit(line, Math.max(1, width)), ['accent', 'accent', 'accent', 'success', 'accent', 'warning', 'text'][index] ?? 'text'));
    },
    invalidate() {},
    handleInput(data) {
      if (['\r', '\n', '\x1b', 'q', 'Q'].includes(data)) done(undefined);
    },
  }), { overlay: true, overlayOptions: { anchor: 'center', width: 72, minWidth: 32, maxHeight: 12, margin: 1 } });
  return true;
}

export function resultComponent(lines, theme) {
  const safe = Array.isArray(lines) ? lines.slice(0, 5) : ['Agent Peek：结果不可用'];
  return {
    render(width) {
      return safe.map((line, i) => styleLine(theme, fit(line, Math.max(1, width)),
        ['accent', 'accent', 'success', 'accent', 'warning'][i] ?? 'text'));
    },
    invalidate() {},
  };
}
