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
  signUp(input: RegistrationInput): Promise<{ emailConfirmationRequired: boolean }>;
  requestPasswordReset(email: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
  signOut(): Promise<void>;
  refreshMemberships(): Promise<void>;
  selectMembership(id: string): void;
}

export type PublicRegistrationRole = 'teacher' | 'student' | 'parent';

export interface RegistrationInput {
  displayName: string;
  email: string;
  password: string;
  role: PublicRegistrationRole;
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
    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;
      setSession(data.session); await loadMemberships(data.session);
    } finally { setLoading(false); }
  }, [loadMemberships]);

  const signUp = useCallback(async (input: RegistrationInput) => {
    if (!supabase) throw new Error('ยังไม่ได้กำหนดค่า Supabase');
    const displayName = input.displayName.trim();
    if (displayName.length < 2) throw new Error('กรุณาระบุชื่ออย่างน้อย 2 ตัวอักษร');
    if (input.password.length < 8) throw new Error('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร');
    setError(null); setLoading(true);
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: input.email.trim(), password: input.password,
        options: {
          emailRedirectTo: `${window.location.origin}/login`,
          data: { display_name: displayName, requested_role: input.role }
        }
      });
      if (signUpError) throw signUpError;
      setSession(data.session);
      if (data.session) await loadMemberships(data.session);
      return { emailConfirmationRequired: data.session === null };
    } finally { setLoading(false); }
  }, [loadMemberships]);

  const requestPasswordReset = useCallback(async (email: string) => {
    if (!supabase) throw new Error('ยังไม่ได้กำหนดค่า Supabase');
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`
    });
    if (resetError) throw resetError;
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    if (!supabase) throw new Error('ยังไม่ได้กำหนดค่า Supabase');
    if (password.length < 8) throw new Error('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร');
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) throw updateError;
  }, []);

  const signOut = useCallback(async () => { if (supabase) await supabase.auth.signOut(); setSession(null); setMemberships([]); setActiveId(null); localStorage.removeItem('active-membership'); }, []);
  const refreshMemberships = useCallback(async () => { await loadMemberships(session); }, [loadMemberships, session]);
  const selectMembership = useCallback((id: string) => { setActiveId(id); localStorage.setItem('active-membership', id); }, []);
  const active = memberships.find((item) => item.membershipId === activeId) ?? memberships[0] ?? null;
  const value = useMemo(() => ({
    loading, session, memberships, active, error, signIn, signUp, requestPasswordReset,
    updatePassword, signOut, refreshMemberships, selectMembership
  }), [active, error, loading, memberships, refreshMemberships, requestPasswordReset, selectMembership, session, signIn, signOut, signUp, updatePassword]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// The context hook intentionally lives with its provider so they cannot drift.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState { const value = useContext(AuthContext); if (!value) throw new Error('useAuth must be used inside AuthProvider'); return value; }
