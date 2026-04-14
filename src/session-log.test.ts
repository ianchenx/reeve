import { afterEach, describe, expect, test } from "bun:test"

import { parseSessionNdjson } from "./session-log"

const originalWarn = console.warn

let warnings: unknown[][] = []

afterEach((): void => {
  console.warn = originalWarn
  warnings = []
})

function mockWarnings(): void {
  warnings = []
  console.warn = ((...args: unknown[]): void => {
    warnings.push(args)
  }) as typeof console.warn
}

describe("session-log", () => {
  test("skips invalid ndjson lines without crashing", (): void => {
    mockWarnings()

    const events = parseSessionNdjson(
      '{"jsonrpc":"2.0","method":"session/update"}\nnot json\n{"_type":"exit","code":0}\n',
      "/tmp/session.ndjson",
    )

    expect(events).toHaveLength(2)
    expect((events[0] as { method?: string }).method).toBe("session/update")
    expect((events[1] as { _type?: string })._type).toBe("exit")
    expect(warnings).toHaveLength(1)
    expect(String(warnings[0][0])).toContain("[session-log] Skipping invalid JSON line 2")
  })

  test("caps by non-empty lines even when file ends with trailing newline", (): void => {
    const events = parseSessionNdjson(
      '{"id":1}\n{"id":2}\n{"id":3}\n',
      "/tmp/session.ndjson",
      2,
    )

    expect(events).toEqual([{ id: 2 }, { id: 3 }])
  })
})
