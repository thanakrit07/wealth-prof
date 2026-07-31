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

/**
 * Wipes the persisted cache and everything in memory (DESIGN.md §8: the
 * device holds the household's full financial history in plaintext, so
 * logging out has to clear it). Call before signing out — after signOut()
 * the persister could otherwise flush in-memory data back to localStorage.
 */
export async function clearPersistedCache() {
  await queryPersister.removeClient()
  queryClient.clear()
}
