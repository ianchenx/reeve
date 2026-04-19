// kernel.ts — core: state machine + dispatch loop
// Calls atomic primitives (Workspace, Publish, Source, agent) directly.

import type {
  Task,
  TaskState,
  AgentResult,
  KernelConfig,
  DoneReason,
  EvalRecord,
  SourceItem,
} from './types';
import { assertTransition } from './types';
import { StateStore } from './state';
import { SessionLogger } from './log';
import { WorkspaceManager } from '../workspace/manager';
import { RepoStore } from '../workspace/repo-store';
import {
  spawn,
  killAgent,
  isAgentAlive,
  type AgentHandle,
} from './agent';
import type { ACPEvent } from '../agent/runner';
import type { Source } from './source';
import type { ReeveDaemonConfig, ProjectConfig } from '../config';
import { resolve } from 'path';
import { existsSync, readFileSync, appendFileSync } from 'fs';
import {
  REEVE_DIR,
  LOGS_DIR,
  sanitizeTaskIdentifier,
} from '../paths';
import { writeJsonFileAtomic } from '../persistence';
import { syncHistoryIndexForTask } from '../history-index';
import { captureTrace } from './trace';
import { checkForUpdate, isUpdateCheckDisabled } from '../update-check';

type SSEListener = (event: {
  type: string;
  task: Task;
  data?: Record<string, unknown>;
}) => void;

// ── Trace enrichment ─────────────────────────────────────

function enrichMeta(task: Task, result: AgentResult, gateResult?: string): void {
  if (!task.workDir) return;
  const metaPath = resolve(task.workDir, 'meta.json');
  if (!existsSync(metaPath)) return;

  try {
    const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
    const now = new Date().toISOString();
    meta.endedAt = now;
    meta.exitCode = result.exitCode;
    meta.outcome = result.exitCode === 0 ? 'completed' : 'failed';
    if (result.stderr) meta.failureReason = result.stderr.slice(0, 512);
    if (task.startedAt) {
      meta.durationMs = Date.now() - new Date(task.startedAt).getTime();
    }
    if (gateResult !== undefined) meta.gateResult = gateResult;
    if (task.prUrl) meta.prUrl = task.prUrl;
    if (result.stderr) meta.stderr = result.stderr.slice(0, 2048);
    if (task.usage) {
      meta.tokensUsed = {
        input: task.usage.input,
        output: task.usage.output,
        cacheRead: task.usage.cacheRead,
        total: task.usage.total,
        ...(task.usage.costUsd !== undefined ? { costUsd: task.usage.costUsd } : {}),
      };
      meta.contextUsed = task.usage.contextUsed;
      meta.contextSize = task.usage.contextSize;
    }
    writeJsonFileAtomic(metaPath, meta);
  } catch {}
}

function appendEvalRecord(task: Task, reason: DoneReason): void {
  const record: EvalRecord = {
    ts: new Date().toISOString(),
    identifier: task.identifier,
    taskId: task.id,
    agent: task.agent,
    durationMs: task.startedAt
      ? Date.now() - new Date(task.startedAt).getTime()
      : undefined,
    retryCount: task.retryCount,
    round: task.round,
    success: reason === 'merged',
    doneReason: reason,
    prUrl: task.prUrl,
    labels: task.labels,
    repo: task.repo,
    contextUsed: task.usage?.contextUsed,
    contextSize: task.usage?.contextSize,
  };
  try {
    appendFileSync(resolve(LOGS_DIR, 'eval.jsonl'), JSON.stringify(record) + '\n');
  } catch {}
}

export class Kernel {
  private store: StateStore;
  private log: SessionLogger;
  private workspace: WorkspaceManager;
  private repoStore: RepoStore;
  private config: ReeveDaemonConfig;
  private running = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private updateCheckTimer: ReturnType<typeof setInterval> | null = null;
  private handles = new Map<string, AgentHandle>();
  private sseListeners = new Set<SSEListener>();
  private _tickInProgress = false;
  private _tickCount = 0;
  lastTickAt = 0;

  // Exposed for server.ts webhook parsing
  readonly source: Source;

