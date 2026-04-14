import type { TaskEntry } from "@/types"
import { ModelAvatar } from "@/components/shared/ModelAvatar"
import { cn } from "@/lib/utils"
import { getTaskAgent } from "@/lib/task-entry"

interface Props {
  process: TaskEntry
  selected: boolean
  onSelect: () => void
}

const dotColor: Record<string, string> = {
  active: "bg-emerald-400",
}

/**
 * Tiny horizontal pill for top-bar agent selection (Bento + CommandCenter layouts).
 */
export function AgentPill({ process, selected, onSelect }: Props) {
  if (process.state !== "active") return null

  return (
    <button
      onClick={onSelect}
      className={cn(
        "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition-colors cursor-pointer",
        "hover:bg-muted/60",
        selected && "bg-muted text-foreground",
        !selected && "text-muted-foreground"
      )}
    >
      <ModelAvatar model={getTaskAgent(process)} size="sm" />
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full shrink-0",
          dotColor[process.state] ?? "bg-zinc-600",
        )}
      />
      <span className="font-mono text-[12px]">{process.identifier}</span>
    </button>
  )
}
