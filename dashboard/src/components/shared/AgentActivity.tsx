import { useMemo } from "react"
import {
  BookOpenIcon,
  PencilIcon,
  PlayIcon,
  BrainIcon,
  SearchIcon,
  PackageIcon,
  CheckCircleIcon,
  LoaderIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { DisplayEvent } from "@/types"

interface Props {
  events: DisplayEvent[]
  className?: string
  /** Show icon only (compact mode for small spaces) */
  compact?: boolean
}

interface Activity {
  icon: typeof BookOpenIcon
  verb: string
  target: string
  color: string
  iconColor: string
}

/**
 * Parses the latest event to derive what the agent is currently doing.
 */
function deriveActivity(events: DisplayEvent[]): Activity {
  if (events.length === 0) {
    return { icon: LoaderIcon, verb: "Starting", target: "", color: "text-muted-foreground", iconColor: "text-zinc-500" }
  }

  const latest = events[events.length - 1]

  if (latest.type === "thinking") {
    return { icon: BrainIcon, verb: "Thinking", target: "", color: "text-muted-foreground", iconColor: "text-purple-400" }
  }

  if (latest.type === "tool_result") {
    // Completed action — look for previous tool_call
    const prevCall = [...events].reverse().find(e => e.type === "tool_call")
    if (prevCall) {
      const parsed = parseToolCall(prevCall.text)
      return { ...parsed, verb: `Done ${parsed.verb.toLowerCase()}`, iconColor: "text-emerald-400" }
    }
    return { icon: CheckCircleIcon, verb: "Completed", target: latest.text, color: "text-emerald-400", iconColor: "text-emerald-400" }
  }

  if (latest.type === "tool_call") {
    return parseToolCall(latest.text)
  }

  return { icon: LoaderIcon, verb: "Working", target: "", color: "text-muted-foreground", iconColor: "text-zinc-500" }
}

function parseToolCall(text: string): Activity {
  const lower = text.toLowerCase()

  if (lower.startsWith("read ") || lower.includes("read")) {
    const target = text.replace(/^Read\s+/i, "")
    return { icon: BookOpenIcon, verb: "Reading", target, color: "text-blue-400", iconColor: "text-blue-400" }
  }
  if (lower.startsWith("edit ") || lower.includes("edit") || lower.includes("write")) {
    const target = text.replace(/^Edit\s+/i, "")
    return { icon: PencilIcon, verb: "Editing", target, color: "text-amber-400", iconColor: "text-amber-400" }
  }
  if (lower.startsWith("run ") || lower.includes("tsc") || lower.includes("test") || lower.includes("bun")) {
    const target = text.replace(/^Run\s+/i, "")
    return { icon: PlayIcon, verb: "Running", target, color: "text-emerald-400", iconColor: "text-emerald-400" }
  }
  if (lower.includes("search") || lower.includes("grep") || lower.includes("find")) {
    const target = text.replace(/^(Search|Grep|Find)\s+/i, "")
    return { icon: SearchIcon, verb: "Searching", target, color: "text-cyan-400", iconColor: "text-cyan-400" }
  }
  if (lower.includes("build") || lower.includes("package") || lower.includes("bundle")) {
    return { icon: PackageIcon, verb: "Building", target: "", color: "text-orange-400", iconColor: "text-orange-400" }
  }

  return { icon: PlayIcon, verb: "Running", target: text, color: "text-muted-foreground", iconColor: "text-blue-400" }
}

/**
 * AgentActivity — shows what an agent is currently doing with an animated icon.
 *
 * Full mode:  [icon] Reading src/orchestrator.ts
 * Compact mode: just the animated icon
 */
export function AgentActivity({ events, className, compact }: Props) {
  const activity = useMemo(() => deriveActivity(events), [events])
  const Icon = activity.icon

  if (compact) {
    return (
      <span title={`${activity.verb} ${activity.target}`} className={cn("inline-flex", className)}>
        <Icon
          className={cn(
            "h-3.5 w-3.5",
            activity.iconColor,
            activity.icon === BrainIcon && "animate-pulse",
            activity.icon === LoaderIcon && "animate-spin",
          )}
        />
      </span>
    )
  }

  return (
    <div className={cn("flex items-center gap-2 min-w-0", className)}>
      <Icon
        className={cn(
          "h-3.5 w-3.5 shrink-0",
          activity.iconColor,
          activity.icon === BrainIcon && "animate-pulse",
          activity.icon === LoaderIcon && "animate-spin",
        )}
      />
      <span className="text-[11px] text-muted-foreground truncate">
        <span className={cn("font-medium", activity.color)}>{activity.verb}</span>
        {activity.target && (
          <span className="ml-1 font-mono opacity-70">{activity.target}</span>
        )}
      </span>
    </div>
  )
}
