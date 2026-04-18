/**
 * SessionViewer — clean, minimal timeline for agent session events.
 *
 * Design philosophy:
 * - No spine dots, no left border — use divide-y and spacing for grouping
 * - Tool calls: compact single line, expandable for long content
 * - Thinking: quietest element, collapsed by default
 * - Agent messages: clean text, long content truncated
 * - Exit: horizontal separator style, low visual weight
 */
import { useState, useEffect, useRef, useCallback } from "react"
import Markdown from "react-markdown"
import { cn } from "@/lib/utils"
import { ChevronRightIcon, TerminalIcon } from "lucide-react"
import { FadeIn } from "@/components/shared/Animations"

export interface SessionEvent {
  type: "thinking" | "tool_call" | "tool_result" | "usage" | "approval" | "exit" | "result" | "other" | (string & {})
  text: string
  status?: string
  tokens?: number
  time?: string
  /** Raw JSON-RPC event data — shown when tool row is expanded */
  rawData?: Record<string, unknown>
}

interface Props {
  events: SessionEvent[]
  live?: boolean
  className?: string
  maxHeight?: string
}

/* ── Tool event row — compact, expandable ─── */
function ToolRow({ ev }: { ev: SessionEvent }) {
  const [expanded, setExpanded] = useState(false)
  const fullText = ev.text.replace(/^[\u{1F527}\u{2705}\u{274C}\u{23F3}\u{1F4D6}\u{25B6}\s]+/u, "").trim()
  // First line = title, remaining = detail content
  const nlIdx = fullText.indexOf("\n")
  const title = nlIdx > 0 ? fullText.slice(0, nlIdx) : fullText
  const detail = nlIdx > 0 ? fullText.slice(nlIdx + 1).trim() : ""
  const hasRawData = !!ev.rawData
  const hasExpandable = hasRawData || detail.length > 0

  const isFailed = ev.status === "failed"
  const isApproval = ev.type === "approval"

  const statusDot = isApproval
    ? "bg-amber-400"
    : isFailed
      ? "bg-red-400"
      : "bg-emerald-400/70"

  return (
    <div className="group/tool">
      <button
        type="button"
        onClick={() => hasExpandable && setExpanded(e => !e)}
        className={cn(
          "w-full flex items-center gap-2 px-3 py-1.5 text-xs font-mono text-left",
          "transition-colors",
          hasExpandable && "cursor-pointer hover:bg-muted/30",
          !hasExpandable && "cursor-default",
          isFailed && "bg-red-500/5",
        )}
      >
        {/* Status dot */}
        <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", statusDot)} />

        {/* Title — first line only */}
        <span className="text-muted-foreground/90 truncate flex-1">{title}</span>

        {/* Expand chevron */}
        {hasExpandable && (
          <ChevronRightIcon className={cn(
            "h-3 w-3 shrink-0 text-muted-foreground/50 transition-transform duration-150",
            expanded && "rotate-90",
          )} />
        )}
      </button>

      {/* Expanded content */}
      {expanded && hasExpandable && (
        <div className="px-3 pb-2 pl-8 space-y-2">
          {detail && (
            <pre className={cn(
              "text-[11px] font-mono text-muted-foreground/80 leading-relaxed",
              "whitespace-pre-wrap break-all",
            )}>
              {detail}
            </pre>
          )}
          {hasRawData && (
            <pre className={cn(
              "text-[11px] font-mono text-muted-foreground/70 leading-relaxed",
              "max-h-[300px] overflow-y-auto overflow-x-hidden",
              "whitespace-pre-wrap break-all",
              "bg-muted/20 rounded-md p-2.5",
            )}>
              {JSON.stringify(ev.rawData, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}

/* ── Agent message — clean text with optional truncation ─── */
function MessageBlock({ text }: { text: string }) {
  return (
    <div className="px-3 py-2.5">
      <div className="text-[13px] leading-relaxed text-foreground/90 session-md">
        <Markdown
          components={{
            p: ({ children }) => <span>{children}</span>,
            code: ({ children }) => (
              <code className="px-1.5 py-0.5 rounded-md bg-muted/50 text-[11px] font-mono border border-border/30">{children}</code>
            ),
            a: ({ href, children }) => (
              <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{children}</a>
            ),
            strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
          }}
        >
          {text}
        </Markdown>
      </div>
    </div>
  )
}

/* ── Thinking block — inline, full brightness ─── */
function ThinkingBlock({ text }: { text: string }) {
  return (
    <div className="px-3 py-1">
      <span className="text-[11px] text-muted-foreground italic leading-relaxed">
        {text}
      </span>
    </div>
  )
}

/* ── Exit — horizontal separator with exit code ─── */
function ExitRow({ ev }: { ev: SessionEvent }) {
  const code = ev.text.match(/code (\d+)/)?.[1]
  const isSuccess = code === "0"

  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <div className="flex-1 h-px bg-border/20" />
      <div className={cn(
        "flex items-center gap-1.5 text-[11px] font-mono",
        isSuccess ? "text-emerald-500/60" : "text-red-400/80",
      )}>
        <TerminalIcon className="h-3 w-3" />
        <span>exit {code}</span>
      </div>
      <div className="flex-1 h-px bg-border/20" />
    </div>
  )
}

/* ── Main component ─── */
export function SessionViewer({ events, live, className, maxHeight = "calc(100vh - 300px)" }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const isNearBottomRef = useRef(true)
  const [seenCount, setSeenCount] = useState(0)

  const checkIfNearBottom = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
  }, [])

  useEffect(() => {
    if (live && isNearBottomRef.current) {
      containerRef.current?.scrollTo({ top: containerRef.current.scrollHeight, behavior: "smooth" })
    }
  }, [events.length, live])

  useEffect(() => {
    const timer = setTimeout(() => setSeenCount(events.length), 600)
    return () => clearTimeout(timer)
  }, [events.length])

  if (events.length === 0) {
    return (
      <div className={cn("flex flex-col items-center justify-center py-12 text-center", className)}>
        <TerminalIcon className="h-5 w-5 text-muted-foreground/10 mb-2" />
        <p className="text-xs text-muted-foreground/30">No session events</p>
      </div>
    )
  }

  const rendered: React.ReactNode[] = []

  for (let i = 0; i < events.length; i++) {
    const ev = events[i]
    const isNew = i >= seenCount

    let node: React.ReactNode = null

    switch (ev.type) {
      case "thinking":
        node = <ThinkingBlock text={ev.text} />
        break
      case "tool_call":
      case "tool_result":
      case "approval":
        node = <ToolRow ev={ev} />
        break
      case "usage":
        break
      case "result":
        if (ev.text.trim()) {
          node = <MessageBlock text={ev.text} />
        }
        break
      case "exit":
        node = <ExitRow ev={ev} />
        break
      default:
        if (ev.text.trim()) {
          node = <MessageBlock text={ev.text} />
        }
    }

    if (node) {
      rendered.push(
        isNew ? <FadeIn key={i}>{node}</FadeIn> : <div key={i}>{node}</div>
      )
    }
  }

  const isFillMode = maxHeight === "100%" || maxHeight === "none"

  return (
    <div
      ref={containerRef}
      onScroll={checkIfNearBottom}
      className={cn(
        "overflow-y-auto overflow-x-hidden",
        isFillMode && "h-full",
        className,
      )}
      style={isFillMode ? undefined : { maxHeight }}
    >
      <div className="py-1 divide-y divide-border/10">
        {rendered}
      </div>
    </div>
  )
}
