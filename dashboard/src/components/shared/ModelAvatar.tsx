import { cn } from "@/lib/utils"
import { GeminiLogo, ClaudeLogo, OpenAILogo } from "./ProviderLogos"
import type { ReactNode } from "react"

interface Props {
  /** Model string like "claude-sonnet-4-20250514" or "gpt-4o" */
  model: string
  /** Size variant */
  size?: "sm" | "md" | "lg"
  className?: string
}

interface ModelInfo {
  provider: string
  initial: string
  bg: string
  text: string
  /** Short display name */
  label: string
  /** SVG logo component */
  logo?: (props: { size: number; className?: string }) => ReactNode
}

const sizeMap = {
  sm: "h-5 w-5 text-[10px]",
  md: "h-7 w-7 text-xs",
  lg: "h-9 w-9 text-sm",
}

/** Icon pixel sizes matching the avatar size variants */
const iconSizeMap = {
  sm: 14,
  md: 18,
  lg: 24,
}

/**
 * Parse model string to provider info with brand colors.
 */
function parseModel(model: string): ModelInfo {
  const lower = model.toLowerCase()

  if (lower.includes("claude") || lower.includes("anthropic")) {
    return {
      provider: "Anthropic",
      initial: "C",
      bg: "bg-[#D4A574]/15",
      text: "text-[#D4A574]",
      label: extractModelName(model, "claude"),
      logo: ClaudeLogo,
    }
  }

  if (lower.includes("gpt") || lower.includes("openai") || lower.includes("o1") || lower.includes("o3")) {
    return {
      provider: "OpenAI",
      initial: "G",
      bg: "bg-[#10A37F]/15",
      text: "text-[#10A37F]",
      label: extractModelName(model, "gpt"),
      logo: OpenAILogo,
    }
  }

  if (lower.includes("gemini") || lower.includes("google")) {
    return {
      provider: "Google",
      initial: "G",
      bg: "bg-[#4285F4]/15",
      text: "text-[#4285F4]",
      label: extractModelName(model, "gemini"),
      logo: GeminiLogo,
    }
  }

  if (lower.includes("deepseek")) {
    return {
      provider: "DeepSeek",
      initial: "D",
      bg: "bg-[#5B6EF5]/15",
      text: "text-[#5B6EF5]",
      label: extractModelName(model, "deepseek"),
    }
  }

  if (lower.includes("codex")) {
    return {
      provider: "OpenAI",
      initial: "Cx",
      bg: "bg-[#10A37F]/15",
      text: "text-[#10A37F]",
      label: "codex",
      logo: OpenAILogo,
    }
  }

  // Fallback
  return {
    provider: "Unknown",
    initial: model.charAt(0).toUpperCase(),
    bg: "bg-zinc-500/15",
    text: "text-zinc-400",
    label: model.split("-")[0] || model,
  }
}

function extractModelName(model: string, prefix: string): string {
  // "claude-sonnet-4-20250514" → "sonnet-4"
  // "gpt-4o" → "4o"
  const lower = model.toLowerCase()
  const idx = lower.indexOf(prefix)
  if (idx < 0) return model.split("-").slice(0, 2).join("-")

  const after = model.slice(idx + prefix.length).replace(/^[-_]/, "")
  // Remove date suffix: -20250514
  const cleaned = after.replace(/-\d{8}$/, "")
  return cleaned || prefix
}

/**
 * ModelAvatar — displays model provider icon with brand colors.
 *
 * Shows the provider's SVG logo (Gemini/Claude/OpenAI) or falls back
 * to a colored initial letter for unknown providers.
 */
export function ModelAvatar({ model, size = "md", className }: Props) {
  const info = parseModel(model)
  const Logo = info.logo

  if (Logo) {
    return (
      <span
        title={`${info.provider} · ${model}`}
        className={cn(
          "inline-flex items-center justify-center shrink-0",
          sizeMap[size],
          className,
        )}
      >
        <Logo size={iconSizeMap[size]} />
      </span>
    )
  }

  return (
    <span
      title={`${info.provider} · ${model}`}
      className={cn(
        "inline-flex items-center justify-center rounded-full font-mono font-semibold shrink-0",
        info.bg,
        info.text,
        sizeMap[size],
        className,
      )}
    >
      {info.initial}
    </span>
  )
}

/**
 * ModelLabel — inline text showing parsed model name.
 */
export function ModelLabel({ model, className }: { model: string; className?: string }) {
  const info = parseModel(model)
  return (
    <span
      title={model}
      className={cn("font-mono text-[11px] text-muted-foreground capitalize leading-none", className)}
    >
      {info.label}
    </span>
  )
}
