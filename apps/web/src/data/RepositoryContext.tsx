import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { emptySnapshot, type SchoolRepository, type SchoolSnapshot } from './schoolRepository';

const RepositoryContext = createContext<SchoolRepository | null>(null);

export function RepositoryProvider({ repository, children }: { repository: SchoolRepository; children: ReactNode }) {
  return <RepositoryContext.Provider value={repository}>{children}</RepositoryContext.Provider>;
}

// Hooks stay beside the provider they read from.
/* eslint-disable react-refresh/only-export-components */
export function useRepository(): SchoolRepository {
  const value = useContext(RepositoryContext);
  if (!value) throw new Error('useRepository must be used inside RepositoryProvider');
  return value;
}

/** Live snapshot of everything the current session may read. */
export function useSchoolSnapshot(): SchoolSnapshot {
  const repository = useRepository();
  const [snapshot, setSnapshot] = useState<SchoolSnapshot>(emptySnapshot);
  useEffect(() => repository.subscribe(setSnapshot), [repository]);
  return snapshot;
}
/* eslint-enable react-refresh/only-export-components */
