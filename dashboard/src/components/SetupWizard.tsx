/**
 * SetupWizard — Dashboard-first onboarding.
 *
 * Shown when Reeve starts in dashboard-only mode.
 * Two steps:
 *   1. Connect Linear and verify local GitHub tooling
 *   2. Import first project (reuses AddProjectSheet)
 *
 * After both are complete, exits the wizard.
 */
import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { fetchSetupStatus, saveSetup } from "@/api"
import type { SetupStatus } from "@/api"
import { AddProjectSheet } from "@/components/projects/AddProjectSheet"
import {
  CheckCircle2Icon,
  Loader2Icon,
  KeyIcon,
  FolderGit2Icon,
  AlertTriangleIcon,
  ExternalLinkIcon,
  ArrowRightIcon,
  GithubIcon,
  GitCommitHorizontalIcon,
  CpuIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface SetupWizardProps {
  onComplete: () => void
}

type WizardStep = "loading" | "connect" | "project"

const AGENT_LABELS: Record<"claude" | "codex", string> = {
  claude: "Claude Code CLI",
  codex: "Codex CLI",
}

export function SetupWizard({ onComplete }: SetupWizardProps) {
  const [status, setStatus] = useState<SetupStatus | null>(null)
  const [step, setStep] = useState<WizardStep>("loading")

  const [linearKey, setLinearKey] = useState("")
  const [saving, setSaving] = useState(false)
  const [linearError, setLinearError] = useState<string | null>(null)
  const [editingLinearKey, setEditingLinearKey] = useState(false)

  const [addProjectOpen, setAddProjectOpen] = useState(false)

  const applyStatus = useCallback((nextStatus: SetupStatus) => {
    setStatus(nextStatus)
    if (nextStatus.ready || nextStatus.configured) {
      onComplete()
      return
    }
    const hasAgent = nextStatus.agents.some(a => a.installed)
    if (!nextStatus.hasApiKey || !nextStatus.githubReady || !hasAgent) {
      setStep("connect")
    } else {
      setStep("project")
    }
  }, [onComplete])

  useEffect(() => {
    fetchSetupStatus()
      .then(applyStatus)
      .catch(() => setStep("connect"))
  }, [applyStatus])

  const handleSave = async () => {
    if (!linearKey.trim() && !status?.hasApiKey) return
    setSaving(true)
    setLinearError(null)

    try {
      const nextLinearKey = linearKey.trim()

      if (nextLinearKey) {
        const result = await saveSetup({ linearApiKey: nextLinearKey })
        if (!result.linearValid) {
          setLinearError(result.linearError ?? "Invalid Linear API key")
          setSaving(false)
          return
        }
        setEditingLinearKey(false)
      }

      const nextStatus = await fetchSetupStatus()
      applyStatus(nextStatus)
    } catch {
      setLinearError("Failed to save. Check your connection.")
    } finally {
      setSaving(false)
    }
  }

  const handleProjectAdded = () => {
    setAddProjectOpen(false)
    fetchSetupStatus().then(applyStatus).catch(() => {})
  }

  if (step === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2Icon className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Welcome to Reeve</h1>
          <p className="text-sm text-muted-foreground">
            Let&apos;s connect Linear and verify your local GitHub setup.
          </p>
        </div>

        <div className="flex items-center justify-center gap-3">
          <StepIndicator
            number={1}
            label="Connect"
            active={step === "connect"}
            done={!!status?.hasApiKey && !!status?.githubReady && !!status?.agents.some(a => a.installed)}
          />
          <div className="h-px w-8 bg-border" />
          <StepIndicator
            number={2}
            label="Add Project"
            active={step === "project"}
            done={(status?.projectCount ?? 0) > 0}
          />
        </div>

        <div className="border rounded-xl p-6 bg-card shadow-sm">
          {step === "connect" && (
            <div className="space-y-5">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <KeyIcon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h2 className="font-medium">Linear API Key</h2>
                    <p className="text-xs text-muted-foreground">Required — Reeve monitors Linear issues.</p>
                  </div>
                </div>

                {status?.hasApiKey && !editingLinearKey ? (
                  <div className="rounded-lg border p-3 space-y-3 text-sm">
                    <StatusRow
                      ok
                      label="Linear connection"
                      value="Linear is already connected"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full text-sm"
                      onClick={() => {
                        setEditingLinearKey(true)
                        setLinearError(null)
                      }}
                    >
                      Change Linear API key
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="space-y-1.5">
                      <Input
                        id="setup-linear-key"
                        type="password"
                        value={linearKey}
                        onChange={e => { setLinearKey(e.target.value); setLinearError(null) }}
                        placeholder="lin_api_…"
                        className="h-9 font-mono text-sm"
                      />
                      <a
                        href="https://linear.app/settings/api"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary transition-colors"
                      >
                        Get your API key from Linear Settings
                        <ExternalLinkIcon className="h-3 w-3" />
                      </a>
                    </div>
                    {status?.hasApiKey && (
                      <Button
                        type="button"
                        variant="ghost"
                        className="w-full text-sm"
                        onClick={() => {
                          setEditingLinearKey(false)
                          setLinearKey("")
                          setLinearError(null)
                        }}
                      >
                        Keep current Linear key
                      </Button>
                    )}
                  </div>
                )}

                {linearError && (
                  <div className="flex items-center gap-2 text-sm text-red-500">
                    <AlertTriangleIcon className="h-4 w-4 shrink-0" />
                    {linearError}
                  </div>
                )}
              </div>

              <div className="h-px bg-border" />

              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-muted/50 flex items-center justify-center">
                    <CpuIcon className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <h2 className="font-medium">Coding Agents</h2>
                    <p className="text-xs text-muted-foreground">
                      Install at least one agent CLI on this machine.
                    </p>
                  </div>
                </div>

                <div className="rounded-lg border p-3 space-y-3 text-sm">
                  {status?.agents.map(agent => (
                    <StatusRow
                      key={agent.name}
                      ok={agent.installed}
                      label={AGENT_LABELS[agent.name]}
                      value={
                        agent.installed
                          ? `${AGENT_LABELS[agent.name]} is installed`
                          : `Install ${agent.name} to enable this agent`
                      }
                    />
                  ))}
                </div>
              </div>

              <div className="h-px bg-border" />

              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-muted/50 flex items-center justify-center">
                    <GithubIcon className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <h2 className="font-medium">GitHub CLI</h2>
                    <p className="text-xs text-muted-foreground">
                      PRs and repo browsing use your local <code className="px-1 py-0.5 rounded bg-muted text-foreground">gh</code> login.
                    </p>
                  </div>
                </div>

                <div className="rounded-lg border p-3 space-y-3 text-sm">
                  <StatusRow
                    ok={!!status?.ghAuthenticated}
                    label="GitHub account"
                    value={status?.ghLogin || status?.ghStatusDetail || "Run gh auth login"}
                  />
                  <a
                    href="https://cli.github.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary transition-colors"
                  >
                    Install or sign in with GitHub CLI
                    <ExternalLinkIcon className="h-3 w-3" />
                  </a>
                </div>
              </div>

              <div className="h-px bg-border" />

              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-muted/50 flex items-center justify-center">
                    <GitCommitHorizontalIcon className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <h2 className="font-medium">Git Identity</h2>
                    <p className="text-xs text-muted-foreground">
                      Commits use your local git name and email. Push and pull must already work on this machine.
                    </p>
                  </div>
                </div>

                <div className="rounded-lg border p-3 space-y-3 text-sm">
                  <StatusRow
                    ok={!!status?.gitConfigured}
                    label="Commit identity"
                    value={
                      status?.gitConfigured
                        ? `${status.gitUserName} <${status.gitUserEmail}>`
                        : "Set git config --global user.name and user.email"
                    }
                  />
                  <StatusRow
                    ok={!!status?.gitHubReachable}
                    label="GitHub via git"
                    value={status?.gitHubReachableDetail || "Checking git connectivity"}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    PRs use the <code className="px-1 py-0.5 rounded bg-muted text-foreground">gh</code> account above.
                    Commits use the git identity shown here. Check both before continuing.
                  </p>
                  {!!status?.ghAuthenticated && !status?.githubReady && (
                    <div className="flex items-center gap-2 text-amber-500 text-xs">
                      <AlertTriangleIcon className="h-4 w-4 shrink-0" />
                      GitHub CLI is ready, but your local git setup is still incomplete.
                    </div>
                  )}
                  <a
                    href="https://docs.github.com/en/get-started/git-basics/set-up-git"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary transition-colors"
                  >
                    Set up git for GitHub
                    <ExternalLinkIcon className="h-3 w-3" />
                  </a>
                  {!status?.githubReady && (
                    <div className="flex items-center gap-2 text-amber-500 text-xs">
                      <AlertTriangleIcon className="h-4 w-4 shrink-0" />
                      Reeve will not proceed until both GitHub CLI and git are ready.
                    </div>
                  )}
                </div>
              </div>

              {status && (() => {
                const detected = status.agents.filter(a => a.installed)
                return (
                  <div className="rounded-lg bg-muted/30 p-3 space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">Detected Agents</p>
                    <div className="flex gap-2">
                      {detected.length > 0 ? (
                        detected.map(a => (
                          <Badge key={a.name} variant="secondary" className="text-[10px]">
                            {AGENT_LABELS[a.name]}
                          </Badge>
                        ))
                      ) : (
                        <p className="text-[11px] text-muted-foreground">
                          No agent CLIs found. Install at least one ({status.agents.map(a => a.name).join(", ")}).
                        </p>
                      )}
                    </div>
                  </div>
                )
              })()}

              <Button
                onClick={handleSave}
                disabled={(!linearKey.trim() && !status?.hasApiKey) || saving}
                className="w-full"
              >
                {saving ? (
                  <>
                    <Loader2Icon className="h-4 w-4 mr-2 animate-spin" />
                    Validating…
                  </>
                ) : (
                  <>
                    Save and Re-check
                    <ArrowRightIcon className="h-4 w-4 ml-2" />
                  </>
                )}
              </Button>
            </div>
          )}

          {step === "project" && (
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <FolderGit2Icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="font-medium">Add Your First Project</h2>
                  <p className="text-xs text-muted-foreground">
                    Import a GitHub repo for Reeve to manage.
                  </p>
                </div>
              </div>

              {(status?.projectCount ?? 0) > 0 ? (
                <div className="space-y-3">
                  <div className="rounded-lg border p-3 space-y-2">
                    {status?.projects.map(p => (
                      <div key={p.repo} className="flex items-center gap-2 text-sm">
                        <CheckCircle2Icon className="h-4 w-4 text-emerald-500" />
                        <span className="font-mono text-xs">{p.repo.split("/").slice(-2).join("/")}</span>
                        <Badge variant="outline" className="text-[10px] ml-auto">{p.team}</Badge>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setAddProjectOpen(true)}
                      className="flex-1"
                    >
                      Add Another
                    </Button>
                    <Button onClick={onComplete} className="flex-1">
                      Continue
                      <ArrowRightIcon className="h-4 w-4 ml-2" />
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  onClick={() => setAddProjectOpen(true)}
                  className="w-full"
                >
                  <FolderGit2Icon className="h-4 w-4 mr-2" />
                  Import Project
                </Button>
              )}
            </div>
          )}
        </div>

        <p className="text-center text-[11px] text-muted-foreground">
          You can also configure Reeve from the command line:{" "}
          <code className="px-1 py-0.5 rounded bg-muted">reeve init</code>
        </p>
      </div>

      <AddProjectSheet
        open={addProjectOpen}
        onOpenChange={setAddProjectOpen}
        onAdded={handleProjectAdded}
      />
    </div>
  )
}

function StatusRow({ ok, label, value }: { ok: boolean; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      {ok ? (
        <CheckCircle2Icon className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
      ) : (
        <AlertTriangleIcon className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
      )}
      <div className="min-w-0">
        <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
        <p className="text-sm break-words">{value}</p>
      </div>
    </div>
  )
}

function StepIndicator({
  number, label, active, done,
}: {
  number: number
  label: string
  active: boolean
  done: boolean
}) {
  return (
    <div className={cn("flex items-center gap-2", active ? "text-foreground" : "text-muted-foreground")}>
      {done ? (
        <CheckCircle2Icon className="h-5 w-5 text-emerald-500" />
      ) : (
        <div className={cn(
          "h-5 w-5 rounded-full border flex items-center justify-center text-[10px] font-medium",
          active ? "border-primary text-primary" : "border-muted-foreground/30"
        )}>
          {number}
        </div>
      )}
      <span className="text-xs font-medium">{label}</span>
    </div>
  )
}
