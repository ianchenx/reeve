import { useEffect, useRef, useState, type ReactNode } from "react"
import { cn } from "@/lib/utils"

interface FadeInProps {
  children: ReactNode
  className?: string
  /** Duration in ms */
  duration?: number
}

/**
 * FadeIn — wraps children with a subtle fade-in + slide-up on mount.
 * Used for new session events arriving via SSE.
 */
export function FadeIn({ children, className, duration = 400 }: FadeInProps) {
  return (
    <div
      className={cn("animate-fade-in", className)}
      style={{ animationDuration: `${duration}ms` }}
    >
      {children}
    </div>
  )
}

interface TypewriterProps {
  text: string
  /** Characters per second */
  speed?: number
  className?: string
  /** Called when typing is complete */
  onComplete?: () => void
}

/**
 * Typewriter — reveals text character by character with a breathing pace.
 * Uses requestAnimationFrame for smooth rendering.
 */
export function Typewriter({ text, speed = 40, className, onComplete }: TypewriterProps) {
  const [displayLen, setDisplayLen] = useState(0)
  const rafRef = useRef<number>(0)
  const startTimeRef = useRef<number>(0)

  useEffect(() => {
    startTimeRef.current = performance.now()
    let len = 0

    const msPerChar = 1000 / speed

    const animate = (now: number) => {
      const elapsed = now - startTimeRef.current
      const chars = Math.min(Math.floor(elapsed / msPerChar), text.length)
      if (chars !== len) {
        len = chars
        setDisplayLen(chars)
      }

      if (chars < text.length) {
        rafRef.current = requestAnimationFrame(animate)
      } else {
        onComplete?.()
      }
    }

    rafRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafRef.current)
  }, [text, speed, onComplete])

  return (
    <span className={className}>
      {text.slice(0, displayLen)}
      {displayLen < text.length && (
        <span className="inline-block w-[2px] h-[1em] bg-current opacity-70 animate-pulse ml-px align-middle" />
      )}
    </span>
  )
}
