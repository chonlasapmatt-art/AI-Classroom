// Name + password access for admins and parents, managed teacher-code access, and child linking by name alone.
//
// The everyday screen asks a teacher for the managed name + code, or a parent for name + password.
// The server has to do the work an
// email address would otherwise have done: turn a name that is not unique into exactly one account.
// It does that by giving every account an internal address nobody ever types, resolving the typed
// name to every candidate address, and letting GoTrue verify the password against each. The password —
// never this code — decides which account it was. When two candidates accept the same password the
// gateway refuses to choose and asks the person instead.
//
// Everything that could be used to enumerate people lives here and nowhere else: the lookup RPCs
// are service_role only, every failure returns the same opaque code, and both the identity and the
// client are rate limited before any lookup runs.

import { corsHeaders, json } from '../_shared/http.ts';
import {
  hashAccessCode, normalizeAccessCode, normalizeTeacherCode, resolveTeacherCodeSecret
} from '../_shared/teacherCode.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const IDENTITY_WINDOW_MINUTES = 15;
const IDENTITY_FAILURE_LIMIT = 5;
const CLIENT_WINDOW_MINUTES = 15;
const CLIENT_FAILURE_LIMIT = 20;
const MINIMUM_PASSWORD_LENGTH = 8;
const GENERIC_FAILURE = 'MEMBER_ACCESS_DENIED';
const REGISTRATION_FAILURE = 'MEMBER_REGISTRATION_FAILED';

interface LoginCandidate {
  profile_id: string;
  auth_email: string;
  display_name: string;
  school_id: string | null;
  school_name: string | null;
}

interface TeacherAccessCandidate {
  teacher_id: string;
  profile_id: string | null;
  auth_email: string | null;
  display_name: string;
  school_id: string;
  school_name: string;
}

function serviceClients() {
  const url = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anon || !service) throw new Error('SERVER_CONFIGURATION_ERROR');
  return {
    url,
    anon: createClient(url, anon, { auth: { persistSession: false } }),
    service: createClient(url, service, { auth: { persistSession: false } })
  };
}

async function hmac(value: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return [...new Uint8Array(signature)].map((part) => part.toString(16).padStart(2, '0')).join('');
}

/** Collapses whitespace and case so the same human name always produces the same lookup key. */
export function normalizeName(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLocaleLowerCase('th');
}

export function isLockedOut(identityFailures: number, clientFailures: number): boolean {
  return identityFailures >= IDENTITY_FAILURE_LIMIT || clientFailures >= CLIENT_FAILURE_LIMIT;
}

function clientFingerprint(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for') ?? '';
  const address = forwarded.split(',')[0]?.trim() || request.headers.get('cf-connecting-ip') || 'unknown';
  return `${address}|${request.headers.get('user-agent') ?? 'unknown'}`;
}

