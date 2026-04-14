import type { ReactNode } from "react"

interface EmptyStateProps {
  icon: ReactNode
  title: string
  description?: string
  action?: ReactNode
  /** Extra content below the description, e.g. status indicators */
  footer?: ReactNode
}

/**
 * Reusable empty state component for pages with no data.
 * Follows taste-skill Rule 5: "Beautifully composed empty states indicating how to populate data."
 */
export function EmptyState({ icon, title, description, action, footer }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-6 py-20">
      <div className="rounded-full bg-muted p-4 mb-4">
        {icon}
      </div>
      <h2 className="text-lg font-medium mb-1">{title}</h2>
      {description && (
        <p className="text-sm text-muted-foreground max-w-sm mb-6">
          {description}
        </p>
      )}
      {action && <div className="mb-4">{action}</div>}
      {footer}
    </div>
  )
}
