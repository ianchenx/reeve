<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/icon-transparent.png">
    <source media="(prefers-color-scheme: light)" srcset="assets/icon-light-transparent.png">
    <img alt="Reeve" src="assets/icon-light-transparent.png" width="120">
  </picture>
  <br>
  <strong>Reeve</strong> — 写工单，收 PR。
</p>

<div align="center">

写工单，喝咖啡，坐等交付。

**你的机器 · 你的密钥 · 你选的代理**

[English](README.md) | 中文

[为什么？](#什么是-reeve) · [快速开始](#快速开始) · [工作原理](#工作原理) · [配置](#配置) · [Dashboard](#dashboard)

</div>

---

## 什么是 Reeve？

AI 编码智能体的能力已经到了可以独立完成工程任务的水平。但运行它们，你只有两种选择：

**盯着终端等它跑完**——CLI 工具强大但独占前台，崩了你得手动重来。
**把执行权交给云服务**——不用盯了，但代码在别人的基础设施上跑，按座席付费，数据流向不透明。

Reeve 是第三种选择：**自托管的无人值守执行**。你的机器上跑，你的 API 密钥，你选的代理。写一张工单，去喝杯咖啡——剩下的事情在后台全自动流转。

```
┌──────────────┐      ┌─────────────┐      ┌──────────────┐      ┌───────────┐
│   任务看板    │ ───▶ │   Reeve     │ ───▶ │   AI 代理    │ ───▶ │ GitHub PR │
│   (任意)      │      │  (守护进程)  │      │  (任意 CLI)  │      │           │
└──────────────┘      └─────────────┘      └──────────────┘      └───────────┘
```

> 内置 **Linear** 适配器。任务源通过 `Source` 接口接入，对接其他工单系统只需实现一个轻量 adapter。

### 核心设计

**三件事互不绑定：任务从哪来、谁来写代码、代码跑在哪里。** 换掉 Linear 不影响代理，换掉代理不影响工作区。每一层都可以独立替换和演进。

- **任务驱动，不是提示驱动**。你不写 prompt，你写工单——用你一直在用的项目管理工具。Reeve 监听状态变更，自动将待办工单转化为代理任务。

- **工单即唯一记忆源**。代理将工单作为一切上下文的唯一源头，在评论区维护实时 Workpad 记录执行进度。进程中断、代理重启，后续执行者从断点接续，不从头跑。

- **执行全透明**。每个任务的 token 用量、运行时长实时可查。你不会让一个看不到账单的东西无人值守。

- **任务源可插拔**。内核从不直接调用任何特定平台的 API——所有任务系统通过 `Source` 适配器接入。Linear 是第一个内置适配器，接口完全开放。

### 设计哲学

**编排层越笨，系统越强。**

大多数编排工具试图变得更聪明——拆解任务、规划步骤、管理复杂工作流。Reeve 做的是相反的赌注：**保持编排层尽可能薄**，把一切智力决策交给代理。

内核不理解代码，不做规划，不拆分问题。它只做一件事：把你的任务看板连接到 AI 代理，提供隔离和生命周期护栏，然后闪开。

代理只会越来越强。今天的前沿模型就是明年的及格线。厚重的编排层会成为负债——它们限制了代理的能力上限。而薄层是资产——代理能力的每一次提升都能零阻力地直接传导。今天你用 Claude Code，明天换更强的模型，零迁移成本。

## 快速开始

### 前置条件

- macOS 或 Linux
- [Bun](https://bun.sh) >= 1.0
- [gh](https://cli.github.com) CLI（通过 `gh auth login` 完成认证）
- 至少一个代理 CLI：[Claude Code](https://docs.anthropic.com/en/docs/claude-code) 或 [Codex](https://github.com/openai/codex)
- 一个 [Linear](https://linear.app) 账号（目前唯一内置的任务源，更多适配器在路上）

### 1. 安装

```bash
npm install -g reeve-ai
# 或: bun install -g reeve-ai
```

### 2. 配置

```bash
reeve init
```

配置向导会引导你完成：输入 Linear API Key → 选择团队 → 导入仓库 → 选择代理。

> 也可以跳过 `reeve init`，直接运行 `reeve run`，通过 `http://localhost:14500` 的 Web 界面完成配置。

### 3. 启动守护进程

```bash
reeve start                 # 后台守护进程
reeve run                   # 或前台运行（Ctrl+C 停止）
```

### 4. 像往常一样指派任务

打开你的 Linear 项目，创建一个工单描述你想要的改动，将状态拖至 **Todo**。然后去喝杯咖啡。

Reeve 的调度内核会自动接管：

1. **隔离**——为任务创建独立的 Git Worktree，不影响你的主工作区
2. **调度**——将工单转化为结构化上下文，唤醒你配置的代理
3. **执行**——代理在隔离区内自主编写代码、运行测试、提交 commit
4. **验证**——若开启了 Review，自动触发交叉代码审查，不合格则打回重跑
5. **交付**——推送 PR，推进工单状态，静候你的最终放行

Reeve 的交付物是 PR，不是 merge。合并是你的决策。

### 从源码运行

```bash
git clone https://github.com/ianchenx/reeve.git
cd reeve
make install                # 安装后端 + Dashboard 依赖
make dev                    # 后端热重载 + Dashboard 开发服务器
```

## 工作原理

每个调度周期（默认 30 秒），Reeve 执行：

1. **Intake** — 轮询任务源，拉取可派发的工单，新工单变成任务。
2. **Reconcile** — 对已发布的任务，检查工单是否仍然可操作（如人类请求了代码修改）。
3. **Dispatch** — 对排队中的任务，创建 git worktree、构建 prompt、启动代理。
4. **Monitor** — 跟踪代理输出、检测卡死、执行超时。

### 任务生命周期

```
queued ──▶ active ──▶ published ──▶ done
                         │
                         ▼
                    done (failed) ──▶ [人工移回待办] ──▶ 复活
```

`published` = PR 已创建，等待人工审查。审查中如果请求修改，Reeve 检测到后自动重新调度代理来处理反馈。

### 可靠性与故障恢复

| 故障场景 | 恢复机制 |
|---|---|
| **验证拦截** | 指数退避，打回代理重跑，最多 `maxRetries` 次 |
| **代理进程异常退出** | 读取 Workpad 进度，复用 Worktree 从断点接续 |
| **任务彻底失败** | 人工移回待办列即可——保留代码现场、重置预算、强制复活 |
| **守护进程宕机** | 重启后自动对齐本地状态与远端看板，无损恢复 |

## 配置

`~/.reeve/settings.json` — 由 `reeve init` 创建：

```json
{
  "linearApiKey": "lin_api_...",
  "defaultAgent": "claude",
  "projects": [
    { "team": "ENG", "linear": "my-project-slug", "repo": "myorg/myrepo" }
  ],
  "workspace": { "root": "~/reeve-workspaces" },
  "polling": { "intervalMs": 30000 },
  "dashboard": { "port": 14500, "enabled": true }
}
```

每个项目的设置通过 Dashboard 或 `settings.json` 管理：

```json
{
  "projects": [
    {
      "team": "ENG",
      "linear": "my-project-slug",
      "repo": "myorg/myrepo",
      "agent": "claude",
      "setup": "bun install",
      "post": { "review": "codex" }
    }
  ]
}
```

## Skills

代理通过 Skills 知道如何 commit、push、管理工单状态——以下是默认内置的，你可以覆盖或扩展：

```
skills/
├── reeve-commit/SKILL.md   # 规范化 git commit
├── reeve-push/SKILL.md     # 推送分支 + 创建/更新 PR
├── reeve-pull/SKILL.md     # 同步 origin/main，解决冲突
└── reeve-linear/SKILL.md   # Linear GraphQL 查询 + 状态管理
```

## Dashboard

代理会在工单 Workpad 中持续同步进度，Reeve 在纯后台无头模式下就能完整运行。

Dashboard (`http://localhost:14500`) 提供的是系统级可观测性：

- **链路追踪**：实时观测代理的思考节点与工具调用流
- **并发看板**：全局检阅所有被调度内核拉起的并发隔离任务
- **成本归因**：每个任务消耗的 token 数量——判断哪些任务值得自动化
- **全量日志**：异常重试或拦截时，提供远比 Workpad 详尽的底层运行记录

## CLI 参考

```
reeve init                  交互式配置向导
reeve start                 后台启动守护进程
reeve run                   前台运行（Ctrl+C 停止）
reeve stop                  停止守护进程
reeve restart               重启
reeve status                任务状态概览
reeve tasks                 列出活跃任务
reeve log <id>              查看任务的会话日志
reeve cancel <id>           取消运行中的任务
reeve history               历史任务记录
reeve clean [id]            清理任务状态 + worktree
reeve doctor                检查环境健康状态
reeve import <org/repo>     导入 GitHub 仓库为项目
reeve edit <slug>           修改项目配置
reeve remove <slug>         移除项目
```

## 开发

```bash
make install            # 安装所有依赖
make dev                # 后端监听 + Dashboard 开发服务器
make test               # 运行全部测试
make check              # 类型检查 + 测试
make help               # 查看所有 make 目标
```

## 接下来

- [ ] 更多任务源适配器
- [ ] 自定义任务源适配器指南
- [ ] 多代理协同

Star 或 Watch 这个仓库以追踪进展。

## 许可证

MIT
