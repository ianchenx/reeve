/**
 * router.ts — TanStack Router (code-based) route tree.
 *
 * Route structure:
 *   rootRoute (Shell layout + providers)
 *   ├── / → redirect to /board
 *   ├── /board → BoardPage
 *   ├── /board/$agentId → AgentObservatoryPage
 *   ├── /history → HistoryPage (with search params)
 *   ├── /history/$taskId → TaskDetailPage
 *   └── /system → SystemPage
 */
import {
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from "@tanstack/react-router"
import { z } from "zod"
import { zodValidator } from "@tanstack/zod-adapter"

import { RootLayout } from "@/components/layout/RootLayout"
import { BoardPage } from "@/pages/BoardPage"
import { AgentObservatoryPage } from "@/pages/AgentObservatoryPage"
import { HistoryPage } from "@/pages/HistoryPage"
import { TaskDetailPage } from "@/pages/TaskDetailPage"
import { SystemPage } from "@/pages/SystemPage"
import { ProjectsPage } from "@/pages/ProjectsPage"

// ── Root route ──────────────────────────────────────────────
const rootRoute = createRootRoute({
  component: RootLayout,
})

// ── Index → redirect to /board ─────────────────────────────
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/board" })
  },
})

// ── /overview → redirect to /board (legacy) ─────────────────
const overviewRedirectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "overview",
  beforeLoad: () => {
    throw redirect({ to: "/board" })
  },
})

// ── /projects ────────────────────────────────────────────────
const projectsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "projects",
  component: ProjectsPage,
})

// ── /board → BoardPage (no children layout needed) ──────────
const boardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "board",
  component: BoardPage,
})

// ── /board/$agentId → AgentObservatoryPage ──────────────────
// This is a SIBLING route at root level, not a child of board.
// This way /board shows BoardPage and /board/:id replaces it entirely.
const agentObservatoryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "board/$agentId",
  component: AgentObservatoryPage,
})

// ── /history — search params for filters ────────────────────
const historySearchSchema = z.object({
  project: z.string().optional().catch(undefined),
  q: z.string().optional().catch(undefined),
  agent: z.string().optional().catch(undefined),
  outcome: z.string().optional().catch(undefined),
  page: z.number().optional().catch(undefined),
})

export type HistorySearch = z.infer<typeof historySearchSchema>

const historyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "history",
  component: HistoryPage,
  validateSearch: zodValidator(historySearchSchema),
})

// ── /history/$taskId ────────────────────────────────────────
// Same pattern: sibling at root level so it replaces HistoryPage entirely.
const taskDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "history/$taskId",
  component: TaskDetailPage,
})

// ── /system ─────────────────────────────────────────────────
const systemRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "system",
  component: SystemPage,
})

// ── Route tree ──────────────────────────────────────────────
const routeTree = rootRoute.addChildren([
  indexRoute,
  overviewRedirectRoute,
  projectsRoute,
  boardRoute,
  agentObservatoryRoute,
  historyRoute,
  taskDetailRoute,
  systemRoute,
])

// ── Router instance ─────────────────────────────────────────
export const router = createRouter({ routeTree })

// ── Type registration ───────────────────────────────────────
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}

// ── Export routes for useParams/useSearch in pages ───────────
export {
  rootRoute,
  projectsRoute,
  boardRoute,
  agentObservatoryRoute,
  historyRoute,
  taskDetailRoute,
  systemRoute,
}
