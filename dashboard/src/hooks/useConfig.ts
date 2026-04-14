import { useEffect, useState } from "react"
import type { DashboardConfig } from "@/types"
import { fetchConfig } from "@/api"

let cached: DashboardConfig | null = null

export function useConfig() {
  const [config, setConfig] = useState<DashboardConfig | null>(cached)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (cached) return
    fetchConfig()
      .then(c => { cached = c; setConfig(c) })
      .catch(e => setError(String(e)))
  }, [])

  return { config, error }
}
