/**
 * AddProjectSheet — Vercel-style two-step import flow.
 *
 * Step 1: Select a GitHub repo (auto-listed via `gh`)
 * Step 2: Configure — auto-detected settings with editable overrides
 *
 * UX rules:
 * - Linear Team: real dropdown from API, not text input
 * - Linear Project: show human-readable name, not slugId hash
 * - Validate: individual command rows with add/remove, not textarea
 */
import { useState, useCallback, useEffect, useRef } from "react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  fetchGitHubRepos,
  detectProject,
  fetchTeamProjects,
  importProject,
} from "@/api"
import type { GitHubRepo, DetectResult, TeamProject } from "@/api"
import {
  SearchIcon,
  XCircleIcon,
  Loader2Icon,
  LockIcon,
  GlobeIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ArrowLeftIcon,
  AlertTriangleIcon,
  CheckIcon,
  PlusIcon,
} from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"

interface AddProjectSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdded: () => void
}

type Step = "select" | "configure"
type SelectedProject = TeamProject | "create-new" | null

export function AddProjectSheet({ open, onOpenChange, onAdded }: AddProjectSheetProps) {
  // ── Global state ──
  const [step, setStep] = useState<Step>("select")
  const [error, setError] = useState<string | null>(null)

  // ── Step 1: Repo selection ──
  const [repos, setRepos] = useState<GitHubRepo[]>([])
  const [ghAvailable, setGhAvailable] = useState(true)
  const [loadingRepos, setLoadingRepos] = useState(false)
  const [search, setSearch] = useState("")

  // ── Step 2: Configure ──
  const [selectedRepo, setSelectedRepo] = useState("")
  const [baseBranch, setBaseBranch] = useState("main")
  const [detecting, setDetecting] = useState(false)
  const [detected, setDetected] = useState<DetectResult | null>(null)
  const [importing, setImporting] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)

  // Editable config fields
  const [team, setTeam] = useState("")
  const [teamProjects, setTeamProjects] = useState<TeamProject[]>([])
  const [selectedProject, setSelectedProject] = useState<SelectedProject>(null)
  const [loadingProjects, setLoadingProjects] = useState(false)
  const [setup, setSetup] = useState("")
  const [agent, setAgent] = useState("claude")
  const [reviewAgent, setReviewAgent] = useState<string | false>(false)

  // ── Load recent repos on open ──
  useEffect(() => {
    if (!open) return
    setLoadingRepos(true)
    fetchGitHubRepos()
      .then(result => {
        setRepos(result.repos)
        setGhAvailable(result.available)
      })
      .catch(() => setGhAvailable(false))
      .finally(() => setLoadingRepos(false))
  }, [open])

  // ── Server-side search with debounce ──
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => {
    if (!open || !ghAvailable) return
    if (!search.trim()) {
      // Reset to recent repos
      setLoadingRepos(true)
      fetchGitHubRepos()
        .then(result => setRepos(result.repos))
        .finally(() => setLoadingRepos(false))
      return
    }
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      setLoadingRepos(true)
      fetchGitHubRepos(search.trim())
        .then(result => setRepos(result.repos))
        .finally(() => setLoadingRepos(false))
    }, 300)
    return () => clearTimeout(searchTimer.current)
  }, [search, open, ghAvailable])

  const reset = useCallback(() => {
    setStep("select")
    setError(null)
    setRepos([])
    setSearch("")
    setSelectedRepo("")
    setBaseBranch("main")
    setDetecting(false)
    setDetected(null)
    setImporting(false)
    setAdvancedOpen(false)
    setTeam("")
    setTeamProjects([])
    setSelectedProject(null)
    setLoadingProjects(false)
    setSetup("")
    setAgent("claude")
    setReviewAgent(false)
  }, [])

  // ── Select a repo → move to configure ──
  const selectRepo = async (repo: string, defaultBranch: string) => {
    setSelectedRepo(repo)
    setBaseBranch(defaultBranch)
    setStep("configure")
    setDetecting(true)
    setError(null)

    try {
      const result = await detectProject(repo)
      setDetected(result)
      setTeamProjects([])
      setSelectedProject(null)
      // Pre-fill from detection
      if (result.inferredTeam) {
        setTeam(result.inferredTeam)
      } else if (result.teams?.length === 1) {
        setTeam(result.teams[0].key)
      } else {
        setTeam("")
      }
      setSetup(result.setup ?? "")
      // If config was detected, show advanced section
      if (result.setup) {
        setAdvancedOpen(true)
      }
    } catch {
      setError("Failed to detect project configuration")
    } finally {
      setDetecting(false)
    }
  }

  useEffect(() => {
    if (!team) {
      setTeamProjects([])
      setSelectedProject(null)
      setLoadingProjects(false)
      return
    }

    let cancelled = false
    const repoName = detected?.repoName ?? ""

    setLoadingProjects(true)
    setSelectedProject(null)
    setError(null)

    fetchTeamProjects(team)
      .then((projects) => {
        if (cancelled) return
        setTeamProjects(projects)
        const suggestedProject = suggestProject(projects, repoName)
        setSelectedProject(suggestedProject ?? "create-new")
      })
      .catch(() => {
        if (cancelled) return
        setTeamProjects([])
        setSelectedProject(null)
        setError("Failed to load Linear projects")
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingProjects(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [team, detected?.repoName])

  // ── Import ──
  const handleImport = async () => {
    if (!selectedRepo || !selectedProject || !team) return
    setImporting(true)
    setError(null)

    try {
      const repoName = detected?.repoName ?? selectedRepo.split("/").pop() ?? selectedRepo
      const result = await importProject({
        repo: selectedRepo,
        slug: selectedProject === "create-new" ? "" : selectedProject.slugId,
        projectName: selectedProject === "create-new" ? repoName : undefined,
        team,
        baseBranch,
        setup: setup || undefined,
        agent: agent !== "claude" ? agent : undefined,
        post: reviewAgent ? { review: reviewAgent } : undefined,
      })
      if (result.ok) {
        onAdded()
        if (result.missingStates?.length) {
          const names = result.missingStates.map(m => m.name).join(", ")
          setError(`Project imported, but Linear workflow states could not be created: ${names}. Create them manually in Linear, then retry.`)
        } else if (result.activationError) {
          setError(`Project imported, but Reeve runtime failed to start: ${result.activationError}. Close this dialog and use the Start button to retry.`)
        } else {
          onOpenChange(false)
          reset()
        }
      } else {
        setError(result.error ?? "Import failed")
      }
    } catch {
      setError("Import failed")
    } finally {
      setImporting(false)
    }
  }

  const handleOpenChange = (next: boolean) => {
    if (!next) reset()
    onOpenChange(next)
  }

  // repos are already filtered server-side

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {step === "configure" && (
              <button
                onClick={() => setStep("select")}
                className="p-1 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeftIcon className="h-4 w-4" />
              </button>
            )}
            {step === "select" ? "Import Project" : "Configure"}
          </SheetTitle>
          <SheetDescription>
            {step === "select"
              ? "Select a GitHub repository to import into Reeve."
              : `Configuring ${selectedRepo}`
            }
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4">
          {step === "select" ? (
            <StepSelect
              repos={repos}
              ghAvailable={ghAvailable}
              loading={loadingRepos}
              search={search}
              onSearchChange={setSearch}
              onSelect={selectRepo}
            />
          ) : (
            <StepConfigure
              repo={selectedRepo}
              detecting={detecting}
              detected={detected}
              team={team}
              onTeamChange={setTeam}
              teamProjects={teamProjects}
              selectedProject={selectedProject}
              onSelectedProjectChange={setSelectedProject}
              loadingProjects={loadingProjects}
              setup={setup}
              onSetupChange={setSetup}
              agent={agent}
              onAgentChange={setAgent}
              reviewAgent={reviewAgent}
              onReviewAgentChange={setReviewAgent}
              advancedOpen={advancedOpen}
              onAdvancedToggle={() => setAdvancedOpen(o => !o)}
              importing={importing}
              onImport={handleImport}
              error={error}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

// ── Step 1: Repo Selection ──────────────────────────────

interface StepSelectProps {
  repos: GitHubRepo[]
  ghAvailable: boolean
  loading: boolean
  search: string
  onSearchChange: (v: string) => void
  onSelect: (repo: string, defaultBranch: string) => void
}

function StepSelect({
  repos, ghAvailable, loading, search, onSearchChange, onSelect,
}: StepSelectProps) {
  return (
    <div className="space-y-4">
      {ghAvailable ? (
        <>
          {/* Search */}
          <div className="relative">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search your repositories…"
              value={search}
              onChange={e => onSearchChange(e.target.value)}
              className="pl-9 h-9 text-sm"
            />
          </div>

          {/* Repo list */}
          {!loading && repos.length > 0 && !search && (
            <p className="text-[11px] text-muted-foreground">Recent repositories</p>
          )}
          <div className="border rounded-lg divide-y max-h-[340px] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2Icon className="h-4 w-4 animate-spin mr-2" />
                <span className="text-sm">{search ? "Searching…" : "Loading…"}</span>
              </div>
            ) : repos.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                {search ? "No matching repositories" : "No repositories found"}
              </div>
            ) : (
              repos.map(repo => (
                <button
                  key={repo.full_name}
                  onClick={() => onSelect(repo.full_name, repo.default_branch)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors group"
                >
                  {repo.private ? (
                    <LockIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                  ) : (
                    <GlobeIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{repo.full_name}</div>
                  </div>
                  {repo.language && (
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      {repo.language}
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    Import →
                  </span>
                </button>
              ))
            )}
          </div>
        </>
      ) : (
        /* GitHub not connected — guide to setup */
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-amber-600 dark:text-amber-400">
            <AlertTriangleIcon className="h-4 w-4" />
            GitHub not connected
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Install and sign in to <code className="px-1 py-0.5 rounded bg-muted text-foreground">gh</code>,
            then make sure local git can reach GitHub.
          </p>
        </div>
      )}
    </div>
  )
}

// ── Step 2: Configure ───────────────────────────────────

function normalizeProjectName(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, "")
}

function suggestProject(projects: TeamProject[], repoName: string): TeamProject | null {
  if (!repoName.trim()) {
    return null
  }

  const normalizedRepoName = normalizeProjectName(repoName)
  let bestMatch: TeamProject | null = null
  let bestScore = 0

  for (const project of projects) {
    const normalizedProjectName = normalizeProjectName(project.name)
    let score = 0

    if (project.name.trim().toLowerCase() === repoName.trim().toLowerCase()) {
      score = 4
    } else if (normalizedProjectName === normalizedRepoName) {
      score = 3
    } else if (normalizedProjectName.includes(normalizedRepoName) || normalizedRepoName.includes(normalizedProjectName)) {
      score = 2
    } else if (project.name.toLowerCase().includes(repoName.trim().toLowerCase())) {
      score = 1
    }

    if (score > bestScore) {
      bestScore = score
      bestMatch = project
    }
  }

  return bestMatch
}

interface StepConfigureProps {
  repo: string
  detecting: boolean
  detected: DetectResult | null
  team: string
  onTeamChange: (v: string) => void
  teamProjects: TeamProject[]
  selectedProject: SelectedProject
  onSelectedProjectChange: (project: SelectedProject) => void
  loadingProjects: boolean
  setup: string
  onSetupChange: (v: string) => void
  agent: string
  onAgentChange: (v: string) => void
  reviewAgent: string | false
  onReviewAgentChange: (v: string | false) => void
  advancedOpen: boolean
  onAdvancedToggle: () => void
  importing: boolean
  onImport: () => void
  error: string | null
}

function StepConfigure({
  repo, detecting, detected,
  team, onTeamChange,
  teamProjects,
  selectedProject, onSelectedProjectChange,
  loadingProjects,
  setup, onSetupChange,
  agent, onAgentChange,
  reviewAgent, onReviewAgentChange,
  advancedOpen, onAdvancedToggle,
  importing, onImport,
  error,
}: StepConfigureProps) {
  const [projectPickerOpen, setProjectPickerOpen] = useState(false)
  const [projectQuery, setProjectQuery] = useState("")

  useEffect(() => {
    setProjectPickerOpen(false)
    setProjectQuery("")
  }, [team, selectedProject])

  if (detecting) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
        <Loader2Icon className="h-5 w-5 animate-spin" />
        <span className="text-sm">Detecting configuration…</span>
      </div>
    )
  }

  const teams = detected?.teams ?? []
  const canImport = !!selectedProject && !!team && !importing
  const filteredProjects = teamProjects.filter((project) => {
    const query = projectQuery.trim().toLowerCase()
    if (!query) return true
    return project.name.toLowerCase().includes(query) || project.slugId.toLowerCase().includes(query)
  })
  const createLabel = detected?.repoName ?? repo.split("/").pop() ?? repo
  const selectedLabel = selectedProject === "create-new"
    ? `Create ${createLabel}`
    : selectedProject?.name ?? "Select a project…"

  return (
    <div className="space-y-5">
      {/* Repository name (read-only) */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Repository</Label>
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/30 border text-sm font-mono">
          {repo}
        </div>
      </div>

      {/* Linear Team — real dropdown */}
      <div className="space-y-1.5">
        <Label htmlFor="import-team" className="text-xs text-muted-foreground">
          Linear Team
        </Label>
        <Select value={team} onValueChange={(v) => onTeamChange(v ?? "")} disabled={teams.length === 0}>
          <SelectTrigger className="w-full h-9 text-sm" id="import-team">
            <SelectValue placeholder={teams.length > 0 ? "Select a team…" : "No teams available"} />
          </SelectTrigger>
          <SelectContent>
            {teams.map(t => (
              <SelectItem key={t.key} value={t.key}>
                {t.name} ({t.key})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {teams.length === 0 && (
          <p className="text-[11px] text-amber-500">
            Couldn&apos;t load Linear teams. Check your saved Linear key and try again.
          </p>
        )}
        {teams.length > 0 && !team && (
          <p className="text-[11px] text-amber-500">
            Please select a team
          </p>
        )}
      </div>

      {/* Linear Project */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">
          Linear Project
        </Label>
        <Popover open={projectPickerOpen} onOpenChange={setProjectPickerOpen}>
          <PopoverTrigger
            disabled={!team || loadingProjects}
            className={cn(
              "flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm transition-colors",
              "focus:outline-none focus:ring-1 focus:ring-ring",
              !team || loadingProjects ? "cursor-not-allowed bg-muted/30 text-muted-foreground" : "bg-transparent text-foreground"
            )}
          >
            <span className="truncate text-left">
              {loadingProjects ? "Loading projects…" : selectedLabel}
            </span>
            {loadingProjects ? (
              <Loader2Icon className="h-4 w-4 shrink-0 animate-spin" />
            ) : (
              <ChevronDownIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[var(--anchor-width)] p-2">
            <div className="space-y-2">
              <Input
                value={projectQuery}
                onChange={e => setProjectQuery(e.target.value)}
                placeholder="Search projects…"
                className="h-8 text-xs"
              />
              <div className="max-h-64 space-y-1 overflow-y-auto">
                {filteredProjects.length === 0 ? (
                  <div className="px-2 py-2 text-xs text-muted-foreground">
                    No matching projects
                  </div>
                ) : (
                  filteredProjects.map((project) => {
                    const isSelected = selectedProject !== "create-new" && selectedProject?.slugId === project.slugId
                    return (
                      <button
                        key={project.slugId}
                        type="button"
                        onClick={() => {
                          onSelectedProjectChange(project)
                          setProjectPickerOpen(false)
                          setProjectQuery("")
                        }}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted/50"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{project.name}</span>
                          <span className="block text-[10px] text-muted-foreground">{project.slugId}</span>
                        </span>
                        {isSelected && <CheckIcon className="h-4 w-4 shrink-0 text-foreground" />}
                      </button>
                    )
                  })
                )}
              </div>
              <div className="border-t pt-2">
                <button
                  type="button"
                  onClick={() => {
                    onSelectedProjectChange("create-new")
                    setProjectPickerOpen(false)
                    setProjectQuery("")
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted/50"
                >
                  <PlusIcon className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{`Create ${createLabel}`}</span>
                  {selectedProject === "create-new" && <CheckIcon className="h-4 w-4 shrink-0 text-foreground" />}
                </button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
        {!team && (
          <p className="text-[11px] text-amber-500">Please select a team first</p>
        )}
      </div>

      {/* Default Agent — top-level, not hidden in advanced */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">
          Default Agent
        </Label>
        <Select value={agent} onValueChange={(v) => onAgentChange(v ?? "claude")}>
          <SelectTrigger className="w-full h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="claude">Claude</SelectItem>
            <SelectItem value="codex">Codex</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Reviewer toggle */}
      <div className="space-y-3">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-xs">Review Agent</Label>
              <p className="text-[10px] text-muted-foreground">Auto-review PRs after creation</p>
            </div>
            <Switch checked={!!reviewAgent} onCheckedChange={(on) => onReviewAgentChange(on ? "codex" : false)} />
          </div>
          {reviewAgent && (
            <Select value={reviewAgent} onValueChange={(v) => v && onReviewAgentChange(v)}>
              <SelectTrigger className="w-full h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="codex">Codex</SelectItem>
                <SelectItem value="claude">Claude</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* Advanced: Build & Development Settings */}
      <div className="border rounded-lg">
        <button
          onClick={onAdvancedToggle}
          className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          {advancedOpen ? (
            <ChevronDownIcon className="h-4 w-4" />
          ) : (
            <ChevronRightIcon className="h-4 w-4" />
          )}
          Build & Development Settings
          {setup && !advancedOpen && (
            <Badge variant="secondary" className="text-[10px] ml-auto">configured</Badge>
          )}
        </button>

        {advancedOpen && (
          <div className="px-3 pb-3 space-y-4 border-t pt-3">
            {/* Setup command */}
            <div className="space-y-1.5">
              <Label htmlFor="import-setup" className="text-xs text-muted-foreground">
                Setup Command
              </Label>
              <Input
                id="import-setup"
                value={setup}
                onChange={e => onSetupChange(e.target.value)}
                placeholder="bun install"
                className="h-8 text-xs font-mono"
              />
              {detected?.setup && (
                <p className="text-[10px] text-muted-foreground">Auto-detected from lockfile</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
          <XCircleIcon className="h-4 w-4" />
          {error}
        </div>
      )}

      {/* Import button */}
      <Button
        onClick={onImport}
        disabled={!canImport}
        className="w-full"
      >
        {importing ? (
          <>
            <Loader2Icon className="h-4 w-4 mr-2 animate-spin" />
            Importing…
          </>
        ) : (
          "Import Project"
        )}
      </Button>
    </div>
  )
}
