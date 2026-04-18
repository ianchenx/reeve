import { describe, expect, test } from "bun:test"
import { getDisplayTokenBreakdown, getEffectiveInputTokens } from "./format"

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
