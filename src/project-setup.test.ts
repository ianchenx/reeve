import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { ensureWorkflowStates, linearGQL, type TeamFixture } from "./project-setup"
import { LinearError } from "./utils/linear-errors"

const TEAM: TeamFixture = { id: "team-1", key: "WOR", name: "Workflows" }

describe("linearGQL", () => {
  const originalFetch = globalThis.fetch
  beforeEach(() => { globalThis.fetch = originalFetch })
  afterEach(() => { globalThis.fetch = originalFetch })

  test("wraps fetch network failure as LinearError{kind:'network'}", async () => {
    globalThis.fetch = (async () => { throw new TypeError("fetch failed") }) as unknown as typeof fetch

    try {
      await linearGQL("lin_api_x", `query { viewer { name } }`)
      throw new Error("should have thrown")
    } catch (err) {
      expect(err).toBeInstanceOf(LinearError)
      expect((err as LinearError).kind).toBe("network")
    }
  })

  test("maps 401 to LinearError{kind:'auth', status:401}", async () => {
    globalThis.fetch = (async () => new Response("bad", { status: 401 })) as unknown as typeof fetch

    try {
      await linearGQL("lin_api_x", `query { viewer { name } }`)
      throw new Error("should have thrown")
    } catch (err) {
      expect(err).toBeInstanceOf(LinearError)
      expect((err as LinearError).kind).toBe("auth")
      expect((err as LinearError).status).toBe(401)
    }
  })

  test("maps 429 to LinearError{kind:'rate-limit'}", async () => {
    globalThis.fetch = (async () => new Response("slow down", { status: 429 })) as unknown as typeof fetch

    try {
      await linearGQL("lin_api_x", `query { viewer { name } }`)
      throw new Error("should have thrown")
    } catch (err) {
      expect((err as LinearError).kind).toBe("rate-limit")
    }
  })

  test("maps 503 to LinearError{kind:'server'}", async () => {
    globalThis.fetch = (async () => new Response("down", { status: 503 })) as unknown as typeof fetch

    try {
      await linearGQL("lin_api_x", `query { viewer { name } }`)
      throw new Error("should have thrown")
    } catch (err) {
      expect((err as LinearError).kind).toBe("server")
    }
  })

  test("maps GraphQL errors[] to LinearError{kind:'graphql'} carrying the first message", async () => {
    globalThis.fetch = (async () => new Response(JSON.stringify({
      errors: [{ message: "team not found" }],
    }), { status: 200 })) as unknown as typeof fetch

    try {
      await linearGQL("lin_api_x", `query { team(id: "x") { id } }`)
      throw new Error("should have thrown")
    } catch (err) {
      expect((err as LinearError).kind).toBe("graphql")
      expect((err as LinearError).message).toContain("team not found")
    }
  })
})

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
    }) as unknown as typeof fetch

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
    }) as unknown as typeof fetch

    const result = await ensureWorkflowStates("lin_api_test", TEAM)

    expect(result.created).toContain("In Review")
    expect(result.missing).toEqual([])
  })
})
