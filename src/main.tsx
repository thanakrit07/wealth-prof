import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { ThemeProvider } from 'next-themes'
import { Toaster } from '@/components/ui/sonner'
import { PERSIST_MAX_AGE, queryClient, queryPersister } from './lib/queryClient'
import { registerPwa } from './lib/registerPwa'
import './index.css'
import App from './App.tsx'

registerPwa()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* attribute="class" matches the `.dark` variant in index.css. */}
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{ persister: queryPersister, maxAge: PERSIST_MAX_AGE }}
      >
        <App />
        <Toaster />
      </PersistQueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
)
