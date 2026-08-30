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
  applySession(tokens: { accessToken: string; refreshToken: string }): Promise<void>;
  applyStudentSession(tokens: { accessToken: string; refreshToken: string }): Promise<void>;
  requestPasswordReset(email: string): Promise<void>;
  verifyPasswordResetOtp(email: string, token: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
  signOut(): Promise<void>;
  refreshMemberships(): Promise<void>;
  selectMembership(id: string): void;
}

export type PublicRegistrationRole = 'teacher' | 'student' | 'parent';

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

  const verifyPasswordResetOtp = useCallback(async (email: string, token: string) => {
    if (!supabase) throw new Error('ยังไม่ได้กำหนดค่า Supabase');
    if (!/^\d{6}$/.test(token)) throw new Error('กรุณากรอกรหัสยืนยัน 6 หลัก');
    setLoading(true); setError(null);
    try {
      const { data, error: otpError } = await supabase.auth.verifyOtp({
        email: email.trim(), token, type: 'recovery'
      });
      if (otpError) throw otpError;
      setSession(data.session);
      await loadMemberships(data.session);
    } finally { setLoading(false); }
  }, [loadMemberships]);

  /**
   * Adopts a session one of the trusted access gateways minted. The person typed a name plus a
   * student number or a password rather than an email address, but what arrives here is an ordinary
   * Supabase session, so the rest of the app — memberships, RLS, sync — sees a normal sign-in.
   */
  const applySession = useCallback(async (tokens: { accessToken: string; refreshToken: string }) => {
    if (!supabase) throw new Error('ยังไม่ได้กำหนดค่า Supabase');
    setError(null); setLoading(true);
    try {
      const { data, error: sessionError } = await supabase.auth.setSession({
        access_token: tokens.accessToken, refresh_token: tokens.refreshToken
      });
      if (sessionError) throw sessionError;
      setSession(data.session);
      await loadMemberships(data.session);
    } finally { setLoading(false); }
  }, [loadMemberships]);

  // The student entrance kept its own name for this from the day it shipped; both entrances adopt a
  // session exactly the same way, so the two names stay one function.
  const applyStudentSession = applySession;

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
    loading, session, memberships, active, error,
    applySession, applyStudentSession, requestPasswordReset, verifyPasswordResetOtp, updatePassword, signOut, refreshMemberships,
    selectMembership
  }), [active, applySession, applyStudentSession, error, loading, memberships, refreshMemberships, requestPasswordReset, selectMembership, session, signOut, updatePassword, verifyPasswordResetOtp]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// The context hook intentionally lives with its provider so they cannot drift.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState { const value = useContext(AuthContext); if (!value) throw new Error('useAuth must be used inside AuthProvider'); return value; }