  /** Expose config for the /api/config endpoint (strips sensitive fields at the handler). */
  getConfig(): ReeveDaemonConfig { return this.config; }

  constructor(
    source: Source,
    config: ReeveDaemonConfig,
    private kernelConfig: KernelConfig,
  ) {
    this.source = source;
    this.config = config;
    this.store = new StateStore(resolve(REEVE_DIR, 'state.json'));
    this.log = new SessionLogger(resolve(LOGS_DIR, 'session.jsonl'));
    this.workspace = new WorkspaceManager();
    this.repoStore = new RepoStore(config.workspace.root);
  }

  /** Find project config by repo identifier (org/repo). */
  private findProject(repo: string): ProjectConfig | undefined {
    return this.config.projects.find(p => p.repo === repo);
  }


  // ── Lifecycle ────────────────────────────────────────────

  async start(): Promise<void> {
    this.running = true;
    this.store.load();

    await this.recover();
    await this.cleanOrphans();
    await this.tick();
    this.scheduleNext();

    if (!isUpdateCheckDisabled()) {
      checkForUpdate().catch(() => {});
      this.updateCheckTimer = setInterval(() => {
        checkForUpdate().catch(() => {});
      }, 24 * 60 * 60 * 1000);
    }
  }

  /**
   * Recovery: restore in-flight tasks to correct state after daemon crash/restart.
   * Uses source disposition (not gh CLI) to determine correct state.
   * - active + dead PID → query disposition → re-queue or terminal
   * - published → query disposition → terminal or keep published
   * - queued → no-op (next tick dispatches)
   */
  private async recover(): Promise<void> {
    const tasks = this.store.all();
    let recovered = 0;

    for (const task of tasks) {
      if (task.state === 'active') {
        if (task.pid && !isAgentAlive(task.pid)) {
          task.pid = undefined;
          this.log.event(task.id, task.identifier, 'recover_dead_agent', {
            state: task.state,
          });

          // Ask the source what state this issue is in
          const disposition = await this.source.fetchDisposition(task.id);
          this.log.event(task.id, task.identifier, 'recover_disposition', { disposition });

          if (disposition === 'done' || disposition === 'cancelled') {
            await this.transition(task, 'done', disposition === 'done' ? 'merged' : 'failed');
          } else if (disposition === 'passive') {
            await this.transition(task, 'published');
          } else {
            // actionable or unknown → re-queue for next tick
            task.worktree = undefined;
            task.branch = undefined;
            task.startedAt = undefined;
            await this.transition(task, 'queued');
          }
          recovered++;
        }
      } else if (task.state === 'published') {
        const disposition = await this.source.fetchDisposition(task.id);
        if (disposition === 'done') {
          this.log.event(task.id, task.identifier, 'recover_done');
          await this.transition(task, 'done', 'merged');
          recovered++;
        } else if (disposition === 'cancelled') {
          this.log.event(task.id, task.identifier, 'recover_cancelled');
          await this.transition(task, 'done', 'failed');
          recovered++;
        }
        // review, active, unknown → keep as published (reconcile handles it)
      }
      // queued → no-op
    }

  }

  /** Remove orphan worktrees that don't belong to any active task. */
  private async cleanOrphans(): Promise<void> {
    const activeIdentifiers = new Set<string>();
    for (const task of this.store.all()) {
      if (task.state !== 'done') {
        activeIdentifiers.add(sanitizeTaskIdentifier(task.identifier));
      }
    }
    await this.workspace.cleanOrphans(activeIdentifiers);
  }

  stop(): void {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
  }

  /**
   * Graceful shutdown: kill all agents, wait for them to exit, persist state.
   * Agents that don't exit within the timeout keep their current state — recover() handles them on next start.
   */
  async shutdown(timeoutMs = 10_000): Promise<void> {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    if (this.updateCheckTimer) clearInterval(this.updateCheckTimer);

    this.log.event('', '', 'graceful_shutdown', {
      activeHandles: this.handles.size,
    });

    // Send SIGTERM to all active agents
    for (const [taskId, handle] of this.handles) {
      try {
        killAgent(handle.pid);
        this.log.event(taskId, '', 'shutdown_kill', { pid: handle.pid });
      } catch {}
    }

    // Wait for agents to exit (with timeout)
    if (this.handles.size > 0) {
      const exitPromises = Array.from(this.handles.values()).map(
        (handle) => handle.done.catch(() => {}),
      );
      await Promise.race([
        Promise.allSettled(exitPromises),
        new Promise((resolve) => setTimeout(resolve, timeoutMs)),
      ]);
    }

    // Persist final state
    this.store.save();
  }

