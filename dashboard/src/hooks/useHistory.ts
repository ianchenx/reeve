import { useCallback, useEffect, useState } from "react"
import type { HistoryGroup } from "@/types"
import { fetchHistory } from "@/api"

interface UseHistoryParams {
  project?: string
  q?: string
  agent?: string
  outcome?: string
  limit?: number
  page?: number
}

export function useHistory(params: UseHistoryParams = {}) {
  const [items, setItems] = useState<HistoryGroup[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  const limit = params.limit || 20
  const offset = ((params.page || 1) - 1) * limit

  const load = useCallback(() => {
    setLoading(true)
    fetchHistory({
      project: params.project,
      q: params.q,
      agent: params.agent,
      outcome: params.outcome,
      limit,
      offset,
    })
      .then(res => {
        setItems(res.items)
        setTotal(res.total)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [params.project, params.q, params.agent, params.outcome, limit, offset])

  useEffect(() => { load() }, [load])

  return { items, total, loading, reload: load, totalPages: Math.ceil(total / limit) }
}
