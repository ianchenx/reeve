import { isAbsolute, relative, resolve } from "path"

export const REEVE_DIR = process.env.REEVE_DIR || resolve(process.env.HOME || "/tmp", ".reeve")

export const LOGS_DIR = resolve(REEVE_DIR, "logs")

export const TASKS_DIR = resolve(REEVE_DIR, "tasks")

export function sanitizeTaskIdentifier(identifier: string): string {
  return identifier
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}

export function isPathWithinRoot(root: string, candidate: string): boolean {
  const rel = relative(resolve(root), resolve(candidate))
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))
}

/** Root directory for a task: ~/.reeve/tasks/{sanitized-id}/ */
export function taskDir(identifier: string): string {
  return resolve(TASKS_DIR, sanitizeTaskIdentifier(identifier))
}

/** Log dir for an agent: ~/.reeve/tasks/{id}/{agentName}/ */
export function taskLogDir(identifier: string, agentName = "implement"): string {
  return resolve(taskDir(identifier), agentName)
}

