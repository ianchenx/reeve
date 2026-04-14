import { writeFileSync } from "fs"
import { resolve } from "path"

import type { ReeveDaemonConfig } from "../config"
import type { SandboxHandle } from "./backend"

const LINEAR_ENDPOINT = "https://api.linear.app/graphql"

export async function prepareClaudeSandbox(
  workDir: string,
  config: ReeveDaemonConfig,
): Promise<SandboxHandle> {
  const apiKey = config.linear?.apiKey
  if (!apiKey) return {}

  // Write .mcp.json to agent's CWD — Claude auto-discovers it there.
  writeFileSync(
    resolve(workDir, ".mcp.json"),
    JSON.stringify(
      {
        mcpServers: {
          "reeve-linear": {
            command: "npx",
            args: ["-y", "mcp-graphql"],
            env: {
              ENDPOINT: LINEAR_ENDPOINT,
              ALLOW_MUTATIONS: "true",
              HEADERS: JSON.stringify({ Authorization: apiKey }),
            },
          },
        },
      },
      null,
      2,
    ),
  )

  return {}
}
