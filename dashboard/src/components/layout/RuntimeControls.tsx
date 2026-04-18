import { useEffect, useState } from "react"

import { fetchSetupCheck, type SetupCheck } from "@/api"
import { ConcurrencyPill } from "@/components/shared/ConcurrencyPill"
import { Badge } from "@/components/ui/badge"
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

  useEffect(() => {
    let cancelled = false
    let intervalId: number | null = null

    const load = async () => {
      try {
        const next = await fetchSetupCheck()
        if (!cancelled) {
          setStatus(next)
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

  if (!status?.configured) {
    return <ConcurrencyPill />
  }

  return (
    <div className="flex items-center gap-2">
      <RuntimeBadge active={status.runtimeActive} />
      <ConcurrencyPill />
    </div>
  )
}
