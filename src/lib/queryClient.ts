import { QueryClient } from '@tanstack/react-query'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'

// gcTime must outlive the persister's maxAge, otherwise restored queries are
// garbage-collected immediately on load.
export const PERSIST_MAX_AGE = 1000 * 60 * 60 * 24 * 7 // 7 days

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: PERSIST_MAX_AGE,
      retry: (failureCount) => navigator.onLine && failureCount < 3,
    },
  },
})

export const queryPersister = createSyncStoragePersister({
  storage: window.localStorage,
  key: 'wealth-prof-query-cache',
  throttleTime: 2_000,
})
