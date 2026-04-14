import { Badge } from "@/components/ui/badge"

export function IdentifierBadge({ identifier }: { identifier: string }) {
  return (
    <Badge className="bg-primary/10 text-primary border-0 text-xs font-mono font-semibold shrink-0">
      {identifier}
    </Badge>
  )
}
