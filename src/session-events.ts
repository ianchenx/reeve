// session-events.ts — Normalize raw NDJSON events into a canonical SessionEvent format.
// Handles both Claude (type-based) and Codex (JSON-RPC method-based) formats.
// Frontend receives pre-normalized data — no parsing needed.

export interface SessionEvent {
  type: "thinking" | "tool_call" | "tool_result" | "usage" | "approval" | "exit" | "result" | "other"
  text: string
  status?: string  // "running", "completed", "failed"
  tokens?: number
  time?: string
  rawData?: Record<string, unknown>
}

function shortenPath(p: string): string {
  const parts = p.split("/")
  return parts.length > 2 ? parts.slice(-2).join("/") : p
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "…" : s
}

/** Extract a human-readable one-liner from a Claude tool_use block. */
function summarizeTool(name: string, input: Record<string, unknown>): string {
  // Skill → "reeve-commit" or "reeve-linear TES-32"
  if (input.skill) {
    const args = input.args ? ` ${input.args}` : ""
    return `${input.skill}${truncate(String(args), 60)}`
  }

  // Bash → prefer description over command
  if (input.description) return truncate(String(input.description), 100)
  if (input.command) return truncate(String(input.command), 100)

  // File tools → shortened path
  if (input.file_path) return shortenPath(String(input.file_path))

  // MCP tools — strip prefix, show "server: action"
  if (name.startsWith("mcp__")) {
    const parts = name.split("__")
    if (parts.length >= 3) return `${parts[1]}: ${parts.slice(2).join("/")}`
    return name
  }

  // Search tools
  if (input.pattern) return truncate(String(input.pattern), 80)
  if (input.query) return truncate(String(input.query), 80)
  if (input.url) return truncate(String(input.url), 80)

  // Agent tool
  if (input.description) return truncate(String(input.description), 80)
  if (input.prompt) return truncate(String(input.prompt), 80)

  return name
}

function eventTime(...candidates: Array<Record<string, unknown> | undefined>): string {
  for (const c of candidates) {
    if (!c) continue
    const at = c.at
    if (typeof at === "string") return at
  }
  return ""
}

