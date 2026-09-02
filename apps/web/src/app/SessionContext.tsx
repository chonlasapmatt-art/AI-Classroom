import { createContext, useContext, type ReactNode } from 'react';
import type { MembershipContext, Role } from '../domain/types';

/**
 * The screens depend on a session, not on Supabase. The cloud path fills this from AuthContext,
 * Preview Mode fills it from fixtures — neither leaks into the other.
 */
export interface SessionValue {
  mode: 'cloud' | 'preview';
  membership: MembershipContext;
  memberships: MembershipContext[];
  selectMembership(membershipId: string): void;
  signOut(): void | Promise<void>;
  /** A support perspective changes presentation only; server authority remains administrator. */
  support?: {
    view: SupportView;
    setView(view: SupportView): void;
    end(): Promise<void>;
  };
}

export interface SupportView {
  role: Role;
  targetProfileId: string;
  targetDisplayName: string;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ value, children }: { value: SessionValue; children: ReactNode }) {
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

// The hook lives with its provider so the two cannot drift apart.
// eslint-disable-next-line react-refresh/only-export-components
export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside SessionProvider');
  return value;
}
