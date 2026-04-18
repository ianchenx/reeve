/**
 * AgentObservatoryPage — single-agent live monitoring + in-place post-mortem.
 *
 * Phase state machine:
 *   live        → agent is active, terminal stream + controls
 *   completing  → agent just disappeared, brief transition
 *   postmortem  → static view with outcome, PR link, history link
 *
 * In post-mortem, URL is silently replaced to /history/$taskId via replaceState,
 * so a page refresh lands on the persistent history view.
 */
import { useEffect, useRef, useState } from "react"
import type { ComponentType } from "react"
import { fetchLiveSession, fetchHistory, cancelTask } from "@/api"
import { useReeveStore } from "@/hooks/useReeveStore"
import { usePreferences } from "@/hooks/usePreferences"
import {
  CommandCenterLayout,
  TerminalLayout,
} from "@/components/observatory/layouts"
import type { LayoutVariant, LayoutProps } from "@/components/observatory/layouts"
import { PostMortemView } from "@/components/observatory/PostMortemView"
import { ArrowLeftIcon, SquareIcon, Loader2Icon } from "lucide-react"
import type { HistoryEntry as HistoryEntryType } from "@/types"
import { Link } from "@tanstack/react-router"
import { agentObservatoryRoute } from "@/router"
import type { DisplayEvent, TaskEntry } from "@/types"

const layoutComponents: Record<LayoutVariant, ComponentType<LayoutProps>> = {
  "command-center": CommandCenterLayout,
  "terminal": TerminalLayout,
}

type Phase = "live" | "completing" | "postmortem"

export function AgentObservatoryPage() {
  const { agentId } = agentObservatoryRoute.useParams()
  const store = useReeveStore()
  const { prefs } = usePreferences()

  const [killing, setKilling] = useState(false)
  const [liveEvents, setLiveEvents] = useState<DisplayEvent[] | null>(null)
  const [phase, setPhase] = useState<Phase>("live")
  const [postMortemEvents, setPostMortemEvents] = useState<DisplayEvent[]>([])
  const [postMortemMeta, setPostMortemMeta] = useState<HistoryEntryType | null>(null)
  const latestEventsRef = useRef<DisplayEvent[]>([])
  const transitionStartedRef = useRef(false)

  const handleKill = async () => {
    setKilling(true)
    try {
      await cancelTask(agentId)
      // Don't navigate — let the phase machine handle transition
    } catch {
      setKilling(false)
    }
  }

  const processes: TaskEntry[] = [...store.active]
  const agentProcess = processes.filter((p: TaskEntry) => p.identifier === agentId)
  const found = agentProcess.length > 0

  // ── Live session polling ──
  useEffect(() => {
    if (!found || phase !== "live") return
    let cancelled = false

    const poll = async () => {
      try {
        const response = await fetchLiveSession(agentId)
        const events = response.events as DisplayEvent[]
        if (!cancelled && events.length > 0) {
          setLiveEvents(events)
          latestEventsRef.current = events
        }
      } catch {
        if (!cancelled) setLiveEvents(null)
      }
    }

    void poll()
    const timer = window.setInterval(() => void poll(), 1500)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [agentId, found, phase])

  // ── Phase transition: live → completing → postmortem ──
  useEffect(() => {
    if (found) {
      // Agent is alive — reset transition flag
      transitionStartedRef.current = false
      return
    }

    // Agent not found — but have we ever seen it?
    if (phase === "live" && latestEventsRef.current.length === 0) {
      // Never found this agent — it truly doesn't exist
      return
    }

    // Prevent double-triggering
    if (transitionStartedRef.current) return
    transitionStartedRef.current = true

    // Agent just disappeared → completing phase
    // Snapshot events for post-mortem before they disappear
    setPostMortemEvents([...latestEventsRef.current])
    setPhase("completing")

    // Query history for final metadata
    const resolve = async () => {
      try {
        const { items } = await fetchHistory({ q: agentId, limit: 1 })
        const entry = items[0]?.attempts[0] ?? null
        setPostMortemMeta(entry)

        // Silent URL replace so refresh → history page
        if (entry?.historyId) {
          window.history.replaceState(null, "", `/history/${entry.historyId}`)
        }
      } catch {
        // History fetch failed — still show post-mortem with what we have
      }

      setPhase("postmortem")
    }

    // Brief delay for the "completing" visual state
    const timer = setTimeout(() => void resolve(), 800)
    return () => clearTimeout(timer)
  }, [found, phase, agentId])

  // ── Layout selection ──
  const LayoutComponent = layoutComponents[prefs.observatoryLayout]
  const getEventLog = (id: string) => {
    if (id === agentId && liveEvents && liveEvents.length > 0) {
      return liveEvents
    }
    return store.getEventLog(id)
  }

  // ── Render: completing state ──
  if (phase === "completing") {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-3 px-4 py-1.5 border-b shrink-0 bg-background/50">
          <Link
            to="/board"
            className="p-1 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeftIcon className="h-4 w-4" />
          </Link>
          <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            {agentId}
          </span>
          <div className="flex-1" />
          <Loader2Icon className="h-4 w-4 text-muted-foreground animate-spin" />
          <span className="text-[11px] text-muted-foreground">Finishing up…</span>
        </div>

        <div className="flex-1 min-h-0 opacity-50 transition-opacity duration-500">
          <LayoutComponent
            processes={agentProcess.length > 0 ? agentProcess : [{ identifier: agentId } as TaskEntry]}
            selectedId={agentId}
            onSelect={() => {}}
            getEventLog={() => postMortemEvents}
          />
        </div>
      </div>
    )
  }

  // ── Render: post-mortem state ──
  if (phase === "postmortem") {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-3 px-4 py-1.5 border-b shrink-0 bg-background/50">
          <Link
            to="/board"
            className="p-1 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeftIcon className="h-4 w-4" />
          </Link>
          <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            {agentId}
          </span>
        </div>

        <div className="flex-1 min-h-0">
          <PostMortemView
            events={postMortemEvents}
            meta={postMortemMeta}
            agentId={agentId}
          />
        </div>
      </div>
    )
  }

  // ── Render: live state ──
  return (
    <div className="flex flex-col h-full">
      {/* Top chrome: back + title + kill */}
      <div className="flex items-center gap-3 px-4 py-1.5 border-b shrink-0 bg-background/50">
        <Link
          to="/board"
          className="p-1 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
          title="Back to Board"
        >
          <ArrowLeftIcon className="h-4 w-4" />
        </Link>
        <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          {agentId}
        </span>
        <div className="flex-1" />
        {found && (
          <button
            type="button"
            onClick={handleKill}
            disabled={killing}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium text-destructive hover:bg-destructive/10 border border-destructive/20 transition-colors disabled:opacity-50"
            title="Stop agent"
          >
            <SquareIcon className="h-3 w-3" />
            {killing ? "Stopping…" : "Stop"}
          </button>
        )}
      </div>

      {/* Active layout or not-found */}
      <div className="flex-1 min-h-0">
        {found ? (
          <LayoutComponent
            processes={agentProcess}
            selectedId={agentId}
            onSelect={() => {}}
            getEventLog={getEventLog}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground py-16">
            <div className="text-center space-y-2">
              <p>Agent {agentId} not found</p>
              <Link to="/board" className="text-xs text-primary hover:underline">
                ← Back to Board
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
