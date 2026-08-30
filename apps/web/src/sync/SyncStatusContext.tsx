import { createContext, useContext, type ReactNode } from 'react';
import type { SyncStatus } from './useBackgroundSync';

/**
 * Sync state as the screens need it. Preview Mode has no server to talk to, so it simply provides
 * nothing here and every screen keeps working — the absence of sync is not an error state.
 */
const SyncStatusContext = createContext<SyncStatus | null>(null);

export function SyncStatusProvider({ value, children }: { value: SyncStatus; children: ReactNode }) {
  return <SyncStatusContext.Provider value={value}>{children}</SyncStatusContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSyncStatus(): SyncStatus | null {
  return useContext(SyncStatusContext);
}
