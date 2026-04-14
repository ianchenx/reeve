/**
 * PromptViewer — document-reader for agent prompts.
 *
 * Design ref: Notion document, Stripe API docs, Arc browser reader mode
 *
 * Features:
 * - Floating outline sidebar extracted from markdown headings
 * - Click-to-jump section navigation
 * - Reading progress indicator
 * - Rich markdown rendering with MarkdownRenderer
 * - Copy-to-clipboard with feedback
 * - Toggle between rendered / raw source view
 *
 * StderrViewer — error-styled viewer for stderr output.
 */
import { useRef, useState, useCallback, useMemo } from "react"
import { MarkdownRenderer } from "@/components/shared/MarkdownRenderer"
import { cn } from "@/lib/utils"
import {
  FileTextIcon,
  CopyIcon,
  CheckIcon,
  CodeIcon,
  BookOpenIcon,
  AlertTriangleIcon,
  ListIcon,
} from "lucide-react"

/* ── Heading extraction from markdown ─── */
interface Heading {
  level: number
  text: string
  id: string
}

function extractHeadings(content: string): Heading[] {
  const lines = content.split("\n")
  const headings: Heading[] = []
  let inCodeBlock = false

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      inCodeBlock = !inCodeBlock
      continue
    }
    if (inCodeBlock) continue

    const match = line.match(/^(#{1,4})\s+(.+)/)
    if (match) {
      const level = match[1].length
      const text = match[2].replace(/[*_`#]/g, "").trim()
      const id = text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")
      headings.push({ level, text, id })
    }
  }
  return headings
}

/* ── Props ─── */
interface Props {
  content: string
  title?: string
  maxHeight?: string
}

/* ── PromptViewer ─── */
export function PromptViewer({ content, title = "Prompt", maxHeight = "500px" }: Props) {
  const isFillMode = maxHeight === "100%" || maxHeight === "none"
  const [copied, setCopied] = useState(false)
  const [rawMode, setRawMode] = useState(false)
  const [showOutline, setShowOutline] = useState(!isFillMode)
  const [readProgress, setReadProgress] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)

  const headings = useMemo(() => extractHeadings(content), [content])
  const hasHeadings = headings.length > 2

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [content])

  // Reading progress tracking
  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const pct = el.scrollHeight > el.clientHeight
      ? (el.scrollTop / (el.scrollHeight - el.clientHeight)) * 100
      : 100
    setReadProgress(Math.min(pct, 100))
  }, [])

  // Jump to heading
  const jumpToHeading = useCallback((id: string) => {
    const el = scrollRef.current
    if (!el) return
    const headingEls = el.querySelectorAll("h1, h2, h3, h4")
    for (const h of headingEls) {
      const hId = (h.textContent || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")
      if (hId === id) {
        h.scrollIntoView({ behavior: "smooth", block: "start" })
        return
      }
    }
  }, [])

  if (!content) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <FileTextIcon className="h-8 w-8 text-muted-foreground/10 mb-3" />
        <p className="text-sm text-muted-foreground/40">No {title.toLowerCase()} available</p>
      </div>
    )
  }

  const charCount = content.length
  const wordCount = content.split(/\s+/).filter(Boolean).length
  const lineCount = content.split("\n").length

  // isFillMode already computed above

  return (
    <div className={cn(
      "overflow-hidden flex flex-col",
      isFillMode ? "h-full" : "rounded-xl border bg-card",
    )}>
      {/* ── Header bar ─── */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/5 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <BookOpenIcon className="h-3.5 w-3.5 text-primary/50" />
            <span className="text-[11px] font-semibold text-muted-foreground/70">{title}</span>
          </div>
          <div className="flex items-center gap-2 text-[10px] tabular-nums text-muted-foreground/60">
            <span>{wordCount.toLocaleString()} words</span>
            <span>·</span>
            <span>{lineCount.toLocaleString()} lines</span>
            <span>·</span>
            <span>{charCount.toLocaleString()} chars</span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {/* Outline toggle */}
          {hasHeadings && (
            <button
              onClick={() => setShowOutline(o => !o)}
              className={cn(
                "flex items-center gap-1 px-2 py-1 rounded text-[10px] transition-colors cursor-pointer",
                showOutline
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground/50 hover:text-foreground hover:bg-muted/50"
              )}
              title="Toggle outline"
            >
              <ListIcon className="h-3 w-3" />
            </button>
          )}

          {/* Raw/Rendered toggle */}
          <button
            onClick={() => setRawMode(r => !r)}
            className={cn(
              "flex items-center gap-1 px-2 py-1 rounded text-[10px] transition-colors cursor-pointer",
              rawMode
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground/50 hover:text-foreground hover:bg-muted/50"
            )}
            title={rawMode ? "Show rendered" : "Show source"}
          >
            <CodeIcon className="h-3 w-3" />
            {rawMode ? "Source" : "Render"}
          </button>

          {/* Copy */}
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-muted-foreground/50 hover:text-foreground hover:bg-muted/50 transition-colors cursor-pointer"
          >
            {copied ? <CheckIcon className="h-3 w-3 text-emerald-400" /> : <CopyIcon className="h-3 w-3" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>

      {/* ── Reading progress bar ─── */}
      <div className="h-[2px] bg-muted/20 shrink-0">
        <div
          className="h-full bg-primary/40 transition-all duration-150"
          style={{ width: `${readProgress}%` }}
        />
      </div>

      {/* ── Content area ─── */}
      <div className={cn("flex flex-1 min-h-0", isFillMode ? "overflow-hidden" : "")} style={isFillMode ? undefined : { maxHeight }}>
        {/* Outline sidebar */}
        {hasHeadings && showOutline && !rawMode && (
          <div className="w-[180px] shrink-0 border-r overflow-y-auto py-3 px-2 bg-muted/5">
            <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/30 px-2 mb-2">
              Outline
            </p>
            {headings.map((h, i) => (
              <button
                key={`${h.id}-${i}`}
                onClick={() => jumpToHeading(h.id)}
                className={cn(
                  "w-full text-left px-2 py-1 rounded text-[10px] transition-colors cursor-pointer truncate",
                  "text-muted-foreground/60 hover:text-foreground hover:bg-muted/30",
                )}
                style={{ paddingLeft: `${(h.level - 1) * 8 + 8}px` }}
                title={h.text}
              >
                {h.text}
              </button>
            ))}
          </div>
        )}

        {/* Main content */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden"
        >
          {rawMode ? (
            <pre className="p-5 text-xs font-mono leading-relaxed whitespace-pre-wrap text-foreground/80">
              {content}
            </pre>
          ) : (
            <div className="p-5 max-w-none wrap-break-word overflow-x-hidden">
              <MarkdownRenderer content={content} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── StderrViewer ─── */
export function StderrViewer({ content, maxHeight = "500px" }: { content: string; maxHeight?: string }) {
  const [expanded, setExpanded] = useState(false)
  if (!content) return null

  const isFillMode = maxHeight === "100%" || maxHeight === "none"
  const lines = content.split("\n")
  const lineCount = lines.length
  const errorLines = lines.filter(l => /error|fatal|panic|exception/i.test(l)).length
  const warningLines = lines.filter(l => /warning|warn|deprecated/i.test(l)).length

  return (
    <div className={cn(
      "overflow-hidden flex flex-col",
      isFillMode ? "h-full" : "rounded-xl border border-destructive/20 bg-card",
    )}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-destructive/20 bg-destructive/5 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <AlertTriangleIcon className="h-3.5 w-3.5 text-destructive/60" />
            <span className="text-[11px] font-semibold text-destructive/70">Stderr</span>
          </div>
          <div className="flex items-center gap-2 text-[10px] tabular-nums">
            <span className="text-destructive/40">{lineCount} lines</span>
            {errorLines > 0 && (
              <span className="px-1.5 py-0.5 rounded bg-destructive/10 text-destructive text-[9px] font-medium">
                {errorLines} errors
              </span>
            )}
            {warningLines > 0 && (
              <span className="px-1.5 py-0.5 rounded bg-status-warning/10 text-status-warning text-[9px] font-medium">
                {warningLines} warnings
              </span>
            )}
          </div>
        </div>
        {!isFillMode && (
          <button
            onClick={() => setExpanded(e => !e)}
            className="text-[10px] text-destructive/40 hover:text-destructive transition-colors cursor-pointer"
          >
            {expanded ? "Collapse" : "Expand"}
          </button>
        )}
      </div>

      {/* Content — highlight error/warning lines */}
      <div
        className={cn("overflow-y-auto", isFillMode && "flex-1 min-h-0")}
        style={isFillMode ? undefined : { maxHeight: expanded ? "none" : maxHeight }}
      >
        <div className="p-4 font-mono text-xs leading-relaxed">
          {lines.map((line, i) => {
            const isError = /error|fatal|panic|exception/i.test(line)
            const isWarning = /warning|warn|deprecated/i.test(line)
            return (
              <div
                key={i}
                className={cn(
                  "py-0.5 px-1 -mx-1 rounded-sm whitespace-pre-wrap",
                  isError && "bg-destructive/10 text-destructive",
                  isWarning && !isError && "bg-status-warning/10 text-status-warning",
                  !isError && !isWarning && "text-destructive/50",
                )}
              >
                <span className="inline-block w-8 text-right mr-3 select-none text-destructive/20 tabular-nums">{i + 1}</span>
                {line}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
