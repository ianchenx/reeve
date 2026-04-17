import { describe, expect, test } from "bun:test"

import { parseSessionNdjson } from "./session-log"

describe("session-log", () => {
  test("skips invalid ndjson lines without crashing", (): void => {
    const events = parseSessionNdjson(
      '{"jsonrpc":"2.0","method":"session/update"}\nnot json\n{"_type":"exit","code":0}\n',
      "/tmp/session.ndjson",
    )

    expect(events).toHaveLength(2)
    expect((events[0] as { method?: string }).method).toBe("session/update")
    expect((events[1] as { _type?: string })._type).toBe("exit")
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
