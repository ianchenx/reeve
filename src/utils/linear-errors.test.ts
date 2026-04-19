import { describe, expect, test } from "bun:test"
import { LinearError, classifyLinearError } from "./linear-errors"

describe("classifyLinearError", () => {
  test("network: LinearError with kind=network", () => {
    const err = new LinearError({ kind: "network", message: "fetch failed" })
    const info = classifyLinearError(err)

    expect(info.kind).toBe("network")
    expect(info.title).toContain("reach Linear")
    expect(info.hint.toLowerCase()).toMatch(/network|proxy|offline/)
  })

  test("auth: LinearError with kind=auth and status 401", () => {
    const err = new LinearError({ kind: "auth", status: 401, message: "Linear API error: 401" })
    const info = classifyLinearError(err)

    expect(info.kind).toBe("auth")
    expect(info.title.toLowerCase()).toContain("api key")
    expect(info.hint).toContain("https://linear.app/settings/account/security")
  })

  test("auth: LinearError with kind=auth and status 403", () => {
    const err = new LinearError({ kind: "auth", status: 403, message: "forbidden" })
    const info = classifyLinearError(err)

    expect(info.kind).toBe("auth")
    expect(info.hint.toLowerCase()).toMatch(/scope|permission|key/)
  })

  test("rate-limit: LinearError with kind=rate-limit and status 429", () => {
    const err = new LinearError({ kind: "rate-limit", status: 429, message: "Linear API error: 429" })
    const info = classifyLinearError(err)

    expect(info.kind).toBe("rate-limit")
    expect(info.title.toLowerCase()).toContain("rate")
    expect(info.hint.toLowerCase()).toMatch(/wait|retry|minute/)
  })

  test("server: LinearError with kind=server and 5xx status", () => {
    const err = new LinearError({ kind: "server", status: 503, message: "Linear API error: 503" })
    const info = classifyLinearError(err)

    expect(info.kind).toBe("server")
    expect(info.title.toLowerCase()).toMatch(/service|server|unavailable/)
    expect(info.hint.toLowerCase()).toMatch(/try again|status|later/)
  })

  test("graphql: LinearError with kind=graphql passes original message in hint", () => {
    const err = new LinearError({
      kind: "graphql",
      message: "Linear: team not found",
    })
    const info = classifyLinearError(err)

    expect(info.kind).toBe("graphql")
    expect(info.hint).toContain("team not found")
  })

  test("unknown: plain Error falls back to unknown", () => {
    const err = new Error("something weird")
    const info = classifyLinearError(err)

    expect(info.kind).toBe("unknown")
    expect(info.hint.toLowerCase()).toContain("reeve doctor")
  })

  test("unknown: non-Error value (string) does not crash", () => {
    const info = classifyLinearError("raw string failure")

    expect(info.kind).toBe("unknown")
    expect(info.title).toBeTruthy()
    expect(info.hint).toBeTruthy()
  })

  test("unknown: null/undefined does not crash", () => {
    const info = classifyLinearError(null)
    expect(info.kind).toBe("unknown")
    expect(info.title).toBeTruthy()
    expect(info.hint).toBeTruthy()
  })
})

describe("LinearError", () => {
  test("is an instance of Error (so existing catch blocks still work)", () => {
    const err = new LinearError({ kind: "auth", status: 401, message: "Linear API error: 401" })

    expect(err).toBeInstanceOf(Error)
    expect(err.message).toBe("Linear API error: 401")
    expect(err.kind).toBe("auth")
    expect(err.status).toBe(401)
  })

  test("String(err) returns a readable message (backward compatible)", () => {
    const err = new LinearError({ kind: "graphql", message: "Linear: bad variables" })

    expect(String(err)).toContain("Linear: bad variables")
  })
})
