/**
 * TaskDetailPage — thin wrapper that picks the active detail layout.
 *
 * All data fetching lives in useTaskDetail hook.
 * Layout is driven by preferences.detailLayout.
 * taskId comes from route params via TanStack Router.
 */
import { Skeleton } from "@/components/ui/skeleton"
import { useTaskDetail } from "@/hooks/useTaskDetail"
import { DocumentDetail } from "@/components/detail/layouts"
import { Link, useNavigate } from "@tanstack/react-router"
import { taskDetailRoute } from "@/router"

export function TaskDetailPage() {
  const { taskId } = taskDetailRoute.useParams()
  const navigate = useNavigate()
  const data = useTaskDetail(taskId)

  const handleBack = () => {
    navigate({ to: "/history" })
  }

  if (data.loading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-96" />
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-64" />
      </div>
    )
  }

  if (!data.meta) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-2">
          <p className="text-sm text-muted-foreground">Task not found</p>
          <Link to="/history" className="text-xs text-primary hover:underline">
            ← Back to history
          </Link>
        </div>
      </div>
    )
  }

  return <DocumentDetail data={data} onBack={handleBack} taskId={taskId} />
}
