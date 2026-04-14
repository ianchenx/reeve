import { StrictMode, useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { PreferencesProvider } from '@/hooks/usePreferences'
import { router } from '@/router'
import { SetupWizard } from '@/components/SetupWizard'
import { fetchSetupCheck } from '@/api'
import './index.css'

function App() {
  const [loading, setLoading] = useState(true)
  const [needsSetup, setNeedsSetup] = useState(false)

  useEffect(() => {
    fetchSetupCheck()
      .then(s => {
        setNeedsSetup(!s.configured)
        setLoading(false)
      })
      .catch(() => {
        // If we can't reach the API, show the normal dashboard
        // (it will show its own error states)
        setLoading(false)
      })
  }, [])

  if (loading) {
    return null // brief flash, no spinner needed
  }

  if (needsSetup) {
    return <SetupWizard onComplete={() => setNeedsSetup(false)} />
  }

  return (
    <PreferencesProvider>
      <RouterProvider router={router} />
    </PreferencesProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
