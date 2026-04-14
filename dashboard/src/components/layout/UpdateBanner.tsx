import { useUpdateCheck } from "@/hooks/useUpdateCheck"
import { XIcon, RefreshCwIcon } from "lucide-react"

export function UpdateBanner() {
  const { hasUpdate, latest, dismiss, daemonUpgraded } = useUpdateCheck()

  if (!hasUpdate && !daemonUpgraded) return null

  return (
    <>
      {hasUpdate && latest && (
        <div className="flex items-center justify-between gap-4 bg-blue-500/10 border-b border-blue-500/20 px-4 py-2 text-sm">
          <span className="font-medium text-blue-700 dark:text-blue-400">
            Update available: Reeve v{latest}
          </span>
          <button
            type="button"
            onClick={dismiss}
            className="text-blue-600/50 hover:text-blue-600 dark:text-blue-400/50 dark:hover:text-blue-400 transition-colors"
            aria-label="Dismiss"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>
      )}

      {daemonUpgraded && (
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-lg border bg-background px-4 py-3 text-sm shadow-lg">
          <span className="text-muted-foreground">
            Reeve has been updated. Reload for the latest UI.
          </span>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <RefreshCwIcon className="h-3 w-3" />
            Reload
          </button>
        </div>
      )}
    </>
  )
}
