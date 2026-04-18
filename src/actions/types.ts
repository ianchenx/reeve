// actions/types.ts — Action registry types

import { z } from "zod"
import type { Kernel } from "../kernel/kernel"
import type { ReeveDaemonConfig } from "../config"

// ── Action context (dependency injection) ─────────────────────

export interface ActionContext {
  kernel?: Kernel              // Only available when daemon is running
  config: ReeveDaemonConfig
  projects: Array<{ slug: string; repo: string }>
  /**
   * Optional hook to activate (start) the kernel. Called by actions such as
   * projectImport when the first project is added. Only provided by HTTP
   * callers in daemon mode — CLI / tests pass undefined.
   */
  onActivate?: () => Promise<void>
}

// ── Action definition ─────────────────────────────────────────

export interface ActionDef<I = unknown, O = unknown> {
  name: string
  description: string          // Short, agent-readable
  input: z.ZodType<I>
  output: z.ZodType<O>
  requiresDaemon: boolean
  handler: (ctx: ActionContext, input: I) => Promise<O>
}

// ── Result wrapper ────────────────────────────────────────────

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: "NOT_FOUND" | "DAEMON_NOT_RUNNING" | "VALIDATION_ERROR" | "INTERNAL" }
