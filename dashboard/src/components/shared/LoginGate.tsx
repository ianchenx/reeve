import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { getStoredKey, setStoredKey } from "@/api"

interface Props {
  children: React.ReactNode
}

export function LoginGate({ children }: Props) {
  const [authed, setAuthed] = useState<boolean | null>(null) // null = checking
  const [input, setInput] = useState("")
  const [error, setError] = useState("")

  const checkAuth = useCallback(async () => {
    try {
      const res = await fetch("/api/config", {
        headers: getStoredKey() ? { Authorization: `Bearer ${getStoredKey()}` } : {},
      })
      setAuthed(res.status !== 401)
    } catch {
      setAuthed(true) // Network error = likely local, allow through
    }
  }, [])

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  async function handleLogin() {
    setError("")
    try {
      const res = await fetch("/api/config", {
        headers: { Authorization: `Bearer ${input}` },
      })
      if (res.status === 401) {
        setError("Invalid key")
        return
      }
      setStoredKey(input)
      setAuthed(true)
    } catch {
      setError("Connection failed")
    }
  }

  // Still checking
  if (authed === null) return null

  // Needs login
  if (!authed) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">🐝</span>
              <span className="text-sm font-semibold">reeve</span>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              type="password"
              placeholder="Access key"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleLogin()}
              autoFocus
            />
            {error && <p className="text-destructive text-xs">{error}</p>}
            <Button
              onClick={handleLogin}
              disabled={!input}
              className="w-full"
            >
              Sign in
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return <>{children}</>
}
