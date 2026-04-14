import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { FileIcon, FilePlusIcon, FileMinusIcon, FileEditIcon, ChevronRightIcon, Loader2Icon } from "lucide-react"
import { useFileDiff } from "@/hooks/useFileDiff"
import { cn } from "@/lib/utils"

interface FileChange {
  status: string
  file: string
}

interface Props {
  changedFiles?: FileChange[]
  diffStat?: string | null
  /** Issue identifier (e.g. WOR-42) — needed to fetch file diffs */
  identifier?: string
}

function statusIcon(status: string) {
  switch (status.trim()) {
    case "A": case "??": return <FilePlusIcon className="h-3.5 w-3.5 text-status-success" />
    case "D": return <FileMinusIcon className="h-3.5 w-3.5 text-status-error" />
    case "M": case "MM": return <FileEditIcon className="h-3.5 w-3.5 text-primary" />
    default: return <FileIcon className="h-3.5 w-3.5 text-muted-foreground" />
  }
}

function statusLabel(status: string) {
  switch (status.trim()) {
    case "A": case "??": return "added"
    case "D": return "deleted"
    case "M": case "MM": return "modified"
    case "R": return "renamed"
    default: return status
  }
}

/* ── Diff line rendering ─── */
function DiffBlock({ diff }: { diff: string }) {
  const lines = diff.split("\n")
  return (
    <div className="bg-muted/20 border-t overflow-x-auto">
      <pre className="text-[11px] font-mono leading-relaxed">
        {lines.map((line, i) => {
          const isAdd = line.startsWith("+") && !line.startsWith("+++")
          const isDel = line.startsWith("-") && !line.startsWith("---")
          const isHunk = line.startsWith("@@")
          const isHeader = line.startsWith("---") || line.startsWith("+++")
          return (
            <div
              key={i}
              className={cn(
                "px-4 py-0",
                isAdd && "bg-emerald-500/10 text-emerald-400",
                isDel && "bg-red-500/10 text-red-400",
                isHunk && "bg-primary/5 text-primary/60",
                isHeader && "text-muted-foreground/40",
                !isAdd && !isDel && !isHunk && !isHeader && "text-foreground/60",
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

/* ── Expandable file row ─── */
function FileRow({ change, identifier }: { change: FileChange; identifier?: string }) {
  const [expanded, setExpanded] = useState(false)
  const diffState = useFileDiff(identifier ?? "", expanded ? change.file : null)

  const canExpand = !!identifier

  return (
    <div>
      <button
        type="button"
        onClick={() => canExpand && setExpanded(e => !e)}
        className={cn(
          "w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors min-w-0",
          canExpand ? "hover:bg-accent/30 cursor-pointer" : "",
          expanded && "bg-accent/20",
        )}
      >
        {canExpand && (
          <ChevronRightIcon className={cn(
            "h-3 w-3 text-muted-foreground/40 transition-transform shrink-0",
            expanded && "rotate-90",
          )} />
        )}
        {statusIcon(change.status)}
        <span className="font-mono truncate flex-1 text-left min-w-0">{change.file}</span>
        <span className="text-muted-foreground shrink-0">{statusLabel(change.status)}</span>
      </button>

      {expanded && (
        <div>
          {diffState.status === "loading" && (
            <div className="flex items-center gap-2 px-5 py-3 text-xs text-muted-foreground bg-muted/10">
              <Loader2Icon className="h-3 w-3 animate-spin" /> Loading diff…
            </div>
          )}
          {diffState.status === "ready" && <DiffBlock diff={diffState.diff} />}
          {diffState.status === "error" && (
            <div className="px-5 py-3 text-xs text-destructive/60 bg-destructive/5">
              {diffState.error}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function FileChanges({ changedFiles, diffStat, identifier }: Props) {
  if ((!changedFiles || changedFiles.length === 0) && !diffStat) {
    return null
  }

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b">
        <h3 className="text-sm font-medium">File Changes</h3>
        {changedFiles && (
          <Badge variant="secondary" className="text-[11px]">
            {changedFiles.length} file{changedFiles.length !== 1 ? "s" : ""}
          </Badge>
        )}
      </div>

      {changedFiles && changedFiles.length > 0 && (
        <div className="divide-y max-h-[500px] overflow-y-auto">
          {changedFiles.map((change, i) => (
            <FileRow key={i} change={change} identifier={identifier} />
          ))}
        </div>
      )}

      {diffStat && (
        <div className="px-5 py-3 border-t bg-muted/30">
          <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap leading-relaxed">{diffStat}</pre>
        </div>
      )}
    </div>
  )
}
