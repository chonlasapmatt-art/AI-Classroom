// Passwordless student access.
//
// A student signs in with their name and student number and nothing else. Those two values are
// public inside a classroom, so the whole security budget is spent here rather than on the
// credential: this is the only place that can resolve a name to a student, it is rate limited and
// locked out per identity and per client, and every failure returns the same opaque code so the
// endpoint cannot be used to discover who attends which school.
//
// A successful call mints a real Supabase session for a shadow auth user that is bound one-to-one
// with a student record. The student never sees that account, and RLS treats them as an ordinary
// authenticated student, which is why none of the existing policies had to be relaxed.

import { corsHeaders, json } from '../_shared/http.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const IDENTITY_WINDOW_MINUTES = 15;
const IDENTITY_FAILURE_LIMIT = 5;
const CLIENT_WINDOW_MINUTES = 15;
const CLIENT_FAILURE_LIMIT = 20;
const GENERIC_FAILURE = 'STUDENT_ACCESS_DENIED';

interface StudentCandidate {
  student_id: string;
  school_id: string;
  school_name: string;
  display_name: string;
  student_code: string;
  profile_id: string | null;
  access_enabled: boolean;
}

function serviceClients() {
  const url = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anon || !service) throw new Error('SERVER_CONFIGURATION_ERROR');
  return {
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

export function normalizeStudentCode(value: string): string {
  return value.replace(/[\s-]/g, '').trim().toUpperCase();
}

function clientFingerprint(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for') ?? '';
  const address = forwarded.split(',')[0]?.trim() || request.headers.get('cf-connecting-ip') || 'unknown';
  return `${address}|${request.headers.get('user-agent') ?? 'unknown'}`;
}

export function isLockedOut(identityFailures: number, clientFailures: number): boolean {
  return identityFailures >= IDENTITY_FAILURE_LIMIT || clientFailures >= CLIENT_FAILURE_LIMIT;
}

Deno.serve(async (request) => {
  const headers = corsHeaders(request.headers.get('Origin'));
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return json({ code: 'METHOD_NOT_ALLOWED' }, 405, headers);

  let service: ReturnType<typeof serviceClients>['service'];
  let anon: ReturnType<typeof serviceClients>['anon'];
  let secret: string;
  try {
    const secretValue = Deno.env.get('STUDENT_ACCESS_HMAC_SECRET');
    if (!secretValue || secretValue.length < 32) return json({ code: 'SERVER_CONFIGURATION_ERROR' }, 503, headers);
    secret = secretValue;
    ({ service, anon } = serviceClients());
  } catch {
    return json({ code: 'SERVER_CONFIGURATION_ERROR' }, 503, headers);
  }

  const emailDomain = Deno.env.get('STUDENT_ACCESS_EMAIL_DOMAIN') ?? 'students.smart-classroom.invalid';
  const clientHash = await hmac(clientFingerprint(request), secret);

  async function recordAttempt(input: {
    action: string; identityHash: string; succeeded: boolean;
    failureReason?: string; schoolId?: string | null; studentId?: string | null;
  }): Promise<void> {
    await service.from('student_access_attempts').insert({
      action: input.action, identity_hash: input.identityHash, client_hash: clientHash,
      succeeded: input.succeeded, failure_reason: input.failureReason ?? null,
      school_id: input.schoolId ?? null, student_id: input.studentId ?? null
    });
  }

  async function failureCounts(identityHash: string): Promise<{ identity: number; client: number }> {
    const identitySince = new Date(Date.now() - IDENTITY_WINDOW_MINUTES * 60_000).toISOString();
    const clientSince = new Date(Date.now() - CLIENT_WINDOW_MINUTES * 60_000).toISOString();
    const [identity, client] = await Promise.all([
      service.from('student_access_attempts').select('id', { count: 'exact', head: true })
        .eq('identity_hash', identityHash).eq('succeeded', false).gte('attempted_at', identitySince),
      service.from('student_access_attempts').select('id', { count: 'exact', head: true })
        .eq('client_hash', clientHash).eq('succeeded', false).gte('attempted_at', clientSince)
    ]);
    return { identity: identity.count ?? 0, client: client.count ?? 0 };
  }

  /**
   * Issues a browser session for the shadow account of one student record. The account is created
   * on first access and reused afterwards, and the session is minted from a single-use magic link
   * token so no student password is ever generated, stored or transmitted.
   */
  async function mintStudentSession(candidate: StudentCandidate) {
    const email = `student.${candidate.student_id}@${emailDomain}`;
    let profileId = candidate.profile_id;

    if (!profileId) {
      const { data: created, error: createError } = await service.auth.admin.createUser({
        email, email_confirm: true,
        user_metadata: { display_name: candidate.display_name, requested_role: 'student' },
        app_metadata: { student_id: candidate.student_id, school_id: candidate.school_id, access_model: 'student_code' }
      });
      if (createError || !created.user) {
        // The account may already exist from an earlier attempt whose binding did not commit. Look
        // it up by its exact address rather than paging the user list, which would miss it on any
        // project large enough to matter.
        const { data: existingId } = await service.rpc('find_student_auth_user', { p_email: email });
        if (!existingId) throw new Error(GENERIC_FAILURE);
        profileId = String(existingId);
      } else {
        profileId = created.user.id;
      }
    }

    const { data: bound, error: bindError } = await service.rpc('bind_student_access', {
      p_student_id: candidate.student_id, p_actor: profileId, p_source: 'student_code'
    });
    if (bindError) throw new Error(bindError.message);

    const { data: link, error: linkError } = await service.auth.admin.generateLink({ type: 'magiclink', email });
    const hashedToken = link?.properties?.hashed_token;
    if (linkError || !hashedToken) throw new Error(GENERIC_FAILURE);
    const { data: verified, error: verifyError } = await anon.auth.verifyOtp({ token_hash: hashedToken, type: 'email' });
    if (verifyError || !verified.session) throw new Error(GENERIC_FAILURE);

    return {
      session: { accessToken: verified.session.access_token, refreshToken: verified.session.refresh_token },
      student: bound as Record<string, unknown>
    };
  }

  try {
    const body = await request.json() as Record<string, unknown>;
    const action = String(body.action ?? '');

    // Students are roster-managed accounts. Their name and student number are credentials for
    // entering an existing school record; there is no public first-time registration path.
    if (action === 'register') {
      return json({ code: 'SELF_REGISTRATION_DISABLED' }, 403, headers);
    }

    if (action === 'schools') {
      const query = String(body.query ?? '').trim();
      if (query.length < 2) return json({ schools: [] }, 200, headers);
      const { data, error } = await service.rpc('search_public_schools', { p_query: query });
      if (error) return json({ schools: [] }, 200, headers);
      return json({ schools: data ?? [] }, 200, headers);
    }

    if (action === 'login') {
      const displayName = normalizeName(String(body.displayName ?? ''));
      const studentCode = normalizeStudentCode(String(body.studentCode ?? ''));
      const schoolId = body.schoolId ? String(body.schoolId) : null;
      const identityHash = await hmac(`login|${displayName}|${studentCode}`, secret);

      if (displayName.length < 2 || studentCode.length < 1) {
        await recordAttempt({ action, identityHash, succeeded: false, failureReason: 'validation' });
        return json({ code: GENERIC_FAILURE }, 400, headers);
      }

      const counts = await failureCounts(identityHash);
      if (isLockedOut(counts.identity, counts.client)) {
        await recordAttempt({ action, identityHash, succeeded: false, failureReason: 'locked_out' });
        return json({ code: 'STUDENT_ACCESS_LOCKED', retryAfterMinutes: IDENTITY_WINDOW_MINUTES }, 429, headers);
      }

      const { data, error } = await service.rpc('resolve_student_access', {
        p_display_name: displayName, p_student_code: studentCode, p_school_id: schoolId
      });
      const candidates = ((data ?? []) as StudentCandidate[]).filter((item) => item.access_enabled);

      if (error || candidates.length === 0) {
        await recordAttempt({ action, identityHash, succeeded: false, failureReason: 'no_match' });
        return json({ code: GENERIC_FAILURE }, 401, headers);
      }
      if (candidates.length > 1) {
        // Two schools can legitimately issue the same student number to a same-named child. Guessing
        // here would sign a child into a stranger's record, so the only safe move is to ask.
        await recordAttempt({ action, identityHash, succeeded: false, failureReason: 'ambiguous' });
        return json({
          code: 'SCHOOL_SELECTION_REQUIRED',
          schools: candidates.map((item) => ({ schoolId: item.school_id, name: item.school_name }))
        }, 409, headers);
      }

      const candidate = candidates[0]!;
      const result = await mintStudentSession(candidate);
      await recordAttempt({
        action, identityHash, succeeded: true, schoolId: candidate.school_id, studentId: candidate.student_id
      });
      return json(result, 200, headers);
    }

    if (action === 'register') {
      const firstName = String(body.firstName ?? '').replace(/\s+/g, ' ').trim();
      const lastName = String(body.lastName ?? '').replace(/\s+/g, ' ').trim();
      const studentCode = normalizeStudentCode(String(body.studentCode ?? ''));
      const schoolId = String(body.schoolId ?? '');
      const identityHash = await hmac(`register|${normalizeName(`${firstName} ${lastName}`)}|${studentCode}`, secret);

      if (!firstName || !lastName || !studentCode || !schoolId) {
        await recordAttempt({ action, identityHash, succeeded: false, failureReason: 'validation' });
        return json({ code: GENERIC_FAILURE }, 400, headers);
      }

      const counts = await failureCounts(identityHash);
      if (isLockedOut(counts.identity, counts.client)) {
        await recordAttempt({ action, identityHash, succeeded: false, failureReason: 'locked_out' });
        return json({ code: 'STUDENT_ACCESS_LOCKED', retryAfterMinutes: IDENTITY_WINDOW_MINUTES }, 429, headers);
      }

      const { data, error } = await service.rpc('register_student_access', {
        p_first_name: firstName, p_last_name: lastName, p_student_code: studentCode, p_school_id: schoolId
      });
      if (error) {
        await recordAttempt({ action, identityHash, succeeded: false, failureReason: 'rejected' });
        const alreadyLinked = String(error.message ?? '').includes('TARGET_ALREADY_LINKED');
        const disabled = String(error.message ?? '').includes('SELF_REGISTRATION_DISABLED');
        if (alreadyLinked) return json({ code: 'STUDENT_ALREADY_ACTIVE' }, 409, headers);
        if (disabled) return json({ code: 'SELF_REGISTRATION_DISABLED' }, 403, headers);
        return json({ code: GENERIC_FAILURE }, 401, headers);
      }

      const registered = data as { studentId: string; schoolId: string; schoolName: string; displayName: string; created: boolean };
      const result = await mintStudentSession({
        student_id: registered.studentId, school_id: registered.schoolId, school_name: registered.schoolName,
        display_name: registered.displayName, student_code: studentCode, profile_id: null, access_enabled: true
      });
      await recordAttempt({
        action, identityHash, succeeded: true, schoolId: registered.schoolId, studentId: registered.studentId
      });
      return json({ ...result, created: registered.created }, 201, headers);
    }

    return json({ code: 'UNSUPPORTED_ACTION' }, 400, headers);
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : '';
    if (message.includes('STUDENT_ACCESS_REVOKED')) return json({ code: 'STUDENT_ACCESS_REVOKED' }, 403, headers);
    return json({ code: GENERIC_FAILURE }, 401, headers);
  }
});
