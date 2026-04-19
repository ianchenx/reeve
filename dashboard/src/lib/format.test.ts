import { describe, expect, test } from "bun:test"
import { getCostUsd, getDisplayTokenBreakdown, getEffectiveInputTokens } from "./format"

describe("getEffectiveInputTokens", () => {
  test("subtracts cache read tokens from input tokens", () => {
    expect(
      getEffectiveInputTokens({
        input: 805775,
        cacheRead: 777472,
      }),
    ).toBe(28303)
  })

  test("falls back to raw input when there is no cache read value", () => {
    expect(
      getEffectiveInputTokens({
        input: 28000,
      }),
    ).toBe(28000)
  })
})

describe("getDisplayTokenBreakdown", () => {
  test("only returns input and output for page display", () => {
    expect(
      getDisplayTokenBreakdown({
        input: 805775,
        output: 10180,
        cacheRead: 777472,
        total: 815955,
      }),
    ).toEqual({
      input: 28303,
      output: 10180,
    })
  })
})

describe("getCostUsd", () => {
  test("reads costUsd from the tokensUsed object", () => {
    expect(getCostUsd({ input: 1, output: 2, total: 3, costUsd: 0.42 })).toBe(0.42)
  })

  test("returns null when costUsd is missing", () => {
    expect(getCostUsd({ input: 1, output: 2, total: 3 })).toBeNull()
  })

  test("returns null for legacy number-only tokensUsed", () => {
    expect(getCostUsd(42)).toBeNull()
  })

  test("returns null for nullish tokensUsed", () => {
    expect(getCostUsd(null)).toBeNull()
    expect(getCostUsd(undefined)).toBeNull()
  })
})
