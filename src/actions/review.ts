// actions/review.ts — Hook-callable AI code review
//
// Triggered by the registered `review` action.
//
// In settings.json:
//   post: { "review": "codex" }  ← in project config, enables post-agent review

import { z } from "zod"
import { registerAction } from "./registry"
import { spawnAgent, type AgentTask } from "../agent/runner"
import { buildReviewPrompt, buildReviewOutputContract } from "../agent/prompt-builder"
import { loadConfig } from "../config"
import { existsSync, readFileSync, appendFileSync, mkdirSync } from "fs"
import { resolve, dirname } from "path"
import { LOGS_DIR } from "../paths"

// ── Output contract (verdict file + PR comment) ──────────────

const VERDICT_CONTRACT = `

After completing your review, write a verdict file:

\`\`\`bash
mkdir -p .reeve
\`\`\`

If no critical/high-severity findings remain after judgment:
\`\`\`bash
echo '{"verdict":"pass"}' > .reeve/review-verdict.json
\`\`\`

If confirmed critical/high-severity findings exist:
\`\`\`bash
echo '{"verdict":"fail"}' > .reeve/review-verdict.json
\`\`\``

// ── Input/output schemas ──────────────────────────────────────

export const reviewInput = z.object({
  identifier: z.string().optional(),
  worktree: z.string().optional(),
  prUrl: z.string().optional(),
  agent: z.string().optional(),
})

export const reviewOutput = z.object({
  verdict: z.enum(["pass", "fail", "error"]),
  agent: z.string(),
  exitCode: z.number(),
})

export type ReviewInput = z.infer<typeof reviewInput>
export type ReviewOutput = z.infer<typeof reviewOutput>

// ── Core review logic (exported for testing) ──────────────────

export async function executeReview(input: ReviewInput): Promise<ReviewOutput> {
  // 1. Resolve context from env vars (hook-injected) or explicit input
  const worktree = input.worktree || process.env.REEVE_WORKTREE
  const agentCwd = process.env.REEVE_WORKDIR || worktree
  const prUrl = input.prUrl || process.env.REEVE_PR_URL || undefined
  const repo = process.env.REEVE_REPO || worktree
  const reviewAgent = input.agent || process.env.REEVE_REVIEW_AGENT || "codex"
  const identifier = input.identifier || process.env.REEVE_IDENTIFIER

  if (!identifier) {
    throw new Error("No identifier: pass as argument or set REEVE_IDENTIFIER")
  }
  if (!worktree) {
    throw new Error("No worktree: set REEVE_WORKTREE or pass --worktree")
  }
  if (!existsSync(worktree)) {
    throw new Error(`Worktree not found: ${worktree}`)
  }

  console.log(`[review] ${identifier} → agent: ${reviewAgent}, worktree: ${worktree}`)
  if (prUrl) console.log(`[review] PR: ${prUrl}`)

  // 2. Build review prompt: reuse prompt-builder's 3-lens protocol + append output contract
  const basePrompt = buildReviewPrompt({
    task: {
      identifier,
      title: process.env.REEVE_TITLE || identifier,
      description: "",
      labels: [],
    },
    review: { round: 1, maxRounds: 1 },
    prUrl: prUrl,
  })

  let prompt = basePrompt + VERDICT_CONTRACT + buildReviewOutputContract(identifier, prUrl)

  // 3. Spawn constrained review agent
  const config = loadConfig()
  const agentTask: AgentTask = {
    id: `review-${identifier}`,
    identifier,
    title: `Review ${identifier}`,
    description: "",
    labels: [],
    priority: null,
    state: "In Review",  // valid Linear state, not a made-up value
    repo: repo!,
  }

  const result = await spawnAgent(
    agentTask,
    agentCwd!,
    prompt,
    config,
    () => {},       // no activity tracking needed
    1,              // attempt
    reviewAgent,    // agent override
    "review",       // logSuffix → logs/<id>/review/
    { stage: "review" },
  )

  console.log(`[review] Agent spawned (pid: ${result.pid})`)
  const exitCode = await result.done
  console.log(`[review] Agent exited: ${exitCode}`)

  // 4. Read verdict
  const verdict = readVerdict(worktree, exitCode)

  // 5. Append eval record
  appendEvalRecord({ identifier, agent: reviewAgent, verdict, exitCode, prUrl })

  console.log(`[review] Verdict: ${verdict}`)
  return { verdict, agent: result.agent, exitCode }
}

// ── Helpers (exported for testing) ────────────────────────────

export function readVerdict(worktree: string, exitCode: number): "pass" | "fail" | "error" {
  const verdictPath = resolve(worktree, ".reeve", "review-verdict.json")

  if (existsSync(verdictPath)) {
    try {
      const raw = JSON.parse(readFileSync(verdictPath, "utf-8"))
      return raw.verdict === "pass" ? "pass" : "fail"
    } catch {
      return "error"
    }
  }

  // Agent completed but didn't write verdict — assume pass
  if (exitCode === 0) return "pass"

  return "error"
}

export function appendEvalRecord(record: {
  identifier: string
  agent: string
  verdict: string
  exitCode: number
  prUrl?: string
}): void {
  const evalPath = resolve(LOGS_DIR, "eval.jsonl")
  try {
    mkdirSync(dirname(evalPath), { recursive: true })
    appendFileSync(
      evalPath,
      JSON.stringify({ ts: new Date().toISOString(), type: "review", ...record }) + "\n",
    )
  } catch (err) {
    console.warn(`[review] Failed to write eval record: ${err instanceof Error ? err.message : err}`)
  }
}

// ── Action registration ───────────────────────────────────────

registerAction({
  name: "review",
  description: "Run AI code review on a task worktree",
  input: reviewInput,
  output: reviewOutput,
  requiresDaemon: false,
  handler: (_ctx, input) => executeReview(input),
})
