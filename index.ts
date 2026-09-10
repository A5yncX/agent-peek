import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { randomUUID } from 'node:crypto';
import { startPresence } from './presence.ts';
import { resultComponent, startIndicator } from './card.ts';
import { discoverAgents, readAgentSession } from './adapters.ts';
import { getLanguage, getSummaryModel, setLanguage, t } from './i18n.ts';
import { projectEntry, snapshot, compactCard, clip, clean,
  SUMMARY_PROMPT, validateSummary } from './core.ts';

const HELP = '/peek [session-id | self | local | refresh | preview | language [en|zh] | clear | cancel]';

export default function (pi: ExtensionAPI) {
  pi.registerEntryRenderer('agent-peek-result', (entry, _options, theme) =>
    resultComponent(entry.data?.lines, theme));

  let selected: string | undefined;
  let inFlight: AbortController | undefined;
  let generation = 0;
  let presence: ReturnType<typeof startPresence> | undefined;
  let activity = 'idle';
  let waiting = 0;
  let language = getLanguage();

  pi.on('session_start', (_event, ctx) => {
    presence?.stop();
    activity = ctx.isIdle() ? 'idle' : 'busy';
    waiting = 0;
    try {
      presence = startPresence(() => ({
        source: 'pi', id: ctx.sessionManager.getSessionId(), cwd: ctx.cwd,
        file: ctx.sessionManager.getSessionFile() ?? '',
        activity: waiting ? 'waiting' : activity,
      }));
    } catch { ctx.ui.notify(t(language, 'registryError'), 'warning'); }
  });
  const update = () => { try { presence?.update(); } catch {} };
  pi.on('agent_start', () => { activity = 'busy'; update(); });
  pi.on('agent_settled', () => { activity = 'idle'; update(); });
  pi.on('ui_prompt_start', () => { waiting++; update(); });
  pi.on('ui_prompt_end', () => { waiting = Math.max(0, waiting - 1); update(); });

  pi.on('session_shutdown', () => {
    presence?.stop();
    presence = undefined;
    generation++;
    inFlight?.abort();
    inFlight = undefined;
    selected = undefined;
  });

  pi.registerCommand('peek', {
    description: 'Inspect the current working session or another working session in this directory',
    handler: async (args, ctx) => {
      const arg = args.trim();
      if (!ctx.hasUI) return; // No stdout writes that could corrupt JSON/print protocols.
      if (arg === 'cancel') { inFlight?.abort(); return; }
      if (arg === 'clear') {
        generation++;
        inFlight?.abort();
        ctx.ui.setWidget('agent-peek', undefined);
        ctx.ui.setStatus('agent-peek', undefined);
        return;
      }
      if (arg === 'help') { ctx.ui.notify(HELP, 'info'); return; }
      if (arg === 'language' || arg.startsWith('language ')) {
        const requested = arg.split(/\s+/)[1];
        const next = requested || await ctx.ui.select(t(language, 'languageTitle'), ['English', '中文']);
        if (!next) return;
        const code = next === '中文' || next === 'zh' ? 'zh' : next === 'English' || next === 'en' ? 'en' : '';
        if (!code) { ctx.ui.notify(t(language, 'invalidLanguage'), 'warning'); return; }
        try { language = setLanguage(code); }
        catch { ctx.ui.notify(t(language, 'registryError'), 'warning'); return; }
        ctx.ui.notify(t(language, 'languageChanged'), 'info');
        return;
      }
      if (inFlight) { ctx.ui.notify(t(language, 'alreadyRunning'), 'warning'); return; }
      const controller = new AbortController();
      inFlight = controller;
      const epoch = generation;
      const alive = () => !controller.signal.aborted && epoch === generation;
      const stopIndicator = startIndicator(ctx);
      let timer: ReturnType<typeof setTimeout> | undefined;
      let timedOut = false;
      let publishLocal: (() => void) | undefined;
      try {
        const selfId = ctx.sessionManager.getSessionId();
        const selfState = waiting ? 'waiting' : activity === 'busy' || !ctx.isIdle() ? 'busy' : 'idle';
        const automatic = !arg || arg === 'local';
        let target = arg === 'self' || (automatic && selfState === 'busy') ? 'self' : undefined;
        const { sessions } = target === 'self' ? { sessions: [] }
          : await discoverAgents(ctx.sessionManager.getSessionDir(), ctx.cwd, selfId);
        if (!alive()) return;
        if (['refresh', 'preview'].includes(arg)) target = selected;
        if (arg && !['self', 'local', 'refresh', 'preview'].includes(arg)) {
          const matches = sessions.filter(s => s.id.startsWith(arg));
          if (matches.length !== 1) throw new Error(`${t(language, 'idMatch')} ${HELP}`);
          target = matches[0].id;
        }
        if (!target) {
          if (['refresh', 'preview'].includes(arg)) throw new Error(t(language, 'selectedMissing'));
          const working = sessions.filter(s => s.activity === 'busy');
          if (!working.length) {
            selected = undefined;
            ctx.ui.setWidget('agent-peek', undefined);
            ctx.ui.notify(t(language, 'noWorking'), 'info');
            return;
          }
          if (working.length === 1) target = working[0].id;
          else {
            const labels = working.map(s => `● ${t(language, 'busy')} · ${s.source} · ${s.id.slice(-8)}`);
            const choice = await ctx.ui.select(t(language, 'chooseSession'), labels);
            if (!choice || !alive()) return;
            target = working[labels.indexOf(choice)].id;
          }
        }
        selected = target;
        const session = sessions.find(s => s.id === target);
        const data = target === 'self'
          ? snapshot(ctx.sessionManager.getBranch().map(projectEntry).filter(Boolean), { id: selfId })
          : session ? await readAgentSession(session, ctx.cwd) : null;
        if (!data) {
          ctx.ui.setWidget('agent-peek', undefined);
          selected = undefined;
          throw new Error(t(language, 'offline'));
        }
        if (!alive()) return;
        const runtimeState = target === 'self' ? selfState : session?.activity;
        const publish = (summary?) => {
          if (!alive()) return;
          const lines = compactCard(data, summary, runtimeState, language);
          lines[0] = `${target === 'self' ? t(language, 'currentSession') : t(language, 'otherSession')} · ${data.source} · ${lines[0]}`;
          stopIndicator();
          pi.appendEntry('agent-peek-result', { lines, timestamp: Date.now() });
          publishLocal = undefined;
        };
        publishLocal = () => publish();
        const payload = JSON.stringify({ interfaceLanguage: language === 'zh' ? 'Chinese' : 'English', runtimeState, status: data.status, limitations: data.limitations,
          warning: data.warning, evidence: data.evidence }, null, 2);
        if (arg === 'preview') {
          await ctx.ui.editor(t(language, 'previewTitle'), payload);
          publish();
          return;
        }
        if (arg === 'local') { publish(); return; }
        const configuredModel = getSummaryModel();
        const separator = configuredModel?.indexOf('/') ?? -1;
        const model = configuredModel
          ? ctx.modelRegistry.find?.(configuredModel.slice(0, separator), configuredModel.slice(separator + 1))
          : ctx.model;
        if (!model || typeof ctx.modelRegistry.complete !== 'function') {
          publish();
          ctx.ui.notify(t(language, configuredModel ? 'configuredModelMissing' : 'noModel', configuredModel), 'warning');
          return;
        }
        const consent = await ctx.ui.confirm(t(language, 'consentTitle'), t(language, 'consentBody', `${model.provider}/${model.id}`));
        if (!consent || !alive()) { if (alive()) publish(); return; }
        timer = setTimeout(() => { timedOut = true; controller.abort(); }, 60000);
        const response = await ctx.modelRegistry.complete(model, {
          systemPrompt: SUMMARY_PROMPT,
          messages: [{ role: 'user', content: [{ type: 'text', text: payload }], timestamp: Date.now() }],
        }, { signal: controller.signal, maxTokens: 1200, cacheRetention: 'none', sessionId: randomUUID() });
        if (!alive()) return;
        if (response.stopReason !== 'stop') throw new Error(t(language, 'summaryFailed'));
        const text = response.content.filter(c => c.type === 'text').map(c => c.text).join('\n');
        const summary = validateSummary(text, data.evidence);
        publish(summary);
      } catch (error) {
        if (epoch === generation) {
          const hadLocalFallback = !!publishLocal;
          if (!controller.signal.aborted || timedOut) publishLocal?.();
          ctx.ui.notify(controller.signal.aborted
            ? t(language, timedOut ? 'timeout' : 'cancelled')
            : hadLocalFallback ? t(language, 'summaryFailed')
            : clip(error instanceof Error ? error.message : clean(error), 300), 'warning');
        }
      } finally {
        stopIndicator();
        if (timer) clearTimeout(timer);
        if (inFlight === controller) inFlight = undefined;
        if (epoch === generation) ctx.ui.setStatus('agent-peek', undefined);
      }
    },
  });
}
