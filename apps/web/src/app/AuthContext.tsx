import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { MembershipContext, Role } from '../domain/types';
import { isCloudConfigured, supabase } from '../services/supabase';

interface AuthState {
  loading: boolean;
  session: Session | null;
  memberships: MembershipContext[];
  active: MembershipContext | null;
  error: string | null;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  selectMembership(id: string): void;
}

const AuthContext = createContext<AuthState | null>(null);

function mapMembership(row: Record<string, unknown>): MembershipContext {
  const schools = row.schools as { name?: string } | null;
  const profiles = row.user_profiles as { display_name?: string } | null;
  return {
    membershipId: String(row.id), schoolId: String(row.school_id), schoolName: schools?.name ?? 'โรงเรียน',
    profileId: String(row.profile_id), displayName: profiles?.display_name ?? 'ผู้ใช้งาน', role: row.role as Role,
    status: row.status as 'active' | 'suspended'
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [memberships, setMemberships] = useState<MembershipContext[]>([]);
  const [activeId, setActiveId] = useState<string | null>(localStorage.getItem('active-membership'));
  const [loading, setLoading] = useState(isCloudConfigured);
  const [error, setError] = useState<string | null>(null);

  const loadMemberships = useCallback(async (next: Session | null) => {
    if (!supabase || !next) { setMemberships([]); return; }
    const { data, error: queryError } = await supabase.from('school_memberships')
      .select('id, school_id, profile_id, role, status, active_from, active_until, schools(name), user_profiles(display_name)')
      .eq('profile_id', next.user.id).eq('status', 'active');
    if (queryError) throw queryError;
    setMemberships((data ?? []).map((row) => mapMembership(row as unknown as Record<string, unknown>)));
  }, []);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    void supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      try { await loadMemberships(data.session); } catch (reason) { setError(reason instanceof Error ? reason.message : 'โหลดสิทธิ์ไม่สำเร็จ'); }
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      void loadMemberships(next).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'โหลดสิทธิ์ไม่สำเร็จ'));
    });
    return () => data.subscription.unsubscribe();
  }, [loadMemberships]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) throw new Error('ยังไม่ได้กำหนดค่า Supabase');
    setError(null); setLoading(true);
    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) { setLoading(false); throw signInError; }
    setSession(data.session); await loadMemberships(data.session); setLoading(false);
  }, [loadMemberships]);

  const signOut = useCallback(async () => { if (supabase) await supabase.auth.signOut(); setSession(null); setMemberships([]); setActiveId(null); localStorage.removeItem('active-membership'); }, []);
  const selectMembership = useCallback((id: string) => { setActiveId(id); localStorage.setItem('active-membership', id); }, []);
  const active = memberships.find((item) => item.membershipId === activeId) ?? memberships[0] ?? null;
  const value = useMemo(() => ({ loading, session, memberships, active, error, signIn, signOut, selectMembership }), [active, error, loading, memberships, selectMembership, session, signIn, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// The context hook intentionally lives with its provider so they cannot drift.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState { const value = useContext(AuthContext); if (!value) throw new Error('useAuth must be used inside AuthProvider'); return value; }
