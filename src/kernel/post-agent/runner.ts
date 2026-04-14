import { lstatSync, symlinkSync, readFileSync, existsSync } from "fs"
import { resolve, basename, join } from "path"
import type { Task, AgentResult } from "../types"
import type { ReeveDaemonConfig } from "../../config"
import type { PostAgent, PostAgentContext, PostChainResult, PostAgentResult } from "./types"
import { setupAgentContext } from "../../workspace/context-injector"

export type SpawnPostAgentFn = (
  task: Task,
  workDir: string,
  prompt: string,
  config: ReeveDaemonConfig,
  agentName?: string,
) => Promise<AgentResult>

/**
 * Create an isolated directory for a post-agent.
 *
 * Layout:
 *   {taskDir}/{name}/
 *     CLAUDE.md, AGENTS.md       ← agent-specific rules
 *     .agents/skills/            ← universal agent skills
 *     .claude/skills/            ← Claude Code skills
 *     .codex/skills/             ← Codex skills
 *     {repoName} → {worktreeDir} ← symlink to shared worktree
 */
function prepareAgentDir(
  agent: PostAgent,
  taskDir: string,
  worktreeDir: string,
  repoName: string,
): string {
  const agentDir = resolve(taskDir, agent.name)
  const rules = agent.buildRules(repoName)
  setupAgentContext(agentDir, repoName, rules, agent.skills)

  const repoLink = resolve(agentDir, repoName)
  try { lstatSync(repoLink) } catch { symlinkSync(worktreeDir, repoLink) }

  return agentDir
}

/**
 * Run post-agents sequentially. Exit code 0 = pass, non-zero = fail.
 * Stops at the first failure.
 */
export async function runPostAgents(
  task: Task,
  config: ReeveDaemonConfig,
  agents: PostAgent[],
  spawnFn: SpawnPostAgentFn,
  postConfig?: Record<string, string>,
): Promise<PostChainResult> {
  const results: PostAgentResult[] = []
  const repoName = basename(task.worktree!)
  const taskRoot = task.taskDir!

  for (const agent of agents) {
    const ctx: PostAgentContext = { task, prUrl: task.prUrl, prior: results }
    const prompt = agent.buildPrompt(ctx)

    const agentDir = prepareAgentDir(agent, taskRoot, task.worktree!, repoName)

    const agentOverride = postConfig?.[agent.name]
    console.log(`[post-agent] Running ${agent.name} for ${task.identifier} in ${agentDir}`)
    const agentResult = await spawnFn(task, agentDir, prompt, config, agentOverride)

    const result: PostAgentResult = { agent: agent.name, exitCode: agentResult.exitCode }
    results.push(result)

    if (agentResult.exitCode !== 0) {
      return {
        verdict: "fail",
        failedAt: agent.name,
        results,
      }
    }

    // Agents can't control their exit code — check verdict file as fallback
    const verdictPath = join(agentDir, "verdict.txt")
    if (existsSync(verdictPath)) {
      const verdict = readFileSync(verdictPath, "utf-8").trim().toUpperCase()
      if (verdict === "FAIL") {
        return {
          verdict: "fail",
          failedAt: agent.name,
          results,
        }
      }
    }
  }

  return { verdict: "pass", results }
}
