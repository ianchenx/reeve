/**
 * KernelLog — structured event timeline for the daemon's JSONL log.
 * Fetches from /api/log, auto-refreshes every 3s, user-friendly display.
 */
import { useEffect, useState, useRef } from "react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import {
  ArrowRightIcon,
  PlayIcon,
  SquareIcon,
  AlertTriangleIcon,
  RotateCcwIcon,
  CheckCircleIcon,
  ClockIcon,
  GitBranchIcon,
  ZapIcon,
  PauseIcon,
  RefreshCwIcon,
} from "lucide-react"

const BASE = import.meta.env.VITE_API_BASE ?? ""

interface KernelEvent {
  ts: string
  taskId?: string
  identifier?: string
  event: string
  from?: string
  to?: string
  data?: Record<string, unknown>
}

// ── Event metadata ──────────────────────────────

interface EventMeta {
  label: string
  icon: React.ElementType
  color: string     // badge/icon color
  severity: "info" | "warn" | "error" | "success"
}

const EVENT_META: Record<string, EventMeta> = {
  intake:               { label: "Intake",           icon: ArrowRightIcon,     color: "text-blue-500",    severity: "info" },
  dispatch_start:       { label: "Dispatching",      icon: PlayIcon,           color: "text-blue-500",    severity: "info" },
  agent_spawn:          { label: "Agent Started",    icon: ZapIcon,            color: "text-emerald-500", severity: "success" },
  agent_exit:           { label: "Agent Exited",     icon: SquareIcon,         color: "text-amber-500",   severity: "warn" },
  state_change:         { label: "State Changed",    icon: ArrowRightIcon,     color: "text-purple-500",  severity: "info" },
  gate_failed:          { label: "Gate Failed",      icon: AlertTriangleIcon,  color: "text-red-500",     severity: "error" },
  stalled:              { label: "Stalled",          icon: AlertTriangleIcon,  color: "text-red-500",     severity: "error" },
  turn_timeout:         { label: "Turn Timeout",     icon: ClockIcon,          color: "text-red-500",     severity: "error" },
  recover_dead_agent:   { label: "Recovered Agent",  icon: RotateCcwIcon,      color: "text-orange-500",  severity: "warn" },
  reconcile_done:       { label: "Reconciled",       icon: CheckCircleIcon,    color: "text-emerald-500", severity: "success" },
  reconcile_redispatch: { label: "Re-dispatching",   icon: RefreshCwIcon,      color: "text-amber-500",   severity: "warn" },
  continuation_spawn:   { label: "Continuation",     icon: PlayIcon,           color: "text-cyan-500",    severity: "info" },
  worktree_created:     { label: "Worktree Created", icon: GitBranchIcon,      color: "text-muted-foreground", severity: "info" },
  hook_run:             { label: "Hook Executed",    icon: ZapIcon,            color: "text-muted-foreground", severity: "info" },
}

const DEFAULT_META: EventMeta = { label: "Event", icon: ZapIcon, color: "text-muted-foreground", severity: "info" }

// ── Helpers ─────────────────────────────────────

