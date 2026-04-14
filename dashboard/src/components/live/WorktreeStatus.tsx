import { useEffect, useState } from "react"
import { GitBranchIcon, FileEditIcon, GitCommitHorizontalIcon, Diff } from "lucide-react"

interface WorktreeData {
  branch: string
  changedFiles: Array<{ status: string; file: string }>
  commits: Array<{ hash: string; message: string }>
  diffStat: string | null
}

interface Props {
  identifier: string
}

const STATUS_LABELS: Record<string, string> = {
  M: "modified",
  A: "added",
  D: "deleted",
  "??": "untracked",
  R: "renamed",
}

export function WorktreeStatus({ identifier }: Props) {
  const [data, setData] = useState<WorktreeData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch(`/api/worktree/${encodeURIComponent(identifier)}`)
        if (!res.ok) { setError("Not available"); return }
        const json = await res.json() as WorktreeData
        if (!cancelled) setData(json)
      } catch { if (!cancelled) setError("Failed to load") }
    }
    load()
    const interval = setInterval(load, 10_000) // refresh every 10s
    return () => { cancelled = true; clearInterval(interval) }
  }, [identifier])

  if (error) return <div className="px-4 py-2 text-xs text-muted-foreground">{error}</div>
  if (!data) return <div className="px-4 py-2 text-xs text-muted-foreground">Loading worktree…</div>

  return (
    <div className="border-t bg-muted/30 px-4 py-3 space-y-3 text-xs">
      {/* Branch */}
      <div className="flex items-center gap-2 text-foreground">
        <GitBranchIcon className="h-3.5 w-3.5 text-primary shrink-0" />
        <span className="font-mono font-medium">{data.branch || "detached"}</span>
      </div>

      {/* Changed files */}
      {data.changedFiles.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-muted-foreground font-medium uppercase tracking-wider" style={{ fontSize: "10px" }}>
            <FileEditIcon className="h-3 w-3" />
            Changes ({data.changedFiles.length})
          </div>
          <div className="max-h-24 overflow-y-auto space-y-0.5">
            {data.changedFiles.map((f, i) => (
              <div key={i} className="flex items-center gap-2 font-mono text-[11px]">
                <span className={
                  f.status === "M" ? "text-amber-500" :
                  f.status === "A" || f.status === "??" ? "text-green-500" :
                  f.status === "D" ? "text-red-500" : "text-muted-foreground"
                } title={STATUS_LABELS[f.status] || f.status}>
                  {f.status}
                </span>
                <span className="truncate text-foreground/80">{f.file}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent commits */}
      {data.commits.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-muted-foreground font-medium uppercase tracking-wider" style={{ fontSize: "10px" }}>
            <GitCommitHorizontalIcon className="h-3 w-3" />
            Recent commits
          </div>
          <div className="max-h-28 overflow-y-auto space-y-0.5">
            {data.commits.map((c, i) => (
              <div key={i} className="flex items-center gap-2 text-[11px]">
                <span className="font-mono text-primary/70 shrink-0">{c.hash.slice(0, 7)}</span>
                <span className="truncate text-foreground/80">{c.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Diff stat */}
      {data.diffStat && (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-muted-foreground font-medium uppercase tracking-wider" style={{ fontSize: "10px" }}>
            <Diff className="h-3 w-3" />
            Diff
          </div>
          <pre className="font-mono text-[11px] text-foreground/80 whitespace-pre-wrap max-h-32 overflow-y-auto">{data.diffStat}</pre>
        </div>
      )}

      {data.changedFiles.length === 0 && data.commits.length === 0 && (
        <div className="text-muted-foreground">Clean working directory</div>
      )}
    </div>
  )
}
