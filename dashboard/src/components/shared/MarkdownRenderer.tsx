/**
 * MarkdownRenderer — renders markdown content with proper styling.
 *
 * Uses react-markdown + remark-gfm for tables, strikethrough, etc.
 * Styled code blocks, headings, lists, and inline elements.
 */
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { cn } from "@/lib/utils"
import type { Components } from "react-markdown"

const components: Components = {
  h1: ({ children }) => <h1 className="text-lg font-semibold mt-6 mb-2 first:mt-0">{children}</h1>,
  h2: ({ children }) => <h2 className="text-base font-semibold mt-5 mb-2">{children}</h2>,
  h3: ({ children }) => <h3 className="text-sm font-semibold mt-4 mb-1.5">{children}</h3>,
  p: ({ children }) => <p className="text-sm leading-relaxed mb-3 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="list-disc list-inside text-sm space-y-1 mb-3 ml-2">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal list-inside text-sm space-y-1 mb-3 ml-2">{children}</ol>,
  li: ({ children }) => <li className="text-sm leading-relaxed">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-primary/30 pl-3 my-3 text-sm text-muted-foreground italic">
      {children}
    </blockquote>
  ),
  code: ({ className, children }) => {
    const isInline = !className
    if (isInline) {
      return (
        <code className="px-1 py-0.5 rounded bg-muted text-xs font-mono text-foreground/80">
          {children}
        </code>
      )
    }
    // Block code
    const lang = className?.replace("language-", "") ?? ""
    return (
      <div className="rounded-lg border bg-muted/30 overflow-hidden my-3">
        {lang && (
          <div className="px-3 py-1 border-b text-[10px] uppercase tracking-wider text-muted-foreground/40 bg-muted/20">
            {lang}
          </div>
        )}
        <pre className="p-3 overflow-x-auto">
          <code className="text-xs font-mono leading-relaxed">{children}</code>
        </pre>
      </div>
    )
  },
  pre: ({ children }) => <>{children}</>,
  table: ({ children }) => (
    <div className="overflow-x-auto my-3 rounded-lg border">
      <table className="w-full text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-muted/30 text-xs">{children}</thead>,
  th: ({ children }) => <th className="px-3 py-2 text-left font-medium text-muted-foreground">{children}</th>,
  td: ({ children }) => <td className="px-3 py-2 border-t text-foreground/80">{children}</td>,
  hr: () => <hr className="my-4 border-border/50" />,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
      {children}
    </a>
  ),
  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
}

interface Props {
  content: string
  className?: string
}

export function MarkdownRenderer({ content, className }: Props) {
  return (
    <div className={cn("markdown-body", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  )
}
