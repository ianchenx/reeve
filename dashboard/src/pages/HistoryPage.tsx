/**
 * HistoryPage — multi-layout history browser.
 *
 * Layout is controlled by sidebar StyleSelector via usePreferences.
 * Filters are persisted in URL search params via TanStack Router.
 */
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/shared/EmptyState"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useHistory } from "@/hooks/useHistory"
import { useConfig } from "@/hooks/useConfig"
import { TableHistory } from "@/components/history"
import { SearchIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import { useNavigate } from "@tanstack/react-router"
import { historyRoute } from "@/router"

export function HistoryPage() {
  const { config } = useConfig()
  const navigate = useNavigate()
  const search = historyRoute.useSearch()

  const project = search.project ?? ""
  const q = search.q ?? ""
  const agent = search.agent ?? ""
  const outcome = search.outcome ?? ""
  const page = search.page ?? 1

  const { items, loading, totalPages } = useHistory({
    project: project || undefined,
    q: q || undefined,
    agent: agent || undefined,
    outcome: outcome || undefined,
    page,
    limit: 20,
  })

  // Update a search param in URL
  const setSearchParam = <K extends string>(key: K, value: string) => {
    navigate({
      to: "/history",
      search: (prev) => ({
        ...prev,
        [key]: value || undefined,
        ...(key !== "page" ? { page: undefined } : {}),
      }),
      replace: true,
    })
  }

  const setPage = (newPage: number) => {
    navigate({
      to: "/history",
      search: (prev) => ({ ...prev, page: newPage > 1 ? newPage : undefined }),
      replace: true,
    })
  }

  const handleSelectTask = (id: string) => {
    navigate({ to: "/history/$taskId", params: { taskId: id } })
  }


  return (
    <div className="flex flex-col h-full">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 px-5 py-3 shrink-0">
        <div className="relative">
          <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
          <Input
            value={q}
            onChange={e => setSearchParam("q", e.target.value)}
            placeholder="Search..."
            className="w-44 h-8 text-xs pl-8"
          />
        </div>
        <Input
          value={agent}
          onChange={e => setSearchParam("agent", e.target.value)}
          placeholder="Agent..."
          className="w-28 h-8 text-xs"
        />
        <Select value={project || "all"} onValueChange={(v: string | null) => setSearchParam("project", !v || v === "all" ? "" : v)}>
          <SelectTrigger className="w-36 h-8 text-xs">
            <SelectValue placeholder="All projects" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">All projects</SelectItem>
            {config?.projects.map(p => {
              const name = p.name ?? (p.repo.split("/").pop() ?? p.slug).replace(/[-_]/g, " ").replace(/\b\w/g, c => c.toUpperCase())
              return <SelectItem key={p.slug} value={p.slug} className="text-xs">{name}</SelectItem>
            })}
          </SelectContent>
        </Select>
        <Select value={outcome || "all"} onValueChange={(v: string | null) => setSearchParam("outcome", !v || v === "all" ? "" : v)}>
          <SelectTrigger className="w-28 h-8 text-xs">
            <SelectValue placeholder="Outcome" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">All</SelectItem>
            <SelectItem value="completed" className="text-xs">Completed</SelectItem>
            <SelectItem value="failed" className="text-xs">Failed</SelectItem>
          </SelectContent>
        </Select>

        {totalPages > 1 && (
          <div className="flex items-center gap-1 ml-auto">
            <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)} className="h-7 w-7 p-0">
              <ChevronLeftIcon className="h-3.5 w-3.5" />
            </Button>
            <span className="text-xs tabular-nums text-foreground/60 px-1.5 font-medium">{page}/{totalPages}</span>
            <Button variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="h-7 w-7 p-0">
              <ChevronRightIcon className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>

      {/* Active layout */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {!loading && items.length === 0 ? (
          <EmptyState
            icon={<SearchIcon className="h-5 w-5 text-muted-foreground" />}
            title="No matching tasks"
            description="Try adjusting your filters or search terms."
          />
        ) : (
          <TableHistory
            items={items}
            loading={loading}
            onSelectTask={handleSelectTask}
            config={config}
          />
        )}
      </div>
    </div>
  )
}
