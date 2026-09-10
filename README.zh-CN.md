# Agent Peek

**查看同一工作目录中正在运行的 Pi、Claude Code 和 Codex CLI 会话概况。**

[English (default)](README.md) · [兼容性调研](docs/compatibility.md)

[![CI](https://github.com/A5yncX/agent-peek/actions/workflows/test.yml/badge.svg)](https://github.com/A5yncX/agent-peek/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js 22+](https://img.shields.io/badge/Node.js-22%2B-339933.svg)](https://nodejs.org/)

## 原生入口

| 工具 | 安装 | 使用 |
| --- | --- | --- |
| Pi | `pi install npm:@a5yncx/agent-peek`，每个 Pi 窗口执行 `/reload` | `/peek` |
| Claude Code | `/plugin marketplace add A5yncX/agent-peek`，再执行 `/plugin install agent-peek@agent-peek-local` | `/agent-peek:peek` |
| Codex CLI 0.153+ | `codex plugin marketplace add A5yncX/agent-peek`，再执行 `codex plugin add agent-peek@agent-peek-local` | `$agent-peek:peek` |
| 普通终端 | `npm install -g @a5yncx/agent-peek` | `agent-peek` |

npm 正式发布前，可以直接从 GitHub 安装：`pi install git:github.com/A5yncX/agent-peek`。

Claude Code/Codex 安装后需要重启，让生命周期 Hook 开始登记状态。宿主可能要求信任本地 Hook；插件拥有当前用户权限，请先检查源码。

Claude 插件命令带命名空间；Codex 的插件提供 Agent Skill，不能注册任意裸斜杠命令。因此它们最接近的原生入口分别是 `/agent-peek:peek` 和 `$agent-peek:peek`，不是裸 `/peek`。只有 Pi 能在当前 Agent 运行时异步执行 `/peek`；详见[宿主限制](docs/compatibility.md#host-limitations)。

## 双语

默认英文，选择写入 `~/.agent-peek/config.json`，三个工具共享：

- Pi：`/peek language` 弹出选择；也支持 `/peek language en|zh`
- Claude Code：`/agent-peek:peek language [en|zh]`
- Codex：`$agent-peek:peek language [en|zh]`
- 终端：`agent-peek language [en|zh]`；不带语言时切换

## 摘要模型

Pi 的可选 AI 摘要可以使用独立模型，不会切换当前会话模型。编辑 `~/.agent-peek/config.json`：

```json
{
  "language": "zh",
  "model": "my-provider/fast-model"
}
```

格式为 `provider/model-id`。修改后下一次 `/peek` 立即生效，无需 `/reload`；删除 `model` 字段则跟随 Pi 当前模型。模型不存在或不可用时，插件输出本地概况，不静默改用其他模型。Claude Code、Codex 和终端入口使用本地确定性提取，不调用此模型。

## 自动选择

1. Pi 当前会话 working 时优先查看自己。
2. 否则，同目录只有一个 working 会话就直接查看。
3. 多个 working 会话：Pi 弹出选择；其他入口列出 ID，再用前缀执行一次。
4. 自动选择排除等待输入、等待确认、过期、死进程和历史会话。

各工具通过 Hook 在 `~/.agent-peek/` 写小型心跳，只含来源、会话 ID、cwd、会话文件路径、PID 和状态，**不含对话正文**。Prompt/工具事件标记 working，权限请求标记 waiting，Stop 标记 idle，SessionEnd 标记结束。宿主 PID 存活时，每 5 秒更新；超过 20 秒的记录不使用。

## 输出

```text
Other session · codex · ● Working · 10:20:30 snapshot
Goal  Compare four extraction models
Current  Testing the third model
Progress  [#####-----] 2/4 (50%) model combinations (recorded)
Blocker  Not confirmed
```

切换中文后标签和摘要改为中文。只有明确的完成数/总数或当前消息中的 Markdown 任务清单才显示百分比；普通分数、F1、token 和模型猜测都不算。计数是会话中的记录，不代表独立验证；不推断 ETA。

Pi 查询期间在输入框下方动态显示 `👀`，结束后消失，五行结果写入对话区但不进入模型上下文。Claude/Codex 使用各自命令或 Skill 的工作提示，并返回共享 CLI 的本地结果。

Pi 还支持：`/peek self|local|refresh|preview|cancel|clear|<id前缀>`。

## 隐私与限制

- 目标会话只读；不会恢复、修复、迁移、控制目标 Agent，也不会给它发送消息。
- 运行状态和偏好只保存在仓库外的 `~/.agent-peek/`。发布包不包含会话文件、本机配置、凭据或生成的摘要。
- Pi 可选 AI 摘要每次先确认，并删除 reasoning、图片、工具参数和工具结果正文；普通文本仍可能含秘密。Claude/Codex/终端使用确定性的本地提取，不额外调用模型上传会话。
- 读取前核对 cwd 和会话 ID；限制 64 MiB/文件、8 MiB/行、100,000 条规范记录。支持 Pi v2/v3、Claude Code JSONL 和 Codex rollout JSONL。
- 外部格式可能随版本变化；未知记录跳过，损坏分支会禁用百分比。PID 存活只证明宿主进程存在，不证明任务未卡住。
- Pi TUI 仅使用通过 4.5:1 RGB 对比度检查的主题色，否则退回加粗；状态不只靠颜色表达。

安全问题请按 [`SECURITY.md`](SECURITY.md) 报告；不要在公开 Issue 附加真实会话或凭据。

## 调研依据

采用同类项目常见的“共享核心 + 薄适配器”：Agent Deck、CCManager、Claude Squad、Vibe Kanban 和 AI Session Manager。评估了开放的 [Agent Plugins 1.0](https://github.com/agentplugins/agent-plugins-spec)，但 Codex 0.153 不为该格式加载普通生命周期 Hook，因此 v0.4 使用 Claude/Codex 各自的薄清单以保留 working 检测。来源与取舍见 [`docs/compatibility.md`](docs/compatibility.md)。

## 验证

```powershell
git clone https://github.com/A5yncX/agent-peek.git
cd agent-peek
npm run check
```

测试只用合成会话，不需要 API key，也不上传真实记录。设置 `PI_PEEK_LOADER` 后会额外执行 Pi 同进程热重载测试。本机 Codex 0.153 的 marketplace/install 冒烟测试已通过；开发环境未安装 Claude CLI，因此 Claude manifest/Hook 目前为结构与 fixture 验证，发布前仍需真实 Claude Code 手测。
