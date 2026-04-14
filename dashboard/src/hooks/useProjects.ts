import { useEffect, useState } from "react"
import { SERVER_URL } from "@/api"

export interface ProjectDetail {
  slug: string
  repo: string
  team?: string
  name?: string
  agent?: string
  setup?: string
  post?: Record<string, string>
  baseBranch?: string
}

export function useProjects() {
  const [projects, setProjects] = useState<ProjectDetail[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let cancelled = false
    fetch(`${SERVER_URL}/api/projects`)
      .then(r => {
        if (!r.ok) throw new Error("Failed to load projects")
        return r.json()
      })
      .then(data => {
        if (!cancelled) {
          setProjects(data)
          setLoading(false)
        }
      })
      .catch(e => {
        if (!cancelled) {
          setError(e.message)
          setLoading(false)
        }
      })
    return () => { cancelled = true }
  }, [version])

  const refresh = () => setVersion(v => v + 1)

  return { projects, loading, error, refresh }
}