export function parseSessionEvents(raw: unknown[]): SessionEvent[] {
  const result: SessionEvent[] = []
  let lastToolCallTitle = ""
  let lastEmittedUsageTokens = 0

  /** Count non-usage events since the last usage event in result. */
  const eventsSinceLastUsage = () => {
    let count = 0
    for (let i = result.length - 1; i >= 0; i--) {
      if (result[i].type === "usage") break
      count++
    }
    return count
  }

  for (const item of raw) {
    const ev = item as Record<string, unknown>
    // ── Exit record ──
    if (ev._type === "exit") {
      const code = ev.code ?? "?"
      result.push({
        type: "exit",
        text: `Process exited with code ${code}`,
        time: eventTime(ev),
      })
      continue
    }

    // ── Claude Native Format ──

    if (ev.type === "system") {
      // init, hook_started, hook_response, task_started — skip, no display value
      continue
    }

    if (ev.type === "rate_limit_event") {
      continue
    }

    if (ev.type === "result") {
      const resultText = typeof ev.result === "string" ? ev.result : ""
      const durationMs = typeof ev.duration_ms === "number" ? ev.duration_ms : undefined
      const turns = typeof ev.num_turns === "number" ? ev.num_turns : undefined
      const parts: string[] = []
      if (durationMs !== undefined) parts.push(`${(durationMs / 1000).toFixed(1)}s`)
      if (turns !== undefined) parts.push(`${turns} turns`)
      const suffix = parts.length > 0 ? ` (${parts.join(", ")})` : ""
      if (resultText) {
        result.push({
          type: "result",
          text: resultText.replace(/\n/g, " ").slice(0, 2000) + suffix,
          time: eventTime(ev),
        })
      }
      continue
    }

    if (ev.type === "assistant") {
      const message = ev.message as Record<string, unknown> | undefined
      if (message?.content && Array.isArray(message.content)) {
        for (const block of message.content) {
          if (block.type === "thinking") {
            const text = block.thinking || block.text || ""
            if (!text) continue
            const chunk = typeof text === "string" ? text.replace(/\n/g, " ") : String(text)
            const last = result[result.length - 1]
            if (last && last.type === "thinking") {
              last.text = (last.text + " " + chunk).slice(-2000)
            } else {
              result.push({ type: "thinking", text: chunk, time: eventTime(ev) })
            }
          } else if (block.type === "text") {
            const text = block.text || ""
            if (!text) continue
            const chunk = typeof text === "string" ? text.replace(/\n/g, " ") : String(text)
            const last = result[result.length - 1]
            if (last && last.type === "other") {
              last.text = (last.text + " " + chunk).slice(-4000)
            } else {
              result.push({ type: "other", text: chunk, time: eventTime(ev) })
            }
          } else if (block.type === "tool_use") {
            const toolName = (block.name as string) || "(tool)"
            const input = (block.input ?? {}) as Record<string, unknown>
            const summary = summarizeTool(toolName, input)
            lastToolCallTitle = summary
            result.push({
              type: "tool_call",
              text: summary,
              status: "running",
              time: eventTime(ev),
              rawData: block as Record<string, unknown>,
            })
          }
        }
      }
      if (message?.usage) {
        const usage = message.usage as Record<string, unknown>
        const total = (Number(usage.input_tokens) || 0) + (Number(usage.output_tokens) || 0)
        if (total > 0) {
          // Claude emits usage on every assistant turn — throttle to reduce noise.
          // Emit only when tokens changed >20% or >3 content events since last usage.
          const delta = lastEmittedUsageTokens > 0
            ? Math.abs(total - lastEmittedUsageTokens) / lastEmittedUsageTokens
            : 1
          if (delta > 0.2 || eventsSinceLastUsage() > 3) {
            result.push({
              type: "usage",
              text: `Tokens: ${total.toLocaleString()}`,
              tokens: total,
              time: eventTime(ev),
            })
            lastEmittedUsageTokens = total
          }
        }
      }
      continue
    }

    if (ev.type === "user") {
      const message = ev.message as Record<string, unknown> | undefined
      if (message?.content && Array.isArray(message.content)) {
        for (const block of message.content) {
          if (block.type === "tool_result") {
            const status = block.is_error ? "failed" : "completed"
            // Update matching tool_call in-place (like Codex) instead of a separate row
            const matchIdx = result.findLastIndex( e => e.type === "tool_call" && e.status === "running")
            if (matchIdx >= 0) {
              result[matchIdx].status = status
              result[matchIdx].rawData = { ...result[matchIdx].rawData, result: block }
            }
          }
        }
      }
      continue
    }

    // ── Codex & ACPX Format (JSON-RPC) ──

    const method = ev.method as string
    const params = ev.params as Record<string, unknown> | undefined
    if (!method || !params) continue

    if (method === "item/started") {
      const item = params.item as Record<string, unknown> | undefined
      const itemType = item?.type as string | undefined
      if (itemType === "commandExecution" || itemType === "command_execution") {
        const cmd = String(item?.command ?? "").replace(/^\/bin\/\w+\s+-\w+\s+'?/, "").replace(/'$/, "")
        const title = cmd.length > 80 ? cmd.slice(0, 80) + "…" : cmd || "bash"
        lastToolCallTitle = title
        result.push({ type: "tool_call", text: title, status: "running", time: eventTime(ev), rawData: item as Record<string, unknown> })
      } else if (itemType === "fileChange" || itemType === "file_change") {
        const changes = item?.changes as Array<{ path?: string }> | undefined
        const path = changes?.[0]?.path?.split("/").pop() ?? "edit"
        lastToolCallTitle = `edit: ${path}`
        result.push({ type: "tool_call", text: `edit: ${path}`, status: "running", time: eventTime(ev), rawData: item as Record<string, unknown> })
      } else if (itemType === "reasoning") {
        const content = String(item?.content ?? item?.summary ?? "")
        if (content) {
          const chunk = content.replace(/\n/g, " ").slice(0, 500)
          const last = result[result.length - 1]
          if (last && last.type === "thinking") {
            last.text = (last.text + " " + chunk).slice(-2000)
          } else {
            result.push({ type: "thinking", text: chunk, time: eventTime(ev) })
          }
        }
      }
      continue
    }

    if (method === "item/completed") {
      const item = params.item as Record<string, unknown> | undefined
      const itemType = item?.type as string | undefined
      if (itemType === "commandExecution" || itemType === "command_execution") {
        const code = Number(item?.exitCode ?? item?.exit_code ?? 0)
        const status = code === 0 ? "completed" : "failed"
        const matchIdx = result.findLastIndex( e => e.type === "tool_call" && e.status === "running")
        if (matchIdx >= 0) {
          result[matchIdx].status = status
          result[matchIdx].rawData = { ...result[matchIdx].rawData, exitCode: code, aggregatedOutput: String(item?.aggregatedOutput ?? "").slice(0, 500) }
        }
      } else if (itemType === "fileChange" || itemType === "file_change") {
        const matchIdx = result.findLastIndex( e => e.type === "tool_call" && e.status === "running")
        if (matchIdx >= 0) {
          result[matchIdx].status = "completed"
        }
      }
      continue
    }

    if (method === "item/agentMessage/delta") {
      const delta = params.delta as string
      if (delta) {
        const chunk = delta.replace(/\n/g, " ")
        const last = result[result.length - 1]
        if (last && last.type === "other") {
          last.text = (last.text + chunk).slice(-4000)
        } else {
          result.push({ type: "other", text: chunk, time: eventTime(ev) })
        }
      }
      continue
    }

    if (method === "thread/tokenUsage/updated" || method === "turn/completed") {
      // Codex nests usage under params.tokenUsage.total (camelCase) or params.usage (snake_case)
      const tokenUsage = params.tokenUsage as Record<string, unknown> | undefined
      const bucket = tokenUsage?.total as Record<string, unknown> | undefined
        ?? tokenUsage?.last as Record<string, unknown> | undefined
      const usage = bucket ?? (params.usage as Record<string, unknown> | undefined) ?? params
      const total = Number(usage?.totalTokens) || Number(usage?.total_tokens) || Number(usage?.total)
        || ((Number(usage?.inputTokens) || Number(usage?.input_tokens) || 0) + (Number(usage?.outputTokens) || Number(usage?.output_tokens) || 0))
      if (total > 0) {
        const delta = lastEmittedUsageTokens > 0
          ? Math.abs(total - lastEmittedUsageTokens) / lastEmittedUsageTokens
          : 1
        if (delta > 0.2 || eventsSinceLastUsage() > 3) {
          result.push({ type: "usage", text: `Tokens: ${total.toLocaleString()}`, tokens: total, time: eventTime(ev) })
          lastEmittedUsageTokens = total
        }
      }
      continue
    }

    if (method === "session/update") {
      const update = params.update as Record<string, unknown> | undefined
      if (!update) continue
      const sessionUpdate = update.sessionUpdate as string

      switch (sessionUpdate) {
        case "agent_message_chunk": {
          const contentObj = update.content as Record<string, unknown> | undefined
          const text = contentObj?.text as string
          if (!text) break
          const contentType = contentObj?.type as string | undefined
          const chunk = text.replace(/\n/g, " ")
          const time = eventTime(update, ev)

          if (contentType === "thinking") {
            const last = result[result.length - 1]
            if (last && last.type === "thinking") {
              last.text = (last.text + chunk).slice(-2000)
            } else {
              result.push({ type: "thinking", text: chunk, time })
            }
          } else {
            const last = result[result.length - 1]
            if (last && last.type === "other") {
              last.text = (last.text + chunk).slice(-2000)
            } else {
              result.push({ type: "other", text: chunk, time })
            }
          }
          break
        }
        case "tool_call": {
          const title = (update.title as string) || "(tool)"
          lastToolCallTitle = title
          result.push({
            type: "tool_call",
            text: title,
            status: "completed",
            time: eventTime(update, ev),
            rawData: update as Record<string, unknown>,
          })
          break
        }
        case "tool_call_update": {
          const status = update.status as string
          if (status !== "completed" && status !== "failed") break
          const title = (update.title as string) || lastToolCallTitle || "(tool)"
          const matchIdx = result.findLastIndex(
            (sessionEvent) =>
              sessionEvent.type === "tool_call"
              && (sessionEvent.text === title || sessionEvent.text === lastToolCallTitle),
          )
          if (matchIdx >= 0) {
            result[matchIdx].status = status
            const existing = result[matchIdx].rawData || {}
            result[matchIdx].rawData = { ...existing, result: update }
          } else {
            result.push({
              type: "tool_result",
              text: title,
              status,
              time: eventTime(update, ev),
              rawData: update as Record<string, unknown>,
            })
          }
          break
        }
        case "usage_update": {
          const tokens = update.totalTokens as number
          if (typeof tokens === "number" && Number.isFinite(tokens)) {
            const delta = lastEmittedUsageTokens > 0
              ? Math.abs(tokens - lastEmittedUsageTokens) / lastEmittedUsageTokens
              : 1
            if (delta > 0.2 || eventsSinceLastUsage() > 3) {
              result.push({
                type: "usage",
                text: `Tokens: ${tokens.toLocaleString()}`,
                tokens,
                time: eventTime(update, ev),
              })
              lastEmittedUsageTokens = tokens
            }
          }
          break
        }
      }
    } else if (method === "session/request_permission") {
      const toolCall = params.toolCall as Record<string, unknown> | undefined
      result.push({
        type: "approval",
        text: (toolCall?.title as string) || "permission required",
        time: eventTime(params, ev),
        rawData: params as Record<string, unknown>,
      })
    }

  }

  return result
}
