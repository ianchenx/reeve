export type LinearErrorKind =
  | "network"
  | "auth"
  | "rate-limit"
  | "server"
  | "graphql"
  | "unknown"

interface LinearErrorInit {
  kind: LinearErrorKind
  message: string
  status?: number
  cause?: unknown
}

export class LinearError extends Error {
  readonly kind: LinearErrorKind
  readonly status?: number

  constructor(init: LinearErrorInit) {
    super(init.message, init.cause ? { cause: init.cause } : undefined)
    this.name = "LinearError"
    this.kind = init.kind
    this.status = init.status
  }
}

export interface ClassifiedLinearError {
  kind: LinearErrorKind
  title: string
  hint: string
}

const LINEAR_KEY_URL = "https://linear.app/settings/account/security"

export function classifyLinearError(err: unknown): ClassifiedLinearError {
  if (err instanceof LinearError) {
    return classifyKnown(err)
  }

  return {
    kind: "unknown",
    title: "Unexpected error talking to Linear",
    hint: `Run reeve doctor to check your environment, or retry with REEVE_DEBUG=1.`,
  }
}

function classifyKnown(err: LinearError): ClassifiedLinearError {
  switch (err.kind) {
    case "network":
      return {
        kind: "network",
        title: "Cannot reach Linear",
        hint: "Check your network/proxy. If you're offline, reconnect and retry.",
      }
    case "auth":
      return {
        kind: "auth",
        title: err.status === 403
          ? "Linear API key lacks required permissions"
          : "Linear API key rejected",
        hint: err.status === 403
          ? `Generate a key with read+write scope at ${LINEAR_KEY_URL}`
          : `Get a fresh key at ${LINEAR_KEY_URL} and re-run reeve init.`,
      }
    case "rate-limit":
      return {
        kind: "rate-limit",
        title: "Linear API rate limit hit",
        hint: "Wait a minute and retry. Linear throttles per-key.",
      }
    case "server":
      return {
        kind: "server",
        title: "Linear service error (unavailable)",
        hint: "Try again later. Check https://status.linear.app for incidents.",
      }
    case "graphql":
      return {
        kind: "graphql",
        title: "Linear rejected the request",
        hint: err.message,
      }
    default:
      return {
        kind: "unknown",
        title: "Unexpected Linear error",
        hint: "Run reeve doctor to check your environment.",
      }
  }
}
