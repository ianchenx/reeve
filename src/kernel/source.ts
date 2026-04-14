// source.ts — source interface
// Pluggable task source: Linear (default), GitHub Issues, Jira, etc.

import type { SourceItem } from "./types"

/**
 * Semantic disposition of a source item.
 * The Source adapter classifies tracker-specific states into these
 * universal categories. The kernel never sees raw state names.
 *
 * actionable — needs an agent running (Linear: Todo, In Progress)
 * passive    — waiting, no agent needed (Linear: In Review)
 * done       — terminal success (Linear: Done)
 * cancelled  — terminal failure/abandoned (Linear: Cancelled)
 * unknown    — source can't determine / item not found
 */
export type SourceDisposition =
  | "actionable"
  | "passive"
  | "done"
  | "cancelled"
  | "unknown"

/**
 * A Source polls an external tracker for work items and receives lifecycle callbacks.
 * Linear is the default implementation; the interface supports any tracker.
 */
export interface Source {
  /** Poll for new candidate items ready for dispatch. */
  poll(): Promise<SourceItem[]>

  /** Notify source that work has started on an item. */
  onStart(item: SourceItem): Promise<void>

  /** Notify source of final outcome. */
  onDone(item: SourceItem, outcome: "merged" | "closed" | "failed"): Promise<void>

  /** Return the semantic disposition of an item. */
  fetchDisposition(itemId: string): Promise<SourceDisposition>

  /** Detect PR URL from a worktree. Optional — only sources with VCS integration implement this. */
  detectPrUrl?(worktreeDir: string): Promise<string | undefined>
}
