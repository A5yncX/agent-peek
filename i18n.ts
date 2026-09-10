import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

export const LANGUAGES = ['en', 'zh'];
export function agentPeekHome() {
  return process.env.AGENT_PEEK_HOME || join(homedir(), '.agent-peek');
}
export function getConfig() {
  try {
    const value = JSON.parse(readFileSync(join(agentPeekHome(), 'config.json'), 'utf8'));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}
function writeConfig(config) {
  const file = join(agentPeekHome(), 'config.json');
  const temp = `${file}.${process.pid}.tmp`;
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  writeFileSync(temp, JSON.stringify(config, null, 2), { mode: 0o600 });
  renameSync(temp, file);
}
export function getLanguage() {
  const value = getConfig().language;
  return LANGUAGES.includes(value) ? value : 'en';
}
export function getSummaryModel() {
  const value = getConfig().model;
  return typeof value === 'string' && /^[^/\s]+\/[^\s]+$/.test(value) ? value : null;
}
export function getPeekOptions() {
  const config = getConfig();
  return {
    confirmBeforeSummary: config.confirmBeforeSummary !== false,
    resultDisplay: config.resultDisplay === 'conversation' ? 'conversation' : 'window',
  };
}
export function setPeekOptions(options) {
  const next = { ...getConfig(), ...getPeekOptions(), ...options };
  if (typeof next.confirmBeforeSummary !== 'boolean' || !['window', 'conversation'].includes(next.resultDisplay)) {
    throw new Error('Invalid Agent Peek options.');
  }
  writeConfig(next);
  return getPeekOptions();
}
export function setLanguage(language) {
  if (!LANGUAGES.includes(language)) throw new Error('Language must be en or zh.');
  writeConfig({ ...getConfig(), language });
  return language;
}

const MESSAGES = {
  en: {
    busy: 'Working', idle: 'Waiting for input', waiting: 'Waiting for confirmation', unknown: 'Status unknown',
    currentSession: 'Current session', otherSession: 'Other session', snapshot: 'snapshot',
    goal: 'Goal', current: 'Current', progress: 'Progress', blocker: 'Blocker',
    processing: 'Processing the task', progressUnknown: 'Unknown', blockerUnknown: 'Not confirmed', recorded: 'recorded',
    noWorking: 'No working task found (only instrumented sessions are checked).',
    chooseSession: 'Choose a working session', languageTitle: 'Agent Peek language', languageChanged: 'Agent Peek language: English',
    noModel: 'No summary model is available; showing the local snapshot.',
    configuredModelMissing: model => `Configured summary model ${model} is unavailable; showing the local snapshot.`,
    consentTitle: 'Create a short progress summary?', consentBody: model => `Send filtered session text to ${model}; charges may apply and sensitive text may remain. Cancel for a local snapshot.`,
    cancelled: 'Peek cancelled.', timeout: 'Summary timed out; showing the local snapshot.', offline: 'The session went offline. Run /peek again.',
    selectedMissing: 'No session selected. Run /peek first.', alreadyRunning: 'A peek is already running. Use /peek cancel.', invalidLanguage: 'Language must be en or zh.',
    idMatch: 'Session ID must match exactly one working session.', previewTitle: 'Filtered model input; edits are not sent',
    summaryFailed: 'AI summary failed; showing the local snapshot.',
    summaryFailedDetail: detail => `AI summary failed; showing the local snapshot. ${detail}`,
    optionsTitle: 'Agent Peek options', confirmationOption: value => `Summary confirmation: ${value ? 'On' : 'Off'}`,
    displayOption: value => `Result display: ${value === 'window' ? 'Window' : 'Conversation'}`,
    closeOptions: 'Close',
    disableConfirmTitle: 'Disable summary confirmation?',
    disableConfirmBody: 'Future /peek commands will send filtered text to the configured model without asking each time. Charges may apply.',
    optionsSaved: 'Agent Peek options saved.', invalidOption: 'Usage: /peek options [confirm on|off | display window|conversation]',
    closeWindow: 'Enter / Esc / q: close', resultTitle: 'Agent Peek',
    registryError: 'Could not register online status. Check permissions for ~/.agent-peek.',
  },
  zh: {
    busy: '运行中', idle: '等待输入', waiting: '等待确认', unknown: '状态待确认',
    currentSession: '当前会话', otherSession: '其他会话', snapshot: '快照',
    goal: '目标', current: '当前', progress: '进度', blocker: '阻塞',
    processing: '正在处理任务', progressUnknown: '未知', blockerUnknown: '暂未确认', recorded: '已记录',
    noWorking: '当前没有运行中的任务（仅检查已加载适配器的会话）。',
    chooseSession: '选择正在运行的会话', languageTitle: 'Agent Peek 语言', languageChanged: 'Agent Peek 语言：中文',
    noModel: '没有可用的摘要模型，已输出本地概况。',
    configuredModelMissing: model => `配置的摘要模型 ${model} 不可用，已输出本地概况。`,
    consentTitle: '生成简短进度摘要？', consentBody: model => `将过滤后的会话文本发送给 ${model}，可能计费且仍可能含敏感信息；取消则输出本地概况。`,
    cancelled: '已取消查看。', timeout: '摘要超时，已输出本地概况。', offline: '该会话已离线。输入 /peek 重新选择。',
    selectedMissing: '尚未选择会话，请先执行 /peek。', alreadyRunning: '已有查询正在运行，请用 /peek cancel 取消。', invalidLanguage: '语言只能是 en 或 zh。',
    idMatch: '会话 ID 必须唯一匹配一个运行中的会话。', previewTitle: '过滤后的模型输入；编辑内容不会发送',
    summaryFailed: 'AI 摘要失败，已输出本地概况。',
    summaryFailedDetail: detail => `AI 摘要失败，已输出本地概况。${detail}`,
    optionsTitle: 'Agent Peek 选项', confirmationOption: value => `摘要前确认：${value ? '开启' : '关闭'}`,
    displayOption: value => `结果展示：${value === 'window' ? '窗口' : '发送到对话'}`,
    closeOptions: '关闭',
    disableConfirmTitle: '关闭摘要确认？',
    disableConfirmBody: '今后的 /peek 会直接把过滤文本发送到配置模型，不再逐次询问，可能产生费用。',
    optionsSaved: 'Agent Peek 选项已保存。', invalidOption: '用法：/peek options [confirm on|off | display window|conversation]',
    closeWindow: 'Enter / Esc / q：关闭', resultTitle: 'Agent Peek',
    registryError: '无法登记在线状态，请检查 ~/.agent-peek 权限。',
  },
};
export function t(language, key, ...args) {
  const value = (MESSAGES[language] ?? MESSAGES.en)[key] ?? MESSAGES.en[key] ?? key;
  return typeof value === 'function' ? value(...args) : value;
}
