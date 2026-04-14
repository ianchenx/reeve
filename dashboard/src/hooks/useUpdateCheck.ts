import { useCallback, useEffect, useRef, useState } from "react"
import { fetchVersion, type VersionInfo } from "@/api"

const DISMISS_KEY = "reeve-update-dismissed-version"

export function useUpdateCheck() {
  const [info, setInfo] = useState<VersionInfo | null>(null)
  const [dismissed, setDismissed] = useState<string | null>(
    () => localStorage.getItem(DISMISS_KEY),
  )
  const fetchingRef = useRef(false)
  // Track the version the frontend loaded with — detects daemon upgrade while tab is open
  const initialVersionRef = useRef<string | null>(null)
  const [daemonUpgraded, setDaemonUpgraded] = useState(false)

  const check = useCallback(() => {
    if (fetchingRef.current) return
    fetchingRef.current = true
    fetchVersion()
      .then((data) => {
        setInfo(data)
        if (initialVersionRef.current === null) {
          initialVersionRef.current = data.current
        } else if (data.current !== initialVersionRef.current) {
          setDaemonUpgraded(true)
        }
      })
      .catch(() => {})
      .finally(() => { fetchingRef.current = false })
  }, [])

  // Fetch on mount
  useEffect(() => {
    check()
  }, [check])

  // Re-fetch on window refocus
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible") check()
    }
    document.addEventListener("visibilitychange", onVisibility)
    return () => document.removeEventListener("visibilitychange", onVisibility)
  }, [check])

  const dismiss = useCallback(() => {
    if (info?.latest) {
      localStorage.setItem(DISMISS_KEY, info.latest)
      setDismissed(info.latest)
    }
  }, [info])

  const hasUpdate = !!(info?.hasUpdate && info.latest && info.latest !== dismissed)

  return {
    hasUpdate,
    current: info?.current ?? null,
    latest: info?.latest ?? null,
    dismiss,
    /** true when daemon was upgraded while this tab was open — frontend assets are stale */
    daemonUpgraded,
  }
}
