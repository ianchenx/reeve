// actions/registry.ts — Action registry: register, discover, execute

import type { ActionDef, ActionContext, ActionResult } from "./types"

const registry = new Map<string, ActionDef>()

/**
 * Register an action. Idempotent — re-registering overwrites.
 */
export function registerAction<I, O>(def: ActionDef<I, O>): void {
  registry.set(def.name, def as ActionDef)
}

/**
 * Get a registered action by name.
 */
export function getAction(name: string): ActionDef | undefined {
  return registry.get(name)
}

/**
 * List all registered actions (for `reeve actions` and introspection).
 */
export function listActions(): Array<{ name: string; description: string; requiresDaemon: boolean }> {
  return Array.from(registry.values())
    .map(a => ({ name: a.name, description: a.description, requiresDaemon: a.requiresDaemon }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Execute an action by name.
 * Validates daemon requirement and input schema before calling handler.
 */
export async function executeAction<O = unknown>(
  ctx: ActionContext,
  name: string,
  rawInput: unknown,
): Promise<ActionResult<O>> {
  const action = registry.get(name)
  if (!action) {
    return { ok: false, error: `Unknown action: ${name}`, code: "NOT_FOUND" }
  }

  // Check daemon requirement
  if (action.requiresDaemon && !ctx.kernel) {
    return { ok: false, error: "Daemon is not running", code: "DAEMON_NOT_RUNNING" }
  }

  // Validate input
  const parsed = action.input.safeParse(rawInput)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.message, code: "VALIDATION_ERROR" }
  }

  try {
    const data = await action.handler(ctx, parsed.data) as O
    return { ok: true, data }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err), code: "INTERNAL" }
  }
}
