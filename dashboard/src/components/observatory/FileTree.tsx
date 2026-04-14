import { cn } from "@/lib/utils"
import { FileIcon, FilePlusIcon, FileMinusIcon, FileEditIcon } from "lucide-react"

interface FileEntry {
  status: string
  file: string
}

interface Props {
  files: FileEntry[]
  selectedFile: string | null
  onSelectFile: (path: string) => void
}

const STATUS_CONFIG: Record<string, { icon: typeof FileIcon; className: string }> = {
  M: { icon: FileEditIcon, className: "text-status-warning" },
  A: { icon: FilePlusIcon, className: "text-status-success" },
  D: { icon: FileMinusIcon, className: "text-destructive" },
  "?": { icon: FilePlusIcon, className: "text-muted-foreground" },
}

function getStatusConfig(status: string): { icon: typeof FileIcon; className: string } {
  return STATUS_CONFIG[status] ?? { icon: FileIcon, className: "text-muted-foreground" }
}

/**
 * Pure display component — renders a flat file list with status icons.
 * Does not fetch data; receives files from parent.
 */
export function FileTree({ files, selectedFile, onSelectFile }: Props) {
  if (files.length === 0) {
    return (
      <p className="text-xs text-muted-foreground px-2 py-3">
        No changes detected
      </p>
    )
  }

  return (
    <ul className="space-y-0.5">
      {files.map(f => {
        const config = getStatusConfig(f.status)
        const Icon = config.icon
        const active = f.file === selectedFile

        return (
          <li key={f.file}>
            <button
              onClick={() => onSelectFile(f.file)}
              className={cn(
                "w-full flex items-center gap-2 px-2 py-1 rounded text-left text-xs transition-colors",
                active
                  ? "bg-primary/10 text-foreground"
                  : "hover:bg-muted/50 text-muted-foreground"
              )}
            >
              <Icon className={cn("h-3.5 w-3.5 shrink-0", config.className)} />
              <span className="truncate font-mono">{f.file}</span>
              <span className={cn("ml-auto text-[10px] shrink-0 uppercase", config.className)}>
                {f.status}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
