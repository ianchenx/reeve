import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { ensureWorkflowStates, type TeamFixture } from "./project-setup"

const TEAM: TeamFixture = { id: "team-1", key: "WOR", name: "Workflows" }

describe("ensureWorkflowStates", () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    globalThis.fetch = originalFetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test("reports state as missing when Linear returns success=false without errors", async () => {
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const body = typeof init?.body === "string" ? init.body : ""
      if (body.includes("team(id:")) {
        return new Response(JSON.stringify({
          data: {
            team: {
              states: {
                nodes: [
                  { id: "s1", name: "Todo", type: "unstarted" },
                  { id: "s2", name: "In Progress", type: "started" },
                ],
              },
            },
          },
        }))
      }
      if (body.includes("workflowStateCreate")) {
        return new Response(JSON.stringify({
          data: { workflowStateCreate: { success: false, workflowState: null } },
        }))
      }
      return new Response(JSON.stringify({ data: {} }))
    }) as typeof fetch

    const result = await ensureWorkflowStates("lin_api_test", TEAM)

    expect(result.created).not.toContain("In Review")
    expect(result.missing.map(m => m.name)).toContain("In Review")
  })

  test("reports state as created when Linear returns success=true", async () => {
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const body = typeof init?.body === "string" ? init.body : ""
      if (body.includes("team(id:")) {
        return new Response(JSON.stringify({
          data: {
            team: {
              states: {
                nodes: [
                  { id: "s1", name: "Todo", type: "unstarted" },
                  { id: "s2", name: "In Progress", type: "started" },
                ],
              },
            },
          },
        }))
      }
      if (body.includes("workflowStateCreate")) {
        return new Response(JSON.stringify({
          data: { workflowStateCreate: { success: true, workflowState: { id: "s3", name: "In Review", type: "started" } } },
        }))
      }
      return new Response(JSON.stringify({ data: {} }))
    }) as typeof fetch

    const result = await ensureWorkflowStates("lin_api_test", TEAM)

    expect(result.created).toContain("In Review")
    expect(result.missing).toEqual([])
  })
})
