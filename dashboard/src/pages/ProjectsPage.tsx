import { useState, useCallback } from "react"
import { useProjects, type ProjectDetail } from "@/hooks/useProjects"
import { removeProject, updateProject } from "@/api"
import { AddProjectSheet } from "@/components/projects/AddProjectSheet"
import { ModelAvatar } from "@/components/shared/ModelAvatar"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  FolderGit2Icon,
  GitBranchIcon,
  SearchIcon,
  TerminalIcon,
  Trash2Icon,
  GithubIcon,
  PencilIcon,
  CheckIcon,
  XIcon,
  ExternalLinkIcon
} from "lucide-react"

// ── Shared Viewer Component ──────────────────────────────────────────────

function LinearIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M2.886 4.18A11.982 11.982 0 0 1 11.99 0C18.624 0 24 5.376 24 12.009c0 3.64-1.62 6.903-4.18 9.105L2.887 4.18ZM1.817 5.626l16.556 16.556c-.524.33-1.075.62-1.65.866L.951 7.277c.247-.575.537-1.126.866-1.65ZM.322 9.163l14.515 14.515c-.71.172-1.443.282-2.195.322L0 11.358a12 12 0 0 1 .322-2.195Zm-.17 4.862 9.823 9.824a12.02 12.02 0 0 1-9.824-9.824Z"/>
    </svg>
  )
}