  /**
   * Synchronous force-exit: kill all agents without waiting, persist state.
   * Used on double-SIGINT when graceful shutdown is already in progress.
   */
  forceShutdown(): void {
    for (const [, handle] of this.handles) {
      try { killAgent(handle.pid); } catch {}
    }
    this.store.save();
  }

  // ── Main loop ────────────────────────────────────────────

  private scheduleNext(): void {
    if (!this.running) return;
    this.timer = setTimeout(async () => {
      await this.tick();
      this.scheduleNext();
    }, this.kernelConfig.pollIntervalMs);
  }

  private async tick(): Promise<void> {
    if (this._tickInProgress) return;
    this._tickInProgress = true;
    try {
      this.lastTickAt = Date.now();
      this._tickCount++;
      await this.intake();
      await this.reconcile();
      await this.dispatch();
      this.checkStale();

    } catch (err) {
      console.error('[kernel] tick error:', err);
    } finally {
      this._tickInProgress = false;
    }
  }

  // ── Intake ───────────────────────────────────────────────

  private async intake(): Promise<void> {
    // git fetch runs on a separate background timer (startFetchLoop),
    // so intake only polls the source — no blocking subprocess calls.
    const items = await this.source.poll();

    for (const item of items) {
      const existing = this.store.get(item.id);
      if (existing) {
        if (existing.state === 'done' && existing.doneReason === 'failed') {
          // Failed task reappeared in poll (human moved Backlog → Todo) — start fresh.
          existing.state = 'queued';
          existing.doneReason = undefined;
          existing.worktree = undefined;
          existing.branch = undefined;
          existing.round = 0;
          existing.retryCount = 0;
          existing.updatedAt = new Date().toISOString();
          this.store.save();
          this.log.event(existing.id, existing.identifier, 'revive_failed', {});
        }
        continue;
      }

      const task: Task = {
        id: item.id,
        identifier: item.identifier,
        title: item.title,
        description: item.description,
        labels: item.labels,
        priority: item.priority,
        state: 'queued',
        repo: item.repo,
        baseBranch: item.baseBranch,
        round: 0,
        maxRounds: this.kernelConfig.maxRounds,
        retryCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      this.store.set(task);
      this.store.save();
      this.log.event(task.id, task.identifier, 'intake', { title: task.title });
      this.emit({ type: 'task_added', task });
    }
  }

  // ── Dispatch ─────────────────────────────────────────────

  private async spawnAndAttach(
    task: Task,
    agent: string,
    attempt: number,
  ): Promise<void> {
    const handle = await spawn(
      task,
      task.workDir!,
      this.config,
      (event: ACPEvent) => {
        const now = new Date().toISOString();
        task.updatedAt = now;
        task.lastOutputAt = now;
        if (event.type === 'usage' && event.usage) {
          // Merge — claude streams per-turn deltas and a final cumulative `result`
          // snapshot with no contextUsed. Merging preserves the last observed
          // contextUsed while the result event overrides input/output/cacheRead/cost.
          task.usage = { ...task.usage, ...event.usage };
        }
      },
      agent,
      attempt,
    );
    this.log.event(task.id, task.identifier, 'agent_spawn', {
      agent: handle.agent,
      pid: handle.pid,
      attempt,
    });
    this.attachAgent(task, handle);
  }

  private async dispatch(): Promise<void> {
    const now = Date.now();
    const queued = this.store
      .byState('queued')
      .filter((t) => !t.retryAfter || new Date(t.retryAfter).getTime() <= now)
      .sort((a, b) => (a.priority ?? Infinity) - (b.priority ?? Infinity));

    for (const task of queued) {
      try {
        this.log.event(task.id, task.identifier, 'dispatch_start');

        // Resolve repo identifier → local clone (lazy: clones on first use)
        const repoDir = await this.repoStore.ensure(task.repo);
        await this.workspace.fetchLatest(repoDir);
        const info = await this.workspace.createForTask(
          task.identifier,
          repoDir,
          task.baseBranch,
        );
        task.taskDir = info.taskDir;
        task.workDir = info.workDir;
        task.worktree = info.worktreeDir;
        task.branch = info.branch;
        this.log.event(task.id, task.identifier, 'worktree_created', {
          taskDir: info.taskDir,
          workDir: info.workDir,
          worktree: info.worktreeDir,
          branch: info.branch,
        });

        // Read project config from settings.json
        const project = this.findProject(task.repo);

        // Resolve agent name
        const resolvedAgent = project?.agent ?? task.agent ?? this.kernelConfig.agentDefault;

        // Project setup — user-supplied shell, a system boundary.
        // Failures surface to stderr but don't abort dispatch.
        if (project?.setup) {
          const proc = Bun.spawn(['bash', '-c', project.setup], {
            cwd: info.worktreeDir,
            stdout: 'pipe',
            stderr: 'pipe',
          });
          const [stdout, stderr, exitCode] = await Promise.all([
            new Response(proc.stdout).text(),
            new Response(proc.stderr).text(),
            proc.exited,
          ]);
          if (exitCode !== 0) {
            const tail = (stderr || stdout).split('\n').slice(-5).join('\n').trim();
            console.error(
              `[kernel] project.setup exited ${exitCode} for ${task.identifier} (cwd=${info.worktreeDir})${tail ? `\n  ${tail.replace(/\n/g, '\n  ')}` : ''}`,
            );
            // Don't persist output to session.jsonl — user scripts may leak secrets via stderr.
            // Byte counts are safe and let operators triage "silent failure" vs "noisy failure".
            this.log.event(task.id, task.identifier, 'project_setup_failed', {
              exitCode,
              stderrBytes: stderr.length,
              stdoutBytes: stdout.length,
            });
          }
        }

        // Notify source
        await this.source.onStart(this.toSourceItem(task));

        // Spawn agent — CWD is the wrapper dir (workDir) so Claude sees CLAUDE.md + skills
        task.startedAt = new Date().toISOString();
        task.lastOutputAt = task.startedAt;
        task.stage = 'implement';
        this.emit({ type: 'dispatching', task, data: { agent: resolvedAgent } });
        await this.spawnAndAttach(task, resolvedAgent, task.retryCount + 1);
        await this.transition(task, 'active');
      } catch (err) {
        console.error(`[kernel] dispatch failed for ${task.identifier}:`, err);
        await this.transition(task, 'done', 'failed');
      }
    }
  }

  // ── Agent exit ───────────────────────────────────────────

  private async onAgentExit(taskId: string, result: AgentResult): Promise<void> {
    const task = this.store.get(taskId);
    if (!task) return;
    this.handles.delete(taskId);
    task.pid = undefined;

    if (task.state !== 'active') {
      this.log.event(taskId, task.identifier, 'agent_exit_ignored', {
        exitCode: result.exitCode,
        state: task.state,
      });
      this.store.set(task);
      this.store.save();
      return;
    }

    const durationMs = task.startedAt
      ? Date.now() - new Date(task.startedAt).getTime()
      : undefined;

    this.log.event(taskId, task.identifier, 'agent_exit', {
      exitCode: result.exitCode,
      durationMs,
    });

    // Gate: agent must exit 0
    if (result.exitCode !== 0) {
      const reason = `agent exited ${result.exitCode}`;
      this.log.event(taskId, task.identifier, 'gate_failed', { reason });
      enrichMeta(task, result, reason);
      syncHistoryIndexForTask(sanitizeTaskIdentifier(task.identifier));
      return this.retryOrFail(task, reason);
    }

    if (task.worktree) {
      // Detect PR URL before post-agents — review agent needs it for PR comments
      if (!task.prUrl) {
        task.prUrl = await this.source.detectPrUrl?.(task.worktree);
        if (task.prUrl) {
          this.store.save();
          this.emit({ type: 'pr_detected', task, data: { prUrl: task.prUrl } });
        }
      }

      // Run post-agent chain (e.g., review) if configured
      const project = this.findProject(task.repo);
      const postConfig = project?.post ?? {};
      const postNames = Object.keys(postConfig);
      if (postNames.length > 0) {
        const { resolvePostAgents, runPostAgents } = await import('./post-agent/index')
        const { spawnForPostAgent } = await import('./agent')
        const agents = resolvePostAgents(postNames)
        this.emit({ type: 'post_agent_start', task, data: { agents: postNames } });
        const chainResult = await runPostAgents(
          task, this.config, agents, spawnForPostAgent, postConfig
        )

        if (chainResult.verdict === "fail") {
          const reason = `post-agent ${chainResult.failedAt} failed`
          this.emit({ type: 'post_agent_result', task, data: { verdict: 'fail', agent: chainResult.failedAt } });
          this.log.event(taskId, task.identifier, 'gate_failed', { reason })
          enrichMeta(task, result, reason)
          syncHistoryIndexForTask(sanitizeTaskIdentifier(task.identifier))
          return this.retryOrFail(task, reason)
        }
        this.emit({ type: 'post_agent_result', task, data: { verdict: 'pass', agents: chainResult.results.map(r => r.agent) } });
        this.log.event(taskId, task.identifier, 'post_agents_passed', {
          agents: chainResult.results.map(r => r.agent),
        })
      }
    }

    // Agent exited cleanly — check source disposition to determine next step
    enrichMeta(task, result, 'passed');
    syncHistoryIndexForTask(sanitizeTaskIdentifier(task.identifier));

    const disposition = await this.source.fetchDisposition(task.id);
    task.lastExitDisposition = disposition;
    this.log.event(taskId, task.identifier, 'post_exit_disposition', { disposition });

    if (disposition === 'done' || disposition === 'cancelled') {
      return this.transition(task, 'done', disposition === 'done' ? 'merged' : 'failed');
    }

    if (disposition === 'passive' || disposition === 'unknown') {
      // Issue is in review (or source can't determine) → published
      // Detect PR URL before transitioning to published
      if (task.worktree && !task.prUrl) {
        task.prUrl = await this.source.detectPrUrl?.(task.worktree);
        if (task.prUrl) {
          this.store.save();
          this.emit({ type: 'pr_detected', task, data: { prUrl: task.prUrl } });
        }
      }
      return this.transition(task, 'published');
    }

    // Actionable → continue
    return this.tryContinuation(task, result);
  }

  // ── Reconcile (published task state check) ──────────────────

  private async reconcile(): Promise<void> {
    const published = this.store.byState('published');
    if (published.length === 0) return;

    for (const task of published) {
      try {
        const disposition = await this.source.fetchDisposition(task.id);

        if (disposition === 'done' || disposition === 'cancelled') {
          this.log.event(task.id, task.identifier, 'reconcile_done', {
            disposition,
          });
          await this.transition(
            task,
            'done',
            disposition === 'done' ? 'merged' : 'failed',
          );
          continue;
        }

        if (disposition === 'actionable') {
          // If agent's last exit was passive (moved to In Review), and now it's
          // actionable again, a human moved it back → reset round counter
          if (task.lastExitDisposition === 'passive') {
            task.round = 0;
          }
          this.log.event(task.id, task.identifier, 'reconcile_redispatch', { disposition });
          await this.reDispatch(task);
          continue;
        }

        // passive, unknown → wait
      } catch (err) {
        // warn — transient errors retry next tick; persistent ones (revoked key,
        // etc.) would otherwise leave tasks silently stuck in `published`.
        console.warn(
          `[kernel] reconcile failed for ${task.identifier}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  /**
   * Re-dispatch: published → active. Agent reads disposition from Linear itself.
   * Kernel only provides budget context.
   */
  private async reDispatch(task: Task): Promise<void> {
    if (task.round >= task.maxRounds) {
      this.log.event(task.id, task.identifier, 'max_rounds_reached', {
        round: task.round,
      });
      return this.transition(task, 'done', 'failed');
    }

    task.round++;
    await this.transition(task, 'active');

    // Both workDir and worktree must exist to proceed
    if (!task.workDir || !task.worktree) {
      return this.transition(task, 'done', 'failed');
    }

    try {
      if (!task.agent) throw new Error(`invariant: task ${task.identifier} has no resolved agent at reDispatch`);
      await this.spawnAndAttach(task, task.agent, task.round + 1);
    } catch (err) {
      console.error(`[kernel] reDispatch spawn failed for ${task.identifier}:`, err);
      await this.transition(task, 'done', 'failed');
    }
  }

  // ── Continuation (multi-turn) ───────────────────────────────

  private async tryContinuation(task: Task, result: AgentResult): Promise<void> {
    if (task.round >= task.maxRounds) {
      this.log.event(task.id, task.identifier, 'continuation_max_rounds', {
        round: task.round,
      });
      enrichMeta(task, result, 'max turns exceeded');
      syncHistoryIndexForTask(sanitizeTaskIdentifier(task.identifier));
      return this.retryOrFail(task, 'max turns exceeded, no PR created');
    }

    const disposition = await this.source.fetchDisposition(task.id);
    if (disposition === 'done' || disposition === 'cancelled') {
      return this.transition(
        task,
        'done',
        disposition === 'done' ? 'merged' : 'failed',
      );
    }

    if (disposition === 'passive') {
      // Agent pushed PR but kernel missed it, or agent set In Review manually
      return this.transition(task, 'published');
    }

    if (disposition !== 'actionable') {
      enrichMeta(task, result, `issue disposition: ${disposition}`);
      syncHistoryIndexForTask(sanitizeTaskIdentifier(task.identifier));
      return this.transition(task, 'published');
    }

    // Schedule continuation via reDispatch-like logic
    task.round++;
    this.log.event(task.id, task.identifier, 'continuation_scheduled', {
      round: task.round,
      disposition,
    });

    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Both workDir and worktree must exist
    if (!task.workDir || !task.worktree) return this.transition(task, 'done', 'failed');

    try {
      if (!task.agent) throw new Error(`invariant: task ${task.identifier} has no resolved agent at continuation`);
      await this.spawnAndAttach(task, task.agent, task.round + 1);
    } catch (err) {
      console.error(
        `[kernel] Continuation spawn failed for ${task.identifier}:`,
        err,
      );
      await this.transition(task, 'done', 'failed');
    }
  }

  // ── Stale detection ──────────────────────────────────────

  private checkStale(): void {
    const now = Date.now();
    for (const task of this.store.byState('active')) {
      if (!task.startedAt) continue;

      const startTime = new Date(task.startedAt).getTime();
      const lastOutput = task.lastOutputAt ? new Date(task.lastOutputAt).getTime() : startTime;

      const timeSinceOutput = now - lastOutput;
      const totalElapsed = now - startTime;

      // Stall detection: no output for stallTimeoutMs
      if (timeSinceOutput > this.kernelConfig.stallTimeoutMs) {
        this.log.event(task.id, task.identifier, 'stalled', {
          timeSinceOutputMs: timeSinceOutput,
          totalElapsedMs: totalElapsed,
        });
        if (task.pid) killAgent(task.pid);
        this.transition(task, 'done', 'failed');
        continue;
      }

      // Turn timeout: total time exceeds turnTimeoutMs
      if (totalElapsed > this.kernelConfig.turnTimeoutMs) {
        this.log.event(task.id, task.identifier, 'turn_timeout', {
          totalElapsedMs: totalElapsed,
        });
        if (task.pid) killAgent(task.pid);
        this.transition(task, 'done', 'failed');
      }
    }
  }

  // ── State transition (pure) ──────────────────────────────

  private async transition(
    task: Task,
    to: TaskState,
    reason?: DoneReason,
  ): Promise<void> {
    const from = task.state;
    assertTransition(from, to);

    task.state = to;
    task.updatedAt = new Date().toISOString();
    if (to === 'done') task.doneReason = reason;

    this.log.transition(
      task.id,
      task.identifier,
      from,
      to,
      reason ? { reason } : undefined,
    );
    this.store.set(task);
    this.store.save();
    this.emit({ type: 'state_change', task, data: { from, to, reason } });

    if (to === 'done') {
      appendEvalRecord(task, reason ?? 'failed');
      this.log.event(task.id, task.identifier, 'notify_done', { reason });

      // Notify source
      const outcome = reason ?? 'failed';
      await this.source.onDone(this.toSourceItem(task), outcome);

    }
  }

  // ── Agent handle bookkeeping ─────────────────────────────

  private attachAgent(task: Task, handle: AgentHandle): void {
    task.pid = handle.pid;
    task.agent = handle.agent;
    if (handle.sessionId) task.sessionId = handle.sessionId;
    if (handle.threadId) task.threadId = handle.threadId;
    this.handles.set(task.id, handle);
    this.store.set(task);
    this.store.save();
    handle.done.then((result) => this.onAgentExit(task.id, result));
  }

  /** Retry a task with exponential backoff, or fail if max retries exceeded. */
  private async retryOrFail(
    task: Task,
    reason?: string,
    detail?: string,
  ): Promise<void> {
    const maxRetries = this.kernelConfig.maxRetries ?? 2;
    if (task.retryCount < maxRetries) {
      task.retryCount++;
      task.trace = await captureTrace(task, reason ?? 'retry');
      if (detail) task.trace.detail = detail;
      const backoffMs = Math.min(60_000 * Math.pow(2, task.retryCount - 1), 600_000);
      task.retryAfter = new Date(Date.now() + backoffMs).toISOString();
      this.emit({ type: 'retrying', task, data: { reason, maxRetries } });
      this.log.event(task.id, task.identifier, 'retry_scheduled', {
        retryCount: task.retryCount,
        maxRetries,
        backoffMs,
        retryAfter: task.retryAfter,
      });
      return this.transition(task, 'queued');
    }
    return this.transition(task, 'done', 'failed');
  }

  private toSourceItem(task: Task): SourceItem {
    return {
      id: task.id,
      identifier: task.identifier,
      title: task.title,
      description: task.description,
      labels: task.labels,
      priority: task.priority,
      repo: task.repo,
      baseBranch: task.baseBranch,
    };
  }

  // ── SSE ──────────────────────────────────────────────────

  onSSE(listener: SSEListener): () => void {
    this.sseListeners.add(listener);
    return () => this.sseListeners.delete(listener);
  }

  private emit(event: {
    type: string;
    task: Task;
    data?: Record<string, unknown>;
  }): void {
    for (const listener of this.sseListeners) {
      try {
        listener(event);
      } catch {}
    }
  }

  // ── Public accessors ─────────────────────────────────────

  get tasks(): Task[] {
    return this.store.all();
  }
  getTask(id: string): Task | undefined {
    return this.store.get(id);
  }
  getTaskByIdentifier(id: string): Task | undefined {
    return this.store.getByIdentifier(id);
  }

  async cancel(identifier: string): Promise<boolean> {
    const task = this.store.getByIdentifier(identifier);
    if (!task) return false;
    if (task.pid) killAgent(task.pid);
    await this.transition(task, 'done', 'failed');
    return true;
  }

  // ── Project management (hot-reload) ─────────────────────

  addProject(project: Partial<ProjectConfig> & { team: string; slug: string; repo: string; baseBranch: string }): void {
    if (this.config.projects.some(p => p.slug === project.slug)) {
      throw new Error(`Project ${project.slug} already exists`);
    }
    this.config.projects.push(project as ProjectConfig);
  }

  updateProject(slug: string, changes: Partial<ProjectConfig>): boolean {
    const project = this.config.projects.find(p => p.slug === slug);
    if (!project) return false;
    Object.assign(project, changes);
    return true;
  }

  removeProject(slug: string): boolean {
    const idx = this.config.projects.findIndex(p => p.slug === slug);
    if (idx === -1) return false;
    this.config.projects.splice(idx, 1);
    return true;
  }
}
