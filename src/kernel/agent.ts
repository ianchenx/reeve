// kernel/agent.ts — Agent spawn adapter for the kernel

import {
  spawnAgent as rawSpawnAgent,
  killAgent,
  isAgentAlive,
  type ACPEvent,
  type AgentTask,
} from '../agent/runner';
import { buildPrompt, buildRetrySection } from '../agent/prompt-builder';
import type { Task, AgentResult } from './types';
import type { ReeveDaemonConfig } from '../config';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { writeJsonFileAtomic } from '../persistence';

export interface AgentHandle {
  pid: number;
  agent: string;
  sessionId?: string;
  threadId?: string;
  done: Promise<AgentResult>;
}

function toAgentTask(task: Task): AgentTask {
  return {
    id: task.id,
    identifier: task.identifier,
    title: task.title,
    description: task.description,
    labels: task.labels,
    priority: task.priority,
    state: task.state,
    repo: task.repo,
  };
}

function persistPostAgentUsage(workDir: string, usage: ACPEvent['usage'] | undefined): void {
  if (!usage) return;

  const metaPath = resolve(workDir, 'meta.json');
  if (!existsSync(metaPath)) return;

  try {
    const meta = JSON.parse(readFileSync(metaPath, 'utf-8')) as Record<string, unknown>;
    meta.tokensUsed = {
      input: usage.input,
      output: usage.output,
      total: usage.total,
      ...(usage.cacheRead !== undefined ? { cacheRead: usage.cacheRead } : {}),
      ...(usage.costUsd !== undefined ? { costUsd: usage.costUsd } : {}),
    };
    if (usage.contextUsed !== undefined) meta.contextUsed = usage.contextUsed;
    if (usage.contextSize !== undefined) meta.contextSize = usage.contextSize;
    writeJsonFileAtomic(metaPath, meta);
  } catch {}
}

export async function spawn(
  task: Task,
  workDir: string,
  config: ReeveDaemonConfig,
  onEvent?: (event: ACPEvent) => void,
  agent?: string,
  attempt = 1,
): Promise<AgentHandle> {
  const agentTask = toAgentTask(task);
  const resolvedAgent = agent ?? config.agent.default;
  if (resolvedAgent === 'auto') throw new Error('agent must be resolved before spawn');
  const prompt = buildPrompt({ task: agentTask });

  let finalPrompt = prompt;
  if (task.trace) {
    finalPrompt += '\n\n' + buildRetrySection(task.trace, task.retryCount);
  }

  const result = await rawSpawnAgent(
    agentTask,
    workDir,
    finalPrompt,
    config,
    onEvent ?? (() => {}),
    attempt,
    resolvedAgent,
    workDir, // logDir = agent's own directory
    undefined, // logMetadata
    task.sessionId,
    task.threadId,
  );

  return {
    pid: result.pid,
    agent: result.agent,
    sessionId: result.sessionId,
    threadId: result.threadId,
    done: result.done.then(
      (exitCode): AgentResult => ({
        exitCode,
        stderr: result.stderrBuffer.text,
      }),
    ),
  };
}

export async function spawnForPostAgent(
  task: Task,
  workDir: string,
  prompt: string,
  config: ReeveDaemonConfig,
  agentOverride?: string,
): Promise<AgentResult> {
  const agentTask = toAgentTask(task);
  const implAgent = config.agent.default === 'auto' ? 'claude' : config.agent.default;
  const agent = agentOverride || (implAgent === 'claude' ? 'codex' : 'claude');
  let latestUsage: ACPEvent['usage'] | undefined;
  const result = await rawSpawnAgent(
    agentTask,
    workDir,
    prompt,
    config,
    (event) => {
      if (event.type === 'usage' && event.usage) {
        latestUsage = { ...latestUsage, ...event.usage };
      }
    },
    1,
    agent,
    workDir, // logDir = post-agent's own directory
  );
  const exitCode = await result.done;
  persistPostAgentUsage(workDir, latestUsage);
  return {
    exitCode,
    stderr: result.stderrBuffer.text,
  };
}

export { killAgent, isAgentAlive };
