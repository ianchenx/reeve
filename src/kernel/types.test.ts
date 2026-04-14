// types.test.ts — Exhaustive transition table tests
import { describe, it, expect } from "bun:test"
import { canTransition, assertTransition, type TaskState } from "./types"

const ALL_STATES: TaskState[] = ["queued", "active", "published", "done"]

describe("canTransition", () => {
  // Valid transitions
  const valid: [TaskState, TaskState][] = [
    ["queued", "active"],
    ["queued", "done"],
    ["active", "published"],
    ["active", "queued"],   // retry path
    ["active", "done"],
    ["published", "active"],  // rework/land path
    ["published", "done"],
  ]

  for (const [from, to] of valid) {
    it(`allows ${from} → ${to}`, () => {
      expect(canTransition(from, to)).toBe(true)
    })
  }

  // Invalid transitions (everything not in valid list)
  const validSet = new Set(valid.map(([f, t]) => `${f}->${t}`))
  for (const from of ALL_STATES) {
    for (const to of ALL_STATES) {
      if (from === to) continue
      if (validSet.has(`${from}->${to}`)) continue
      it(`blocks ${from} → ${to}`, () => {
        expect(canTransition(from, to)).toBe(false)
      })
    }
  }

  it("blocks self-transitions", () => {
    for (const s of ALL_STATES) {
      expect(canTransition(s, s)).toBe(false)
    }
  })
})

describe("assertTransition", () => {
  it("throws on invalid transition", () => {
    expect(() => assertTransition("done", "queued")).toThrow("Invalid state transition")
  })

  it("does not throw on valid transition", () => {
    expect(() => assertTransition("queued", "active")).not.toThrow()
  })
})
