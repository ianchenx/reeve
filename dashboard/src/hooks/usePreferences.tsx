/**
 * usePreferences — layout preferences via React Context + localStorage.
 *
 * Simplified: fixed layouts per page, only observatory + detail are switchable.
 */
import { createContext, useContext, useState, useCallback, type ReactNode } from "react"
import type { LayoutVariant } from "@/components/observatory/layouts"
import type { DetailLayoutVariant } from "@/components/detail/layouts/types"
import type { HistoryLayoutVariant } from "@/components/history/types"

export interface Preferences {
  observatoryLayout: LayoutVariant
  historyLayout: HistoryLayoutVariant
  detailLayout: DetailLayoutVariant
}

const STORAGE_KEY = "reeve-preferences"

const DEFAULTS: Preferences = {
  observatoryLayout: "command-center",
  historyLayout: "table",
  detailLayout: "document",
}

function load(): Preferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULTS
    return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch {
    return DEFAULTS
  }
}

function save(prefs: Preferences): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
}

interface PreferencesContextValue {
  prefs: Preferences
  update: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null)

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Preferences>(load)

  const update = useCallback(<K extends keyof Preferences>(key: K, value: Preferences[K]) => {
    setPrefs(prev => {
      const next = { ...prev, [key]: value }
      save(next)
      return next
    })
  }, [])

  return (
    <PreferencesContext.Provider value={{ prefs, update }}>
      {children}
    </PreferencesContext.Provider>
  )
}

export function usePreferences(): PreferencesContextValue {
  const ctx = useContext(PreferencesContext)
  if (!ctx) throw new Error("usePreferences must be used within PreferencesProvider")
  return ctx
}
