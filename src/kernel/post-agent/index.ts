import type { PostAgent } from "./types"
import { reviewPostAgent } from "./review"

const registry = new Map<string, PostAgent>([
  ["review", reviewPostAgent],
])

export function resolvePostAgents(names: string[]): PostAgent[] {
  return names.map(name => {
    const agent = registry.get(name)
    if (!agent) throw new Error(`Unknown post-agent: ${name}`)
    return agent
  })
}

export { runPostAgents } from "./runner"
export type { PostAgent, PostAgentResult, PostChainResult } from "./types"