function timeAgo(ts: string): string {
  const ms = Date.now() - new Date(ts).getTime()
  if (ms < 0) return "just now"
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`
  return `${Math.floor(ms / 86_400_000)}d ago`
}

function formatTime(ts: string): string {
  try {
    return new Date(ts).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })
  } catch { return ts }
}

function describeEvent(ev: KernelEvent, meta: EventMeta): string {
  if (ev.from && ev.to) return `${ev.from} → ${ev.to}`
  if (ev.data) {
    const parts: string[] = []
    for (const [k, v] of Object.entries(ev.data)) {
      if (v === undefined || v === null) continue
      const s = String(v)
      parts.push(`${k}: ${s.length > 60 ? s.slice(0, 57) + "…" : s}`)
    }
    return parts.join(" · ")
  }
  return meta.label
}

function severityBadgeVariant(severity: EventMeta["severity"]): "default" | "secondary" | "destructive" | "outline" {
  switch (severity) {
    case "error": return "destructive"
    case "success": return "default"
    default: return "secondary"
  }
}

// ── Component ───────────────────────────────────

export function KernelLog() {
  const [events, setEvents] = useState<KernelEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [paused, setPaused] = useState(false)
  const [tail, setTail] = useState(100)
  const bottomRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)

  useEffect(() => {
    if (paused) return
    let cancelled = false

    const fetchLog = async () => {
      try {
        const res = await fetch(`${BASE}/api/log?tail=${tail}`)
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled) {
          setEvents(Array.isArray(data) ? data : [])
          setLoading(false)
        }
      } catch {
        if (!cancelled) setLoading(false)
      }
    }

    void fetchLog()
    const timer = setInterval(fetchLog, 3000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [paused, tail])

  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" })
    }
  }, [events.length, autoScroll])

  const handleScroll = () => {
    if (!containerRef.current) return
    const el = containerRef.current
    setAutoScroll(el.scrollHeight - el.scrollTop - el.clientHeight < 40)
  }

  if (loading) {
    return <div className="p-6 text-center text-sm text-muted-foreground">Loading kernel log…</div>
  }

  return (
    <div className="flex flex-col h-full">
      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between px-4 py-2 border-b shrink-0">
        <div className="flex items-center gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Kernel Events
          </h3>
          <span className="text-[10px] text-muted-foreground/50">{events.length} events</span>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={tail}
            onChange={e => setTail(Number(e.target.value))}
            className="h-6 text-[11px] rounded border bg-background px-1.5 text-muted-foreground"
          >
            <option value={50}>Last 50</option>
            <option value={100}>Last 100</option>
            <option value={200}>Last 200</option>
            <option value={500}>Last 500</option>
          </select>
          <button
            onClick={() => setPaused(!paused)}
            className={cn(
              "flex items-center gap-1 h-6 px-2 rounded text-[11px] border transition-colors",
              paused ? "text-amber-500 border-amber-500/30 bg-amber-500/5" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {paused ? <><PlayIcon className="h-3 w-3" /> Resume</> : <><PauseIcon className="h-3 w-3" /> Pause</>}
          </button>
        </div>
      </div>

      {/* ── Event list ── */}
      <div ref={containerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto">
        {events.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">No kernel events yet</div>
        ) : (
          <div className="divide-y">
            {events.map((ev, i) => {
              const meta = EVENT_META[ev.event] || DEFAULT_META
              const Icon = meta.icon
              return (
                <div key={i} className="flex items-start gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors">
                  {/* Icon */}
                  <div className={cn("mt-0.5 shrink-0", meta.color)}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <Badge variant={severityBadgeVariant(meta.severity)} className="text-[10px] px-1.5 py-0 h-4">
                        {meta.label}
                      </Badge>
                      {ev.identifier && (
                        <span className="text-[11px] font-mono font-medium text-primary/80">
                          {ev.identifier}
                        </span>
                      )}
                    </div>
                    {describeEvent(ev, meta) !== meta.label && (
                      <p className="text-[11px] text-muted-foreground/70 truncate">
                        {describeEvent(ev, meta)}
                      </p>
                    )}
                  </div>

                  {/* Timestamp */}
                  <div className="shrink-0 text-right">
                    <span className="text-[10px] text-muted-foreground/50 tabular-nums" title={formatTime(ev.ts)}>
                      {timeAgo(ev.ts)}
                    </span>
                  </div>
                </div>
              )
            })}
            <div ref={bottomRef} />
          </div>
        )}

        {/* Jump to latest */}
        {!autoScroll && (
          <button
            className="sticky bottom-2 left-1/2 -translate-x-1/2 text-[11px] bg-primary text-primary-foreground px-3 py-1 rounded-full shadow-md"
            onClick={() => { setAutoScroll(true); bottomRef.current?.scrollIntoView({ behavior: "smooth" }) }}
          >
            ↓ Jump to latest
          </button>
        )}
      </div>
    </div>
  )
}
