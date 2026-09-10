# Agent Peek

**查看同一工作目录中正在运行的 Pi、Claude Code 和 Codex CLI 会话概况。**

[English (default)](README.md) · [更新记录](CHANGELOG.md) · [兼容性调研](docs/compatibility.md)

[![CI](https://github.com/A5yncX/agent-peek/actions/workflows/test.yml/badge.svg)](https://github.com/A5yncX/agent-peek/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js 22+](https://img.shields.io/badge/Node.js-22%2B-339933.svg)](https://nodejs.org/)

## 原生入口

| 工具 | 安装 | 使用 |
| --- | --- | --- |
| Pi | `pi install npm:@asyncx/agent-peek`，每个 Pi 窗口执行 `/reload` | `/peek` |
| Claude Code | `/plugin marketplace add A5yncX/agent-peek`，再执行 `/plugin install agent-peek@agent-peek-local` | `/agent-peek:peek` |
| Codex CLI 0.153+ | `codex plugin marketplace add A5yncX/agent-peek`，再执行 `codex plugin add agent-peek@agent-peek-local` | `$agent-peek:peek` |
| 普通终端 | `npm install -g @asyncx/agent-peek` | `agent-peek` |

也支持从 GitHub 安装：`pi install git:github.com/A5yncX/agent-peek`。

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
  "model": "my-provider/fast-model",
  "confirmBeforeSummary": true,
  "resultDisplay": "window"
}
```

模型格式为 `provider/model-id`。修改后下一次 `/peek` 立即生效，无需 `/reload`；删除 `model` 字段则跟随 Pi 当前模型。模型不存在或不可用时，插件输出本地概况，不静默改用其他模型。Claude Code、Codex 和终端入口使用本地确定性提取，不调用此模型。

## Pi 选项

输入 `/peek options` 打开交互设置，也可以直接执行：

```text
/peek options confirm on
/peek options confirm off
/peek options display window
/peek options display conversation
```

| 配置 | 默认值 | 行为 |
| --- | --- | --- |
| `confirmBeforeSummary` | `true` | 每次向模型发送过滤文本前确认。通过命令关闭时必须额外进行一次安全确认。 |
| `resultDisplay` | `"window"` | 用中央可关闭窗口展示；设为 `"conversation"` 时写入持久的 TUI 自定义对话条目。 |

结果窗口可用 Enter、Escape 或 `q` 关闭。RPC 不支持 Overlay 时自动退回对话输出。窗口模式不会把结果写入会话；对话模式的自定义条目也不会进入模型上下文。

### v0.5.0 优化

- 新增 `/peek options` 设置菜单和直接参数。
- 关闭后续摘要确认前增加明确的二次确认。
- 新增带证据引用的模型进度、置信度、ETA、已完成工作和估算依据。
- Pi 默认结果从对话条目改为参考 `pi-mcp-adapter` 的中央 Overlay 窗口。
- 保留对话模式，用于持久结果和 RPC 降级。
- 查询期间继续在输入框下显示动态 `👀`，打开结果前自动移除。

## 自动选择

1. Pi 当前会话 working 时优先查看自己。
2. 否则，同目录只有一个 working 会话就直接查看。
3. 多个 working 会话：Pi 弹出选择；其他入口列出 ID，再用前缀执行一次。
4. 自动选择排除等待输入、等待确认、过期、死进程和历史会话。

各工具通过 Hook 在 `~/.agent-peek/` 写小型心跳，只含来源、会话 ID、cwd、会话文件路径、PID 和状态，**不含对话正文**。Prompt/工具事件标记 working，权限请求标记 waiting，Stop 标记 idle，SessionEnd 标记结束。宿主 PID 存活时，每 5 秒更新；超过 20 秒的记录不使用。

## 输出

```text
╭─ 👁 Agent Peek
│ 其他会话 · ● 运行中 · codex · 10:20:30 快照
│ 目标  比较四组提取模型
│ 当前  正在测试第三组模型
│ 已完成  两组模型组合
│ 进度  ██████░░░░ 60% · 模型估算 · 中置信度
│ 预计剩余  ~15 分钟–35 分钟
│ 阻塞  暂未确认
│ 估算依据  已记录 2/4；第三阶段运行中；已耗时 28 分钟
╰─ Enter / Esc / q：关闭
```

AI 摘要可以基于至少两类有效信号估算：明确完成数/总数、任务清单、阶段顺序、带时间戳的进度变化和当前任务耗时。ETA 必须有已观察速度或可比较的完成单元。仅有进程存活、耗时、普通分数、F1 或 token 使用量时不能估算。每个估算都显示置信度和简短依据；证据不足时仍显示未知。

`/peek local` 不调用模型，只显示明确记录的计数，否则显示未知。记录计数和模型估算都不是独立验证的运行事实。

Pi 查询期间在输入框下方动态显示 `👀`，结束后消失；结果根据配置显示在窗口或对话中。Claude/Codex 使用各自命令或 Skill 的工作提示，并返回共享 CLI 的本地结果。

Pi 还支持：`/peek self|local|refresh|preview|options|cancel|clear|<id前缀>`。

## 隐私与限制

- 目标会话只读；不会恢复、修复、迁移、控制目标 Agent，也不会给它发送消息。
- 运行状态和偏好只保存在仓库外的 `~/.agent-peek/`。发布包不包含会话文件、本机配置、凭据或生成的摘要。
- Pi 可选 AI 摘要默认逐次确认；关闭确认需要明确二次确认，之后可能在不再次提示的情况下计费。上传前删除 reasoning、图片、工具参数和工具结果正文；普通文本仍可能含秘密。Claude/Codex/终端使用确定性的本地提取，不额外调用模型上传会话。
- 读取前核对 cwd 和会话 ID；限制 64 MiB/文件、8 MiB/行、100,000 条规范记录。支持 Pi v2/v3、Claude Code JSONL 和 Codex rollout JSONL。
- 外部格式可能随版本变化；未知记录跳过，损坏分支会禁用记录型百分比。模型估算使用受限且带引用的证据，但仍可能判断错误。PID 存活只证明宿主进程存在，不证明任务未卡住。
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