function text(body: Record<string, unknown>, key: string, max = 200): string {
  return String(body[key] ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

Deno.serve(async (request) => {
  const headers = corsHeaders(request.headers.get('Origin'));
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return json({ code: 'METHOD_NOT_ALLOWED' }, 405, headers);

  let service: ReturnType<typeof serviceClients>['service'];
  let anon: ReturnType<typeof serviceClients>['anon'];
  let url: string;
  let secret: string;
  try {
    const secretValue = Deno.env.get('MEMBER_ACCESS_HMAC_SECRET') ?? Deno.env.get('STUDENT_ACCESS_HMAC_SECRET');
    if (!secretValue || secretValue.length < 32) return json({ code: 'SERVER_CONFIGURATION_ERROR' }, 503, headers);
    secret = secretValue;
    ({ service, anon, url } = serviceClients());
  } catch {
    return json({ code: 'SERVER_CONFIGURATION_ERROR' }, 503, headers);
  }

  const emailDomain = Deno.env.get('MEMBER_ACCESS_EMAIL_DOMAIN') ?? 'members.smart-classroom.invalid';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const clientHash = await hmac(clientFingerprint(request), secret);

  async function recordAttempt(input: {
    action: string; identityHash: string; succeeded: boolean; failureReason?: string; profileId?: string | null;
  }): Promise<void> {
    await service.from('member_access_attempts').insert({
      action: input.action, identity_hash: input.identityHash, client_hash: clientHash,
      succeeded: input.succeeded, failure_reason: input.failureReason ?? null,
      profile_id: input.profileId ?? null
    });
  }

  async function failureCounts(identityHash: string): Promise<{ identity: number; client: number }> {
    const identitySince = new Date(Date.now() - IDENTITY_WINDOW_MINUTES * 60_000).toISOString();
    const clientSince = new Date(Date.now() - CLIENT_WINDOW_MINUTES * 60_000).toISOString();
    const [identity, client] = await Promise.all([
      service.from('member_access_attempts').select('id', { count: 'exact', head: true })
        .eq('identity_hash', identityHash).eq('succeeded', false).gte('attempted_at', identitySince),
      service.from('member_access_attempts').select('id', { count: 'exact', head: true })
        .eq('client_hash', clientHash).eq('succeeded', false).gte('attempted_at', clientSince)
    ]);
    return { identity: identity.count ?? 0, client: client.count ?? 0 };
  }

  /** Resolves the caller's own session for the actions that act on their behalf. */
  async function callerId(): Promise<string | null> {
    const authorization = request.headers.get('Authorization') ?? '';
    if (!authorization.toLowerCase().startsWith('bearer ')) return null;
    const scoped = createClient(url, anonKey, {
      global: { headers: { Authorization: authorization } }, auth: { persistSession: false }
    });
    const { data } = await scoped.auth.getUser();
    return data.user?.id ?? null;
  }

  /**
   * Verification is GoTrue's job. A candidate whose password does not match simply fails, and the
   * gateway learns nothing about it beyond that — no hash, no timing decision, no comparison of its
   * own. Every candidate is tried, because stopping at the first success would sign a person into a
   * namesake's account whenever both chose the same password.
   */
  async function verifyCandidates(candidates: LoginCandidate[], password: string) {
    const verified: { candidate: LoginCandidate; accessToken: string; refreshToken: string }[] = [];
    for (const candidate of candidates) {
      const { data, error } = await anon.auth.signInWithPassword({ email: candidate.auth_email, password });
      if (error || !data.session) continue;
      verified.push({
        candidate, accessToken: data.session.access_token, refreshToken: data.session.refresh_token
      });
    }
    return verified;
  }

  async function register(role: 'teacher' | 'parent' | 'admin', body: Record<string, unknown>) {
    if (role === 'teacher') return json({ code: 'TEACHER_ADMIN_ONLY' }, 403, headers);
    const firstName = text(body, 'firstName', 100);
    const lastName = text(body, 'lastName', 100);
    const password = String(body.password ?? '');
    const recoveryEmail = text(body, 'recoveryEmail', 320).toLowerCase();
    const schoolId = role !== 'admin' ? String(body.schoolId ?? '') : null;
    const accessCode = role === 'teacher' ? normalizeAccessCode(String(body.accessCode ?? '')) : '';
    const identityHash = await hmac(`register|${role}|${normalizeName(`${firstName} ${lastName}`)}`, secret);
    const recoveryEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recoveryEmail);

    if (!firstName || !lastName || password.length < MINIMUM_PASSWORD_LENGTH
      || (role !== 'admin' && !schoolId) || (role !== 'admin' && !recoveryEmailValid)) {
      await recordAttempt({ action: `register-${role}`, identityHash, succeeded: false, failureReason: 'validation' });
      return json({ code: 'MEMBER_REGISTRATION_INVALID' }, 400, headers);
    }

    const counts = await failureCounts(identityHash);
    if (isLockedOut(counts.identity, counts.client)) {
      await recordAttempt({ action: `register-${role}`, identityHash, succeeded: false, failureReason: 'locked_out' });
      return json({ code: 'MEMBER_ACCESS_LOCKED', retryAfterMinutes: IDENTITY_WINDOW_MINUTES }, 429, headers);
    }

    // A teacher becomes a teacher because their school said so. The code is checked and one use of
    // it is claimed here, before any account exists: claiming afterwards would let two people race
    // for the last use of a limited code and both win. A wrong, revoked, expired or used-up code all
    // answer the same way, so nothing can be learned by trying.
    let claimedCodeId: string | null = null;
    if (role === 'teacher') {
      if (accessCode.length < 4) {
        await recordAttempt({ action: `register-${role}`, identityHash, succeeded: false, failureReason: 'code_missing' });
        return json({ code: 'TEACHER_CODE_REQUIRED' }, 400, headers);
      }
      // Keyed with the teacher-code secret, not this function's own. They are usually the same
      // value and were for a while the same variable, which is exactly why the resolution is asked
      // for rather than assumed: the code was written by `teacher-code` under this key, and a hash
      // computed under any other one matches nothing.
      const codeSecret = resolveTeacherCodeSecret((name) => Deno.env.get(name));
      if (!codeSecret) return json({ code: 'SERVER_CONFIGURATION_ERROR' }, 503, headers);
      const { data: claim, error: claimError } = await service.rpc('claim_teacher_access_code', {
        p_school_id: schoolId, p_code_hash: await hashAccessCode(schoolId!, accessCode, codeSecret)
      });
      const claimed = claim as { valid?: boolean; codeId?: string } | null;
      if (claimError || !claimed?.valid) {
        await recordAttempt({ action: `register-${role}`, identityHash, succeeded: false, failureReason: 'code_rejected' });
        return json({ code: 'TEACHER_CODE_INVALID' }, 403, headers);
      }
      claimedCodeId = claimed.codeId ?? null;
    }

    /** Hands a claimed use back when the registration that took it did not finish. */
    async function releaseClaim(): Promise<void> {
      if (claimedCodeId) await service.rpc('release_teacher_access_code', { p_code_id: claimedCodeId });
    }

    // Teacher and parent accounts use the recovery address as GoTrue's identifier, but the normal
    // entrance never asks for it: the name directory resolves it only inside this trusted gateway.
    // Owner bootstrap keeps its private generated address because recovery email is not part of the
    // public Teacher/Parent requirement and changing that flow would broaden this change needlessly.
    const email = role === 'admin' ? `${role}.${crypto.randomUUID()}@${emailDomain}` : recoveryEmail;
    const { data: created, error: createError } = await service.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: {
        display_name: `${firstName} ${lastName}`, requested_role: role,
        ...(role === 'admin' ? {} : { recovery_email: recoveryEmail })
      },
      app_metadata: { access_model: 'name_password', member_role: role, has_recovery_email: role !== 'admin' }
    });
    if (createError || !created.user) {
      await releaseClaim();
      await recordAttempt({ action: `register-${role}`, identityHash, succeeded: false, failureReason: 'create_failed' });
      const authMessage = String(createError?.message ?? '').toLowerCase();
      if (authMessage.includes('already registered') || authMessage.includes('already been registered')
        || authMessage.includes('already exists') || authMessage.includes('email_exists')
        || authMessage.includes('duplicate')) {
        return json({ code: 'MEMBER_EMAIL_EXISTS' }, 409, headers);
      }
      return json({ code: REGISTRATION_FAILURE }, 400, headers);
    }
    const profileId = created.user.id;

    // Teacher access codes are not part of a parent registration. The database now exposes one
    // unambiguous seven-argument registration function; keeping this payload exact prevents
    // PostgREST from having to choose between the retired teacher-code overload and this path.
    const identityParams = {
      p_actor: profileId, p_role: role, p_first_name: firstName, p_last_name: lastName,
      p_auth_email: email, p_school_id: schoolId, p_source: 'self_registration',
      ...(claimedCodeId ? { p_access_code_id: claimedCodeId } : {})
    };
    const { data: registered, error: registerError } = await service.rpc('register_member_identity', identityParams);
    if (registerError) {
      // The account exists but carries no records, so it would be an orphan able to sign in with no
      // identity behind it. Remove it rather than leave that lying around.
      await service.auth.admin.deleteUser(profileId).catch(() => undefined);
      await releaseClaim();
      await recordAttempt({ action: `register-${role}`, identityHash, succeeded: false, failureReason: 'rejected' });
      const message = String(registerError.message ?? '');
      if (message.includes('SCHOOL_NOT_AVAILABLE')) return json({ code: 'SCHOOL_NOT_AVAILABLE' }, 400, headers);
      if (message.includes('TEACHER_CODE_REQUIRED')) return json({ code: 'TEACHER_CODE_INVALID' }, 403, headers);
      const normalizedMessage = message.toLowerCase();
      if (normalizedMessage.includes('already exists') || normalizedMessage.includes('duplicate')) {
        return json({ code: 'MEMBER_EMAIL_EXISTS' }, 409, headers);
      }
      return json({ code: REGISTRATION_FAILURE }, 400, headers);
    }

    const { data: signedIn, error: signInError } = await anon.auth.signInWithPassword({ email, password });
    if (signInError || !signedIn.session) {
      await service.auth.admin.deleteUser(profileId).catch(() => undefined);
      // The account is gone, so the use claimed for it has to go back too. Without this a school
      // with a twelve-use code silently loses one of the twelve every time this branch is taken.
      await releaseClaim();
      await recordAttempt({ action: `register-${role}`, identityHash, succeeded: false, failureReason: 'session_failed' });
      return json({ code: REGISTRATION_FAILURE }, 400, headers);
    }
    await service.rpc('record_member_login', { p_profile_id: profileId });
    await recordAttempt({ action: `register-${role}`, identityHash, succeeded: true, profileId });
    return json({
      session: { accessToken: signedIn.session.access_token, refreshToken: signedIn.session.refresh_token },
      member: { ...(registered as Record<string, unknown>), role }
    }, 201, headers);
  }

  /**
   * Managed teachers do not create or remember a second password. The pair saved by the admin is
   * checked against the roster in a service-only RPC, then an internal Auth identity is created on
   * first use and a normal Supabase session is minted from a one-time magic-link token.
   */
  async function teacherLogin(body: Record<string, unknown>) {
    const displayName = text(body, 'displayName');
    const teacherCode = normalizeTeacherCode(text(body, 'teacherCode', 100));
    const teacherId = body.teacherId ? String(body.teacherId) : null;
    const identityHash = await hmac(`teacher-login|${normalizeName(displayName)}|${teacherCode}`, secret);

    if (displayName.length < 2 || teacherCode.length < 1) {
      await recordAttempt({ action: 'teacher-login', identityHash, succeeded: false, failureReason: 'validation' });
      return json({ code: GENERIC_FAILURE }, 400, headers);
    }
    const counts = await failureCounts(identityHash);
    if (isLockedOut(counts.identity, counts.client)) {
      await recordAttempt({ action: 'teacher-login', identityHash, succeeded: false, failureReason: 'locked_out' });
      return json({ code: 'MEMBER_ACCESS_LOCKED', retryAfterMinutes: IDENTITY_WINDOW_MINUTES }, 429, headers);
    }

    const { data, error } = await service.rpc('resolve_teacher_access', {
      p_display_name: displayName, p_teacher_code: teacherCode, p_teacher_id: teacherId
    });
    const candidates = (data ?? []) as TeacherAccessCandidate[];
    if (error || candidates.length === 0) {
      await recordAttempt({ action: 'teacher-login', identityHash, succeeded: false, failureReason: 'no_match' });
      return json({ code: GENERIC_FAILURE }, 401, headers);
    }
    if (candidates.length > 1) {
      await recordAttempt({ action: 'teacher-login', identityHash, succeeded: false, failureReason: 'ambiguous' });
      return json({
        code: 'MEMBER_SELECTION_REQUIRED',
        accounts: candidates.map((item) => ({ profileId: item.teacher_id, schoolName: item.school_name }))
      }, 409, headers);
    }

    const candidate = candidates[0]!;
    const teacherEmailDomain = Deno.env.get('TEACHER_ACCESS_EMAIL_DOMAIN') ?? 'teachers.smart-classroom.invalid';
    const email = `teacher.${candidate.teacher_id}@${teacherEmailDomain}`;
    let profileId = candidate.profile_id;
    let createdAuthUser = false;
    try {
      if (!profileId) {
        const { data: created, error: createError } = await service.auth.admin.createUser({
          email, email_confirm: true,
          user_metadata: { display_name: candidate.display_name, requested_role: 'teacher' },
          app_metadata: { access_model: 'teacher_name_code', member_role: 'teacher', teacher_id: candidate.teacher_id }
        });
        if (createError || !created.user) {
          const { data: existingId, error: lookupError } = await service.rpc('find_teacher_auth_user', { p_email: email });
          if (lookupError || !existingId) throw new Error(GENERIC_FAILURE);
          profileId = String(existingId);
        } else {
          profileId = created.user.id;
          createdAuthUser = true;
        }
        const { error: bindError } = await service.rpc('activate_teacher_access', {
          p_teacher_id: candidate.teacher_id, p_profile_id: profileId, p_auth_email: email
        });
        if (bindError) {
          if (createdAuthUser && profileId) await service.auth.admin.deleteUser(profileId).catch(() => undefined);
          throw new Error(GENERIC_FAILURE);
        }
      }

      const { data: link, error: linkError } = await service.auth.admin.generateLink({ type: 'magiclink', email });
      const hashedToken = link?.properties?.hashed_token;
      if (linkError || !hashedToken) throw new Error(GENERIC_FAILURE);
      const { data: verified, error: verifyError } = await anon.auth.verifyOtp({ token_hash: hashedToken, type: 'email' });
      if (verifyError || !verified.session || !profileId) throw new Error(GENERIC_FAILURE);

      const { data: recorded, error: recordError } = await service.rpc('record_member_login', { p_profile_id: profileId });
      if (recordError || !recorded) throw new Error(GENERIC_FAILURE);
      await recordAttempt({ action: 'teacher-login', identityHash, succeeded: true, profileId });
      return json({
        session: { accessToken: verified.session.access_token, refreshToken: verified.session.refresh_token },
        member: { ...(recorded as Record<string, unknown>), role: 'teacher', schoolName: candidate.school_name }
      }, 200, headers);
    } catch {
      await recordAttempt({ action: 'teacher-login', identityHash, succeeded: false, failureReason: 'rejected' });
      return json({ code: GENERIC_FAILURE }, 401, headers);
    }
  }

  try {
    const body = await request.json() as Record<string, unknown>;
    const action = String(body.action ?? '');

    if (action === 'schools') {
      const query = text(body, 'query', 100);
      if (query.length < 2) return json({ schools: [] }, 200, headers);
      const { data, error } = await service.rpc('search_public_schools', { p_query: query });
      if (error) return json({ schools: [] }, 200, headers);
      return json({ schools: data ?? [] }, 200, headers);
    }

    // Teacher accounts are created by the school administrator from the Teachers page. Keep the
    // legacy action name understood only as a hard rejection so an old client cannot self-register.
    if (action === 'register-teacher' || action === 'register-parent') return json({ code: 'PUBLIC_ACCESS_DISABLED' }, 403, headers);
    // The account that creates the first school. It is an ordinary name and password account with no
    // school and no rights; the owner code checked by admin-access is still the only thing that turns
    // it into an administrator, so this action hands out nothing on its own.
    if (action === 'register-owner') return await register('admin', body);
    if (action === 'teacher-login') return await teacherLogin(body);

    if (action === 'login') {
      const role = String(body.role ?? '');
      const displayName = text(body, 'displayName');
      const password = String(body.password ?? '');
      const chosenProfileId = body.profileId ? String(body.profileId) : null;
      const identityHash = await hmac(`login|${role}|${normalizeName(displayName)}`, secret);

      if ((role !== 'teacher' && role !== 'student' && role !== 'parent' && role !== 'admin') || displayName.length < 2 || password.length < 1) {
        await recordAttempt({ action, identityHash, succeeded: false, failureReason: 'validation' });
        return json({ code: GENERIC_FAILURE }, 400, headers);
      }

      const counts = await failureCounts(identityHash);
      if (isLockedOut(counts.identity, counts.client)) {
        await recordAttempt({ action, identityHash, succeeded: false, failureReason: 'locked_out' });
        return json({ code: 'MEMBER_ACCESS_LOCKED', retryAfterMinutes: IDENTITY_WINDOW_MINUTES }, 429, headers);
      }

      const { data, error } = await service.rpc('resolve_member_login', {
        p_role: role, p_display_name: displayName
      });
      const resolved = (data ?? []) as LoginCandidate[];
      const candidates = chosenProfileId
        ? resolved.filter((item) => item.profile_id === chosenProfileId)
        : resolved;
      if (error || candidates.length === 0) {
        await recordAttempt({ action, identityHash, succeeded: false, failureReason: 'no_match' });
        return json({ code: GENERIC_FAILURE }, 401, headers);
      }

      const verified = await verifyCandidates(candidates, password);
      if (verified.length === 0) {
        await recordAttempt({ action, identityHash, succeeded: false, failureReason: 'no_match' });
        return json({ code: GENERIC_FAILURE }, 401, headers);
      }
      if (verified.length > 1) {
        // Two people share a name and chose the same password. Picking one would hand somebody a
        // stranger's account, so the only safe answer is to ask which school they belong to.
        await recordAttempt({ action, identityHash, succeeded: false, failureReason: 'ambiguous' });
        return json({
          code: 'MEMBER_SELECTION_REQUIRED',
          accounts: verified.map((item) => ({
            profileId: item.candidate.profile_id,
            schoolName: item.candidate.school_name ?? 'ยังไม่ผูกโรงเรียน'
          }))
        }, 409, headers);
      }

      const match = verified[0]!;
      const { data: recorded, error: recordError } = await service.rpc('record_member_login', {
        p_profile_id: match.candidate.profile_id
      });
      if (recordError) {
        await recordAttempt({ action, identityHash, succeeded: false, failureReason: 'rejected' });
        return json({ code: GENERIC_FAILURE }, 401, headers);
      }
      await recordAttempt({ action, identityHash, succeeded: true, profileId: match.candidate.profile_id });
      return json({
        session: { accessToken: match.accessToken, refreshToken: match.refreshToken },
        member: { ...(recorded as Record<string, unknown>), schoolName: match.candidate.school_name }
      }, 200, headers);
    }

    if (action === 'children-search') {
      const actor = await callerId();
      if (!actor) return json({ code: 'AUTH_REQUIRED' }, 401, headers);
      const childName = text(body, 'childName');
      const identityHash = await hmac(`children|${actor}`, secret);
      if (childName.length < 2) return json({ children: [] }, 200, headers);

      const counts = await failureCounts(identityHash);
      if (isLockedOut(counts.identity, counts.client)) {
        await recordAttempt({ action, identityHash, succeeded: false, failureReason: 'locked_out' });
        return json({ code: 'MEMBER_ACCESS_LOCKED', retryAfterMinutes: IDENTITY_WINDOW_MINUTES }, 429, headers);
      }

      const { data, error } = await service.rpc('search_children_for_parent', {
        p_actor: actor, p_school_id: String(body.schoolId ?? ''), p_child_name: childName
      });
      if (error) {
        await recordAttempt({ action, identityHash, succeeded: false, failureReason: 'no_match', profileId: actor });
        return json({ children: [] }, 200, headers);
      }
      const children = (data ?? []) as Record<string, unknown>[];
      if (children.length === 0) {
        // A search that finds nobody counts as a failed attempt, which is what stops the screen from
        // being walked through a list of names.
        await recordAttempt({ action, identityHash, succeeded: false, failureReason: 'no_match', profileId: actor });
      }
      return json({
        children: children.map((row) => ({
          studentId: row.student_id, displayName: row.display_name, schoolId: row.school_id,
          schoolName: row.school_name, className: row.class_name, maskedCode: row.masked_code,
          avatarIndex: row.avatar_index, alreadyLinked: row.already_linked
        }))
      }, 200, headers);
    }

    if (action === 'children-link') {
      const actor = await callerId();
      if (!actor) return json({ code: 'AUTH_REQUIRED' }, 401, headers);
      const studentId = String(body.studentId ?? '');
      const relationship = text(body, 'relationship', 60);
      const identityHash = await hmac(`link|${actor}`, secret);
      if (!studentId) return json({ code: GENERIC_FAILURE }, 400, headers);

      const { data, error } = await service.rpc('link_parent_child', {
        p_actor: actor, p_student_id: studentId, p_relationship: relationship || 'ผู้ปกครอง'
      });
      if (error) {
        await recordAttempt({ action, identityHash, succeeded: false, failureReason: 'rejected', profileId: actor });
        return json({ code: GENERIC_FAILURE }, 403, headers);
      }
      await recordAttempt({ action, identityHash, succeeded: true, profileId: actor });
      return json(data, 201, headers);
    }

    if (action === 'reset-request') {
      return json({ code: 'PUBLIC_ACCESS_DISABLED' }, 403, headers);
      /*
      const role = String(body.role ?? '');
      const displayName = text(body, 'displayName');
      const identityHash = await hmac(`reset|${role}|${normalizeName(displayName)}`, secret);
      const counts = await failureCounts(identityHash);
      if (isLockedOut(counts.identity, counts.client)) {
        return json({ code: 'MEMBER_ACCESS_LOCKED', retryAfterMinutes: IDENTITY_WINDOW_MINUTES }, 429, headers);
      }
      if ((role === 'teacher' || role === 'parent') && displayName.length >= 2) {
        await service.rpc('request_member_password_reset', { p_role: role, p_display_name: displayName });
      }
      // The same answer either way: whether that name has an account is not this endpoint's to tell.
      await recordAttempt({ action, identityHash, succeeded: false, failureReason: 'reset_requested' });
      return json({ recorded: true }, 202, headers);
      */
    }

    if (action === 'reset-complete') {
      return json({ code: 'PUBLIC_ACCESS_DISABLED' }, 403, headers);
      /* const actor = await callerId();
      if (!actor) return json({ code: 'AUTH_REQUIRED' }, 401, headers);
      const requestId = String(body.requestId ?? '');
      const newPassword = String(body.newPassword ?? '');
      if (!requestId || newPassword.length < MINIMUM_PASSWORD_LENGTH) {
        return json({ code: 'MEMBER_REGISTRATION_INVALID' }, 400, headers);
      }
      const { data, error } = await service.rpc('authorize_member_password_reset', {
        p_request_id: requestId, p_actor: actor
      });
      if (error) return json({ code: 'FORBIDDEN' }, 403, headers);
      const target = data as { profileId: string };
      const { error: updateError } = await service.auth.admin.updateUserById(target.profileId, {
        password: newPassword
      });
      if (updateError) return json({ code: GENERIC_FAILURE }, 400, headers);
      return json({ completed: true }, 200, headers);
      */
    }

    return json({ code: 'UNSUPPORTED_ACTION' }, 400, headers);
  } catch {
    return json({ code: GENERIC_FAILURE }, 401, headers);
  }
});
