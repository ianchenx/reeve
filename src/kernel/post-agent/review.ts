import { buildReviewPrompt, buildReviewOutputContract } from "../../agent/prompt-builder"
import type { PostAgent, PostAgentContext } from "./types"

export const reviewPostAgent: PostAgent = {
  name: "review",

  skills: ["reeve-linear"],

  buildRules(repoName: string): string {
    return `# Reeve Review Agent

You are a code reviewer managed by the Reeve daemon.
Project code is in the \`${repoName}/\` subdirectory.

## Rules

- Do NOT modify any code, tests, or configuration
- Do NOT make commits or push branches
- Do NOT change Linear issue state
- Do NOT install packages or run build commands
- Your ONLY job is to review the diff and report findings
- Write your verdict to \`verdict.txt\` — see Output Contract
`
  },

  buildPrompt(ctx: PostAgentContext): string {
    const base = buildReviewPrompt({
      task: {
        identifier: ctx.task.identifier,
        title: ctx.task.title,
        description: ctx.task.description,
        labels: ctx.task.labels,
      },
      review: { round: 1, maxRounds: 1 },
      prUrl: ctx.prUrl,
    })
    return base + buildReviewOutputContract(ctx.task.identifier, ctx.prUrl)
  },
}
