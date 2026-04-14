import type { Task } from "../types"

export interface PostAgentContext {
  task: Task
  prUrl?: string
  prior: PostAgentResult[]
}

export interface PostAgent {
  name: string
  buildPrompt(ctx: PostAgentContext): string
  buildRules(repoName: string): string
  skills?: string[]
}

export interface PostAgentResult {
  agent: string
  exitCode: number
}

export interface PostChainResult {
  verdict: "pass" | "fail"
  failedAt?: string
  results: PostAgentResult[]
}
