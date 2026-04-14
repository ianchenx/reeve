import { useState, useEffect, useCallback } from "react"

const STORAGE_KEY = "reeve:debug"

/**
 * Global debug mode hook.
 *
 * Enable: add ?debug to any URL, or call toggle()
 * Disable: add ?debug=0 to any URL, or call toggle()
 *
 * Persists in localStorage — sticky across sessions.
 */
export function useDebugMode(): { debug: boolean; toggle: () => void } {
  const [debug, setDebug] = useState(() => {
    // Check URL first (one-time activation/deactivation)
    const params = new URLSearchParams(window.location.search)
    if (params.has("debug")) {
      const val = params.get("debug") !== "0"
      localStorage.setItem(STORAGE_KEY, val ? "1" : "0")
      // Clean the URL — remove ?debug without reload
      params.delete("debug")
      const clean = params.toString()
      const url = window.location.pathname + (clean ? `?${clean}` : "") + window.location.hash
      window.history.replaceState(null, "", url)
      return val
    }
    // Fall back to localStorage
    return localStorage.getItem(STORAGE_KEY) === "1"
  })

  const toggle = useCallback(() => {
    setDebug(prev => {
      const next = !prev
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0")
      return next
    })
  }, [])

  // Listen for storage changes from other tabs
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setDebug(e.newValue === "1")
    }
    window.addEventListener("storage", handler)
    return () => window.removeEventListener("storage", handler)
  }, [])

  return { debug, toggle }
}
