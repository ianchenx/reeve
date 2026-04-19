import { useCallback, useEffect, useState } from "react"
import { Loader2Icon, PlayIcon } from "lucide-react"

import { fetchSetupCheck, startRuntime, type SetupCheck } from "@/api"
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

  const load = useCallback(async (): Promise<SetupCheck | null> => {
    try {
      const next = await fetchSetupCheck()
      setStatus(next)
      return next
    } catch {
      // Keep the last known state; the shell can still render while the API reconnects.
      return null
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    let intervalId: number | null = null

    const poll = async () => {
      const next = await load()
      if (cancelled && next) setStatus(null)
    }

    void poll()
    intervalId = window.setInterval(() => {
      void poll()
    }, 5000)

    return () => {
      cancelled = true
      if (intervalId !== null) window.clearInterval(intervalId)
    }
  }, [load])

  const handleStart = useCallback(async () => {
    setStarting(true)
    try {
      await startRuntime()
      await load()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      window.alert(`Failed to start Reeve runtime: ${message}`)
    } finally {
      setStarting(false)
    }
  }, [load])

  if (!status?.configured) {
    return <ConcurrencyPill />
  }

  return (
    <div className="flex items-center gap-2">
      <RuntimeBadge active={status.runtimeActive} />
      {!status.runtimeActive && (
        <Button size="xs" variant="outline" onClick={handleStart} disabled={starting}>
          {starting ? <Loader2Icon className="animate-spin" /> : <PlayIcon />}
          Start
        </Button>
      )}
      <ConcurrencyPill />
    </div>
  )
}
