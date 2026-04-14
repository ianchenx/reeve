/**
 * RootLayout — root route component.
 *
 * Wraps the app with providers (Theme, Tooltip, LoginGate) and renders Shell + <Outlet />.
 * This replaces the old App.tsx which had the providers + hand-rolled routing.
 */
import { Outlet } from "@tanstack/react-router"
import { TooltipProvider } from "@/components/ui/tooltip"
import { ThemeProvider } from "@/components/shared/ThemeProvider"
import { LoginGate } from "@/components/shared/LoginGate"
import { ReeveStoreProvider } from "@/hooks/useReeveStore"
import { Shell } from "@/components/layout/Shell"

export function RootLayout() {
  return (
    <ThemeProvider defaultTheme="system">
      <TooltipProvider>
        <LoginGate>
          <ReeveStoreProvider>
            <Shell>
              <Outlet />
            </Shell>
          </ReeveStoreProvider>
        </LoginGate>
      </TooltipProvider>
    </ThemeProvider>
  )
}
