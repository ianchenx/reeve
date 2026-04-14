import type { DashboardConfig, HistoryEntry, HistoryGroup, WorktreeStatusResponse } from "./types"

/** API base URL — set VITE_API_BASE in .env.local to point at a remote daemon */
export const SERVER_URL = import.meta.env.VITE_API_BASE ?? ""
const BASE = SERVER_URL
const AUTH_KEY = "reeve_dashboard_key"

export function getStoredKey(): string | null {
  return localStorage.getItem(AUTH_KEY)
}

export function setStoredKey(key: string) {
  localStorage.setItem(AUTH_KEY, key)
}

export function clearStoredKey() {
  localStorage.removeItem(AUTH_KEY)
}

function authHeaders(): HeadersInit {
  const key = getStoredKey()
  return key ? { Authorization: `Bearer ${key}` } : {}
}

async function authFetch(url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: { ...authHeaders(), ...init?.headers },
  })
  if (res.status === 401) throw new AuthError()
  return res
}

export class AuthError extends Error {
  constructor() { super("Unauthorized") }
}

export async function fetchConfig(): Promise<DashboardConfig> {
  const res = await authFetch(`${BASE}/api/config`)
  return res.json()
}

export async function fetchHistory(params?: {
  project?: string
  q?: string
  agent?: string
  outcome?: string
  limit?: number
  offset?: number
}): Promise<{ items: HistoryGroup[]; total: number }> {
  const qs = new URLSearchParams()
  if (params?.project) qs.set("project", params.project)
  if (params?.q) qs.set("q", params.q)
  if (params?.agent) qs.set("agent", params.agent)
  if (params?.outcome) qs.set("outcome", params.outcome)
  if (params?.limit) qs.set("limit", String(params.limit))
  if (params?.offset) qs.set("offset", String(params.offset))
  const res = await authFetch(`${BASE}/api/history?${qs}`)
  return res.json()
}

export async function fetchHistoryDetail(id: string): Promise<HistoryEntry> {
  const res = await authFetch(`${BASE}/api/history/${encodeURIComponent(id)}`)
  return res.json()
}

export async function fetchSession(id: string): Promise<{ events: unknown[] }> {
  const res = await authFetch(`${BASE}/api/history/${encodeURIComponent(id)}/session`)
  return res.json()
}

export async function fetchLiveSession(identifier: string): Promise<{ events: unknown[] }> {
  const res = await authFetch(`${BASE}/api/live/session/${encodeURIComponent(identifier)}`)
  return res.json()
}

export async function fetchPrompt(id: string): Promise<{ prompt: string }> {
  const res = await authFetch(`${BASE}/api/history/${encodeURIComponent(id)}/prompt`)
  return res.json()
}

async function authPost(url: string): Promise<Response> {
  const res = await fetch(url, { method: "POST", headers: authHeaders() })
  if (res.status === 401) throw new AuthError()
  return res
}

export async function triggerPoll(): Promise<void> {
  await authPost(`${BASE}/api/poll`)
}

export async function killProcess(identifier: string): Promise<void> {
  await authPost(`${BASE}/api/kill/${encodeURIComponent(identifier)}`)
}

export async function retryTask(identifier: string): Promise<void> {
  await authPost(`${BASE}/api/retry/${encodeURIComponent(identifier)}`)
}

export async function markFailed(identifier: string): Promise<void> {
  await authPost(`${BASE}/api/mark-failed/${encodeURIComponent(identifier)}`)
}

export async function fetchWorktreeStatus(identifier: string): Promise<WorktreeStatusResponse> {
  const res = await authFetch(`${BASE}/api/worktree/${encodeURIComponent(identifier)}`)
  if (!res.ok) throw new Error(`worktree status ${identifier}: ${res.status}`)
  return res.json()
}

export async function fetchFileDiff(identifier: string, filePath: string): Promise<{ path: string; diff: string }> {
  const res = await authFetch(`${BASE}/api/worktree/${encodeURIComponent(identifier)}/diff/${encodeURIComponent(filePath)}`)
  if (!res.ok) throw new Error(`file diff ${identifier}/${filePath}: ${res.status}`)
  return res.json()
}

export async function fetchIssueAttempts(issueId: string): Promise<{ items: HistoryGroup[]; total: number }> {
  const res = await authFetch(`${BASE}/api/history?identifier=${encodeURIComponent(issueId)}&limit=50`)
  return res.json()
}

