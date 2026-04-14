import { cn } from "@/lib/utils"
import { LoaderIcon } from "lucide-react"

type DiffState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; diff: string }
  | { status: "error"; error: string }

interface Props {
  state: DiffState
  filePath: string | null
}

/**
 * Pure display — renders a unified diff with add/remove coloring.
 * Receives diff state from parent, doesn't fetch.
 */
export function DiffViewer({ state, filePath }: Props) {
  if (state.status === "idle" || !filePath) {
    return (
      <p className="text-[11px] text-muted-foreground italic">
        Select a file to view diff
      </p>
    )
  }

  if (state.status === "loading") {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
        <LoaderIcon className="h-3 w-3 animate-spin" />
        Loading diff…
      </div>
    )
  }

  if (state.status === "error") {
    return <p className="text-xs text-destructive">{state.error}</p>
  }

  const { diff } = state
  if (!diff) {
    return <p className="text-[11px] text-muted-foreground italic">No changes</p>
  }

  const lines = diff.split("\n")

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="px-3 py-1.5 border-b bg-muted/30">
        <span className="text-[11px] font-mono text-muted-foreground">{filePath}</span>
      </div>
      <pre className="text-[11px] leading-[1.6] font-mono overflow-x-hidden whitespace-pre-wrap break-all p-0 m-0">
        {lines.map((line, i) => {
          const key = `${i}-${line.slice(0, 20)}`
          return (
            <div
              key={key}
              className={cn(
                "px-3",
                line.startsWith("+") && !line.startsWith("+++")
                  ? "bg-green-500/10 text-green-400"
                  : line.startsWith("-") && !line.startsWith("---")
                    ? "bg-red-500/10 text-red-400"
                    : line.startsWith("@@")
                      ? "bg-blue-500/10 text-blue-400"
                      : "text-muted-foreground"
              )}
            >
              {line}
            </div>
          )
        })}
      </pre>
    </div>
  )
}
