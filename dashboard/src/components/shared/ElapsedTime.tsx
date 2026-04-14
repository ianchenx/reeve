import { useEffect, useState } from "react"
import { formatDurationMs } from "@/lib/time"

function formatElapsed(startedAt: string): string {
  return formatDurationMs(Date.now() - new Date(startedAt).getTime())
}

export function ElapsedTime({ startedAt, live = false, className }: { startedAt: string; live?: boolean; className?: string }) {
  const [text, setText] = useState(() => formatElapsed(startedAt))

  useEffect(() => {
    if (!live) return
    const id = setInterval(() => setText(formatElapsed(startedAt)), 1000)
    return () => clearInterval(id)
  }, [startedAt, live])

  return <span className={className ?? "font-mono text-[11px] text-muted-foreground"}>{text}</span>
}
