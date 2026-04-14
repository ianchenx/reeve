import { useState } from "react"
import { useWorktreeStatus } from "@/hooks/useWorktreeStatus"
import { useFileDiff } from "@/hooks/useFileDiff"
import { FileTree } from "@/components/observatory/FileTree"
import { DiffViewer } from "@/components/observatory/DiffViewer"
import { GitBranchIcon, GitCommitHorizontalIcon, LoaderIcon } from "lucide-react"

interface Props {
  identifier: string
}

/**
 * Right panel — manages its own worktree polling via useWorktreeStatus.
 * Renders branch info, commit log, and file tree.
 */
export function FileChangesPanel({ identifier }: Props) {
  const state = useWorktreeStatus(identifier)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const diffState = useFileDiff(identifier, selectedFile)

  if (state.status === "loading") {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground">
        <LoaderIcon className="h-4 w-4 animate-spin" />
      </div>
    )
  }

  if (state.status === "error") {
    return (
      <div className="px-3 py-4 text-xs text-destructive">
        {state.error}
      </div>
    )
  }

  if (state.status === "idle") {
    return null
  }

  const { branch, changedFiles, commits } = state.data

  return (
    <div className="space-y-4">
      {/* Branch */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <GitBranchIcon className="h-3.5 w-3.5 shrink-0" />
        <span className="font-mono truncate">{branch}</span>
      </div>

      {/* Files */}
      <div>
        <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
          Files ({changedFiles.length})
        </h4>
        <FileTree
          files={changedFiles}
          selectedFile={selectedFile}
          onSelectFile={setSelectedFile}
        />
      </div>

      {/* Commits */}
      {commits.length > 0 && (
        <div>
          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
            Commits
          </h4>
          <ul className="space-y-1">
            {commits.map(c => (
              <li key={c.hash} className="flex items-start gap-2 text-xs">
                <GitCommitHorizontalIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground mt-0.5" />
                <div className="min-w-0">
                  <span className="font-mono text-[10px] text-muted-foreground">{c.hash.slice(0, 7)}</span>
                  <p className="text-foreground/80 truncate">{c.message}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Diff */}
      <DiffViewer state={diffState} filePath={selectedFile} />
    </div>
  )
}