export async function cleanTask(identifier: string): Promise<void> {
  await authPost(`${BASE}/api/tasks/${encodeURIComponent(identifier)}/clean`)
}

export async function cleanAllDone(): Promise<void> {
  await authPost(`${BASE}/api/clean-done`)
}

// ── Project Management ──────────────────────────────────

export interface GitHubRepo {
  name: string
  full_name: string
  default_branch: string
  private: boolean
  language: string | null
}

export interface GitHubReposResult {
  repos: GitHubRepo[]
  available: boolean
}

export async function fetchGitHubRepos(query?: string): Promise<GitHubReposResult> {
  const params = query ? `?q=${encodeURIComponent(query)}` : ""
  const res = await authFetch(`${BASE}/api/github/repos${params}`)
  return res.json()
}

export interface DetectResult {
  setup?: string
  inferredTeam?: string
  teams?: Array<{ key: string; name: string }>
  repoName?: string
  error?: string
}

export async function detectProject(repo: string): Promise<DetectResult> {
  const res = await authFetch(`${BASE}/api/projects/detect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ repo }),
  })
  return res.json()
}

export interface TeamProject {
  slugId: string
  name: string
}

export async function fetchTeamProjects(teamKey: string): Promise<TeamProject[]> {
  const res = await authFetch(`${BASE}/api/teams/${encodeURIComponent(teamKey)}/projects`)
  return res.json()
}

export interface ImportData {
  repo: string
  slug: string
  projectName?: string
  team: string
  baseBranch: string
  setup?: string
  agent?: string
  post?: Record<string, string>
}

export async function importProject(data: ImportData): Promise<{ ok: boolean; error?: string }> {
  const res = await authFetch(`${BASE}/api/projects/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })
  return res.json()
}

export async function removeProject(slug: string): Promise<{ ok: boolean; error?: string }> {
  const res = await authFetch(`${BASE}/api/projects/${encodeURIComponent(slug)}`, {
    method: "DELETE",
  })
  return res.json()
}

export interface UpdateProjectData {
  agent?: string | null
  setup?: string | null
  post?: Record<string, string> | null
}

export async function updateProject(slug: string, data: UpdateProjectData): Promise<{ ok: boolean; project?: Record<string, unknown>; error?: string }> {
  const res = await authFetch(`${BASE}/api/projects/${encodeURIComponent(slug)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })
  return res.json()
}

// ── Setup ───────────────────────────────────────────────

/** Lightweight gate — called on every page load. Fast, no network calls. */
export interface SetupCheck {
  configured: boolean
  runtimeActive: boolean
  hasApiKey: boolean
  projectCount: number
}

export async function fetchSetupCheck(): Promise<SetupCheck> {
  const res = await authFetch(`${BASE}/api/setup/check`)
  return res.json()
}

/** Full diagnostics — only called from SetupWizard. Slow (runs external commands). */
export interface SetupStatus {
  ready: boolean
  configured: boolean
  runtimeActive: boolean
  hasApiKey: boolean
  githubReady: boolean
  ghInstalled: boolean
  ghAuthenticated: boolean
  ghLogin: string
  ghStatusDetail: string
  gitConfigured: boolean
  gitUserName: string
  gitUserEmail: string
  gitHubReachable: boolean
  gitHubReachableDetail: string
  codexInstalled: boolean
  projectCount: number
  projects: Array<{ repo: string; team: string; linear: string }>
  agents: string[]
}

export async function fetchSetupStatus(): Promise<SetupStatus> {
  const res = await authFetch(`${BASE}/api/setup/status`)
  return res.json()
}

export interface SetupSaveResult {
  ok: boolean
  linearValid?: boolean
  linearError?: string
  teams: Array<{ key: string; name: string }>
}

export async function saveSetup(data: {
  linearApiKey?: string
  defaultAgent?: string
}): Promise<SetupSaveResult> {
  const res = await authFetch(`${BASE}/api/setup/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })
  return res.json()
}

export async function activateRuntime(): Promise<{ ok: boolean; error?: string }> {
  const res = await authFetch(`${BASE}/api/runtime/activate`, {
    method: "POST",
  })
  return res.json()
}

// ── Update Check ───────────────────────────────────────

export interface VersionInfo {
  current: string
  latest: string | null
  hasUpdate: boolean
}

export async function fetchVersion(): Promise<VersionInfo> {
  // No auth needed — endpoint is before auth middleware
  const res = await fetch(`${BASE}/api/version`)
  return res.json()
}