function ProjectConfigViewer({ project }: { project: ProjectDetail }) {
  const hasReview = project.post ? "review" in project.post : false
  const activeRoles: { label: string; agent: string }[] = []
  if (hasReview) {
    activeRoles.push({ label: "Reviewer", agent: project.post!.review })
  }

  // Resolve agent display name
  const agentName = project.agent || "claude"

  return (
    <div className="space-y-6">
      {/* Agent + Roles — card style */}
      <div className="rounded-lg border p-4 space-y-3">
        {/* Agent row */}
        <div className="flex items-center gap-3">
          <ModelAvatar model={agentName} size="md" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium capitalize">{agentName}</div>
            <div className="text-[11px] text-muted-foreground">Default Agent</div>
          </div>
          {project.team && (
            <div className="text-right">
              <div className="text-sm font-medium">{project.team}</div>
              <div className="text-[11px] text-muted-foreground">Team</div>
            </div>
          )}
        </div>

        {/* Active roles */}
        {activeRoles.length > 0 && (
          <div className="flex gap-3 pt-2 border-t">
            {activeRoles.map(r => (
              <div key={r.label} className="flex items-center gap-2">
                <ModelAvatar model={r.agent === "auto" ? agentName : r.agent} size="sm" />
                <div>
                  <div className="text-xs font-medium capitalize">{r.label}</div>
                  <div className="text-[10px] text-muted-foreground capitalize">{r.agent}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Scripts */}
      {project.setup && (
        <div className="space-y-3">
          <h4 className="text-[11px] uppercase tracking-wider text-muted-foreground/60 font-semibold">Scripts</h4>
          <div className="space-y-3">
            <TerminalSnippet label="setup" cmd={project.setup} />
          </div>
        </div>
      )}
    </div>
  )
}

function TerminalSnippet({ label, cmd }: { label: string, cmd?: string }) {
  if (!cmd) return (
    <div className="text-sm flex justify-between border-b border-border/40 last:border-0 py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-muted-foreground/40 italic">not set</span>
    </div>
  )
  
  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground/70 font-medium tracking-wide uppercase">{label}</div>
      <div className="bg-muted/50 text-foreground font-mono text-xs px-3.5 py-3 rounded-lg flex items-start gap-3 border max-h-96 overflow-y-auto">
        <TerminalIcon className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground" />
        <pre className="whitespace-pre-wrap flex-1 leading-relaxed">{cmd}</pre>
      </div>
    </div>
  )
}

// ── Inline Edit Panel ────────────────────────────────────────────────────

const AGENT_OPTIONS = ["claude", "codex"] as const

function ProjectEditPanel({ project, onSave, onCancel }: {
  project: ProjectDetail
  onSave: () => void
  onCancel: () => void
}) {
  const [agent, setAgent] = useState(project.agent || "claude")
  const [setup, setSetup] = useState(project.setup || "")
  const [saving, setSaving] = useState(false)

  const [reviewEnabled, setReviewEnabled] = useState(project.post ? "review" in project.post : false)
  const [reviewAgent, setReviewAgent] = useState(project.post?.review || "codex")

  const handleSave = async () => {
    setSaving(true)
    try {
      const post = reviewEnabled ? { review: reviewAgent } : null
      await updateProject(project.slug, {
        agent,
        setup: setup.trim() || null,
        post,
      })
      onSave()
    } catch { /* TODO: toast */ }
    setSaving(false)
  }

  return (
    <div className="space-y-6">
      {/* Agent selector */}
      <div className="space-y-2">
        <label className="text-[11px] uppercase tracking-wider text-muted-foreground/60 font-semibold">Default Agent</label>
        <div className="flex gap-2 flex-wrap">
          {AGENT_OPTIONS.map(opt => (
            <button
              key={opt}
              onClick={() => setAgent(opt)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
                agent === opt
                  ? "border-primary bg-primary/10 text-primary ring-1 ring-primary/30"
                  : "border-border hover:border-muted-foreground/30 hover:bg-muted/50"
              }`}
            >
              <ModelAvatar model={opt} size="sm" />
              <span className="capitalize">{opt}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Setup command */}
      <div className="space-y-2">
        <label className="text-[11px] uppercase tracking-wider text-muted-foreground/60 font-semibold">Setup Command</label>
        <div className="flex items-center gap-2">
          <TerminalIcon className="w-4 h-4 text-muted-foreground shrink-0" />
          <input
            type="text"
            value={setup}
            onChange={e => setSetup(e.target.value)}
            placeholder="e.g. bun install"
            className="flex-1 h-9 px-3 text-sm rounded-md border font-mono bg-background focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-primary"
          />
        </div>
      </div>

      {/* Reviewer toggle + agent selector */}
      <div className="space-y-4">
        <label className="text-[11px] uppercase tracking-wider text-muted-foreground/60 font-semibold">Agent Roles</label>
        <div className="space-y-3">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">Review Agent</div>
                <div className="text-[11px] text-muted-foreground">Auto-review PRs after creation</div>
              </div>
              <Switch checked={reviewEnabled} onCheckedChange={setReviewEnabled} />
            </div>
            {reviewEnabled && (
              <div className="flex gap-2 flex-wrap pl-1">
                {AGENT_OPTIONS.map(opt => (
                  <button
                    key={opt}
                    onClick={() => setReviewAgent(opt)}
                    className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                      reviewAgent === opt
                        ? "border-primary bg-primary/10 text-primary ring-1 ring-primary/30"
                        : "border-border hover:border-muted-foreground/30 hover:bg-muted/50"
                    }`}
                  >
                    <ModelAvatar model={opt} size="sm" />
                    <span className="capitalize">{opt}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2 border-t">
        <button
          onClick={handleSave}
          disabled={saving}
          className="h-9 px-4 bg-primary text-primary-foreground text-sm font-medium rounded-md hover:bg-primary/90 transition-colors shadow-sm disabled:opacity-50 flex items-center gap-2"
        >
          <CheckIcon className="w-4 h-4" />
          {saving ? "Saving…" : "Save Changes"}
        </button>
        <button
          onClick={onCancel}
          className="h-9 px-4 text-sm font-medium rounded-md border hover:bg-muted transition-colors flex items-center gap-2"
        >
          <XIcon className="w-4 h-4" />
          Cancel
        </button>
      </div>
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function HealthBadge(_props: { project: ProjectDetail, showLabel?: boolean, showHealthy?: boolean }) {
  return null
}


// ── Main Page Component (Split View Only) ──────────────────────────────────

export function ProjectsPage() {
  const { projects, loading, refresh } = useProjects()
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null)
  const [addSheetOpen, setAddSheetOpen] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null) // slug being confirmed for delete
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [editing, setEditing] = useState(false)

  const handleDelete = useCallback(async (slug: string) => {
    setDeleteLoading(true)
    try {
      await removeProject(slug)
      if (selectedSlug === slug) setSelectedSlug(null)
      refresh()
    } catch { /* toast error in future */ }
    setDeleteLoading(false)
    setDeleting(null)
  }, [selectedSlug, refresh])

  const handleEditSaved = useCallback(() => {
    setEditing(false)
    refresh()
  }, [refresh])

  // Initialize selection once data loads
  if (!selectedSlug && projects.length > 0) {
    setSelectedSlug(projects[0].slug)
  }

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-[400px]" />
      </div>
    )
  }

  const filtered = projects.filter(p => 
    p.slug.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.repo.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const selected = filtered.find(p => p.slug === selectedSlug) || filtered[0]

  return (
    <div className="p-6 space-y-6 h-full flex flex-col">
      {/* Header controls (Unchanged) */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-2xl font-semibold">Projects</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Repositories managed by Reeve Kernel and their active configurations.
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative w-64 hidden sm:block">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input 
              type="text" 
              placeholder="Search projects..."
              className="w-full h-9 pl-9 pr-3 text-sm rounded-md border font-medium focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-primary shadow-sm bg-background"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Add project */}
          <button
            className="h-9 px-4 bg-primary text-primary-foreground text-sm font-medium rounded-md hover:bg-primary/90 transition-colors shadow-sm shrink-0 whitespace-nowrap"
            onClick={() => setAddSheetOpen(true)}
          >
            Add Project
          </button>
        </div>
      </div>

      {/* Main Content Area: Split View */}
      <div className="flex-1 min-h-0">
        {filtered.length === 0 ? (
          <div className="p-12 text-center border rounded-lg border-dashed">
            <p className="text-muted-foreground">No projects match the current search filters.</p>
          </div>
        ) : (
          <div className="flex h-full border rounded-xl overflow-hidden shadow-sm bg-card">
            {/* Left List */}
            <div className="w-80 border-r bg-muted/10 shrink-0 flex flex-col">
              <div className="p-3 border-b font-medium text-xs uppercase tracking-wider text-muted-foreground/70 flex items-center justify-between shrink-0">
                <span>Repositories</span>
                <span className="bg-muted px-2 py-0.5 rounded-full">{filtered.length} total</span>
              </div>
              <div className="overflow-y-auto flex-1 p-2 space-y-1">
                {filtered.map(p => {
                  const isSelected = p.slug === selected?.slug
                  return (
                    <button
                      key={p.slug}
                      onClick={() => setSelectedSlug(p.slug)}
                      className={`w-full text-left px-3 py-3 rounded-lg flex items-center justify-between transition-colors ${
                        isSelected 
                          ? "bg-primary text-primary-foreground shadow-sm" 
                          : "hover:bg-muted"
                      }`}
                    >
                      <div className="truncate pr-2">
                        <div className="font-medium text-sm truncate flex items-center gap-2">
                          {!isSelected && <FolderGit2Icon className="w-4 h-4 opacity-70" />}
                          {isSelected && <FolderGit2Icon className="w-4 h-4 opacity-100" />}
                          {p.repo.split("/").pop()}
                        </div>
                        <div className={`text-[11px] mt-1 font-mono truncate ${isSelected ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                          {p.repo.split("/").slice(-2).join("/")}
                        </div>
                      </div>
                      <div className={isSelected ? "text-primary-foreground" : ""}>
                         <HealthBadge project={p} showLabel={false} showHealthy={false} />
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Right Detail */}
            <div className="flex-1 overflow-y-auto bg-background selection:bg-primary/20">
              {selected ? (
                <div className="p-8 lg:p-10 max-w-5xl">
                  <div className="mb-8 flex items-start justify-between">
                    <div>
                      <h1 className="text-[28px] leading-tight font-bold tracking-tight mb-2">
                        {selected.repo.split("/").pop()}
                      </h1>
                      <div className="flex flex-wrap items-center gap-3 mt-4">
                        {/* GitHub */}
                        <div className="flex items-center gap-1.5 bg-muted/30 border rounded-md px-2.5 py-1.5 border-border/50">
                          <GithubIcon className="w-3.5 h-3.5 text-foreground/70" />
                          <span className="font-mono text-xs text-foreground/80 ml-0.5">{selected.repo.split("/").slice(-2).join("/")}</span>
                          <a
                            href={`https://github.com/${selected.repo.split("/").slice(-2).join("/")}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-muted-foreground/40 hover:text-foreground transition-colors ml-1"
                            title="Open on GitHub"
                          >
                            <ExternalLinkIcon className="w-3 h-3" />
                          </a>
                        </div>
                        
                        {/* Linear */}
                        <div className="flex items-center gap-1.5 bg-muted/30 border rounded-md px-2.5 py-1.5 border-border/50">
                          <LinearIcon className="w-3.5 h-3.5 text-foreground/70" />
                          <span className="text-xs font-medium text-foreground/80 ml-0.5">Team {selected.team}</span>
                          <a
                            href={`https://linear.app/project/${selected.slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-muted-foreground/40 hover:text-foreground transition-colors ml-1"
                            title="Open Project in Linear"
                          >
                            <ExternalLinkIcon className="w-3 h-3" />
                          </a>
                        </div>

                        {/* Base branch */}
                        {selected.baseBranch && (
                          <div className="flex items-center gap-1.5 bg-muted/30 border rounded-md px-2.5 py-1.5 border-border/50" title="Base branch">
                            <GitBranchIcon className="w-3.5 h-3.5 text-foreground/70" />
                            <span className="font-mono text-xs text-foreground/80 ml-0.5">{selected.baseBranch}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {!editing && (
                        <button
                          onClick={() => setEditing(true)}
                          className="p-1.5 rounded-md text-muted-foreground/50 hover:text-primary hover:bg-primary/10 transition-colors"
                          title="Edit project settings"
                        >
                          <PencilIcon className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={() => setDeleting(selected.slug)}
                        className="p-1.5 rounded-md text-muted-foreground/50 hover:text-red-500 hover:bg-red-500/10 transition-colors"
                        title="Remove project"
                      >
                        <Trash2Icon className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  {editing ? (
                    <ProjectEditPanel
                      project={selected}
                      onSave={handleEditSaved}
                      onCancel={() => setEditing(false)}
                    />
                  ) : (
                    <ProjectConfigViewer project={selected} />
                  )}
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  Select a project to view configuration details
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <AddProjectSheet
        open={addSheetOpen}
        onOpenChange={setAddSheetOpen}
        onAdded={refresh}
      />

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleting} onOpenChange={(open) => { if (!open) setDeleting(null) }}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Remove Project</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove <strong>{deleting}</strong> from Reeve? This only removes the configuration — your repository and history are not affected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              onClick={() => setDeleting(null)}
              className="h-9 px-4 text-sm font-medium rounded-md border hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => deleting && handleDelete(deleting)}
              disabled={deleteLoading}
              className="h-9 px-4 text-sm font-medium rounded-md bg-red-500 text-white hover:bg-red-600 transition-colors disabled:opacity-50"
            >
              {deleteLoading ? "Removing…" : "Remove"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
