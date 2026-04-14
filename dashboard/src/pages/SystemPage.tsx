import { Skeleton } from "@/components/ui/skeleton"
import { formatDurationMs } from "@/lib/time"
import { useConfig } from "@/hooks/useConfig"
import { KernelLog } from "@/components/live/KernelLog"
import type { ReactNode } from "react"

// ── Helpers ─────────────────────────────────────────────────────

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-[11px] uppercase tracking-wider text-muted-foreground/40 font-medium mb-3">
      {children}
    </h3>
  )
}

function ConfigRow({ label, value }: { label: string; value: ReactNode }) {
  const handleCopy = () => {
    const text = typeof value === 'string' || typeof value === 'number' ? String(value) : label
    navigator.clipboard.writeText(text)
  }
  return (
    <div className="group flex justify-between py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono text-xs flex items-center gap-1.5">
        {value}
        <button
          onClick={handleCopy}
          className="opacity-0 group-hover:opacity-60 hover:opacity-100! transition-opacity text-muted-foreground cursor-pointer"
          title="Copy value"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
        </button>
      </span>
    </div>
  )
}



// ── Main ────────────────────────────────────────────────────────

export function SystemPage() {
  const { config } = useConfig()

  if (!config) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-32" />
        <Skeleton className="h-48" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-8 max-w-5xl">

      {/* ── 1. System Status ────────────────────────────── */}
      <section>
        <SectionLabel>System Status</SectionLabel>
        <div className="grid grid-cols-2 gap-x-6 max-w-lg">
            <ConfigRow label="Default agent" value={config.agent.default} />
            <ConfigRow label="Max retries" value={config.agent.maxRetries} />
            <ConfigRow label="Stall timeout" value={formatDurationMs(config.agent.stallTimeoutMs)} />
            <ConfigRow label="Poll interval" value={formatDurationMs(config.polling.intervalMs)} />
        </div>
      </section>

      {/* ── 2. Kernel Log ──────────────────────────────── */}
      <section>
        <SectionLabel>Kernel Log</SectionLabel>
        <div className="border rounded-lg overflow-hidden" style={{ height: 400 }}>
          <KernelLog />
        </div>
      </section>
    </div>
  )
}
