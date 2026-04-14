// agent/prompt-builder.ts — Build implement/review prompts as plain strings.
// No template engine, no external files — prompts are hardcoded here.

import type { AgentTask } from "./runner"
import type { TaskTrace } from "../kernel/types"

// ── Types ──────────────────────────────────────────────────

interface ReviewPromptTask {
  identifier: string
  title: string
  description: string
  specFile?: string
  labels: string[]
  priority?: number | null
}

interface ReviewPromptMetadata {
  round: number
  maxRounds: number
  previousFeedback?: string
  resumeContext?: string
}

export type BuildPromptOptions = {
  task: AgentTask
}

// ── Build prompts ──────────────────────────────────────────

export function buildPrompt(options: BuildPromptOptions): string {
  const { task } = options
  const branch = `agent/${task.identifier.toLowerCase()}`

  return `You are an autonomous coding agent working on **${task.identifier}**: ${task.title}

**Branch:** \`${branch}\`
${task.description ? `\n${task.description}\n` : ""}`
}

export function buildReviewPrompt(options: {
  task: ReviewPromptTask
  review: ReviewPromptMetadata
  prUrl?: string
}): string {
  const { task, review, prUrl } = options

  const diffSection = prUrl
    ? `**Important**: Use the canonical PR diff to determine what changed:
\`\`\`bash
gh pr diff "${prUrl}"
\`\`\`
Do NOT use \`git diff main\` — local main may be stale in worktrees.`
    : `**Important**: Diff against \`origin/main\` (not local \`main\`):
\`\`\`bash
git diff origin/main...HEAD
\`\`\``

  const previousFeedbackSection = review.round > 1 && review.previousFeedback?.trim()
    ? `\n## Previous Review Feedback (Round ${review.round - 1})\n\n${review.previousFeedback}\n`
    : ""

  const resumeSection = review.resumeContext?.trim()
    ? `\n## Recovery Context\n\n${review.resumeContext}\n`
    : ""

  const specLine = task.specFile ? `\nSpec: docs/specs/${task.specFile}` : ""

  return `Review the code changes in this worktree. Do NOT modify any code.

${diffSection}

## Intent

${task.identifier} — ${task.title}
${task.description}${specLine}

Your job is to challenge whether the work achieves this intent well,
not whether the intent is correct.
${previousFeedbackSection}${resumeSection}
## Review Protocol

Adjust review depth to change size. For small changes (<100 lines), focus on correctness.
For large changes, also assess architecture and unnecessary complexity.

Check for:
- Bugs: null/undefined access, incorrect data-shape assumptions, race conditions,
  uncaught exceptions, missing error paths, security issues, broken edge cases.
- Structure: boundary violations, leaky abstractions, coupling, API contract drift.
- Complexity: duplicated logic, speculative abstractions, unused code paths, over-engineering.

## Filtering Rules

- If you cannot explain WHY something is a problem with a concrete failure scenario, do not report it.
- Do not speculate that a change might break other code unless you can identify the specific affected code path.
- Do not flag intentional design choices or style preferences unless they introduce a clear defect.
- Prefer false negatives over false positives — a missed nit is better than a wrong alarm.
- Report at most 5 findings. If more exist, keep the highest severity ones.

## Findings Output

### Summary
One paragraph: what changed, whether it achieves the intent, and where the risk is.

### Findings
- 🔴 critical / 🟠 high / 🟡 medium — \`file:line\` — concise title
  **Why**: concrete scenario where this breaks
  **Fix**: specific suggestion

### Judgment
Remove false positives. Call out any initial findings you rejected and why.

Current round: ${review.round} / ${review.maxRounds}`
}

// ── Review output contract ────────────────────────────────

export function buildReviewOutputContract(identifier: string, prUrl?: string): string {
  const prSection = prUrl
    ? `

Post your review as a PR comment:

\`\`\`bash
cat > /tmp/reeve-review-${identifier}.md << 'REVIEW_EOF'
## Review — ${identifier}

### Summary
<one-paragraph verdict>

### Stats
- **Files changed**: N | **Lines**: +X / -Y
- **Review effort**: N/5

<details>
<summary>Findings (N issues)</summary>

| # | Severity | Location | Issue |
|---|----------|----------|-------|
| 1 | 🔴 critical | \`file:line\` | title |

#### 1. 🔴 \`file:line\` — title
**Why**: ...
**Fix**: ...

</details>

**Verdict**: ✅ PASS / ❌ FAIL
REVIEW_EOF
gh pr comment "${prUrl}" --body-file /tmp/reeve-review-${identifier}.md
\`\`\``
    : ""

  return `

## Output Contract
${prSection}

After posting your review, write your verdict to \`verdict.txt\` in your initial working directory (NOT inside the repo subdirectory):

\`\`\`bash
echo "FAIL" > verdict.txt   # if critical/high-severity issues found
echo "PASS" > verdict.txt   # if all findings are acceptable
\`\`\`

You MUST write this file before finishing. The Reeve daemon reads it to determine whether to retry.`
}

// ── Retry context ──────────────────────────────────────────

export function buildRetrySection(trace: TaskTrace, attempt: number): string {
  const parts = [`## Retry Context (Attempt ${attempt})`]

  parts.push(`**Failure**: ${trace.gateReason}`)

  if (trace.detail) {
    parts.push(trace.detail)
  }

  if (trace.lastError) {
    parts.push(`**Error**: ${trace.lastError}`)
  }

  if (trace.diffStat) {
    parts.push(`**Files touched**:\n\`\`\`\n${trace.diffStat}\n\`\`\``)
  }

  parts.push("\nAddress the above issues. Do NOT repeat the same approach.")
  return parts.join("\n\n")
}
