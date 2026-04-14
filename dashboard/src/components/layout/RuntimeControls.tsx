import { useEffect, useState } from "react"
import { Loader2Icon, PlayIcon } from "lucide-react"

import { activateRuntime, fetchSetupCheck, type SetupCheck } from "@/api"
import { ConcurrencyPill } from "@/components/shared/ConcurrencyPill"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

function RuntimeBadge({ active }: { active: boolean }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "h-7 gap-1.5 rounded-full px-2.5 text-[11px] font-medium",
        active
          ? "border-status-success/25 bg-status-success/8 text-status-success"
          : "border-border bg-muted/40 text-muted-foreground"
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          active ? "bg-status-success" : "bg-muted-foreground/60"
        )}
      />
      {active ? "Running" : "Idle"}
    </Badge>
  )
}

export function RuntimeControls() {
  const [status, setStatus] = useState<SetupCheck | null>(null)
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let intervalId: number | null = null

    const load = async () => {
      try {
        const next = await fetchSetupCheck()
        if (!cancelled) {
          setStatus(next)
          if (next.runtimeActive) setStartError(null)
        }
      } catch {
        // Keep the last known state; the shell can still render while the API reconnects.
      }
    }

    void load()
    intervalId = window.setInterval(() => {
      void load()
    }, 5000)

    return () => {
      cancelled = true
      if (intervalId !== null) window.clearInterval(intervalId)
    }
  }, [])

  const handleStart = async () => {
    setStarting(true)
    setStartError(null)

    try {
      const result = await activateRuntime()
      if (!result.ok) {
        setStartError(result.error ?? "Start failed")
        return
      }

      const next = await fetchSetupCheck()
      setStatus(next)
    } catch {
      setStartError("Start failed")
    } finally {
      setStarting(false)
    }
  }

  if (!status?.configured) {
    return <ConcurrencyPill />
  }

  if (status.runtimeActive) {
    return (
      <div className="flex items-center gap-2">
        <RuntimeBadge active />
        <ConcurrencyPill />
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <RuntimeBadge active={false} />
      {startError && (
        <span
          className="hidden text-xs text-status-error lg:block"
          title={startError}
        >
          Start failed
        </span>
      )}
      <Button size="sm" onClick={handleStart} disabled={starting}>
        {starting ? <Loader2Icon className="animate-spin" /> : <PlayIcon />}
        {starting ? "Starting..." : "Start Reeve"}
      </Button>
    </div>
  )
}
