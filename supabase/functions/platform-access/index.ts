// The two things the operations console cannot do for itself: becoming an operator, and proving it
// is still the operator sitting there.
//
// Enrolment is deliberately not something any signed-in account can request. It needs a code held in
// the server environment, checked here, rate limited and recorded — the same shape as the private
// owner entry, for the same reason: a hidden URL is not a permission, and an email address is not an
// authorisation.
//
// Re-authentication exists because the dangerous actions in the console — suspending a school,
// raising the minimum client version — are checked in the database against a timestamp this function
// is the only thing allowed to write. The console cannot decide it has re-authenticated; it can only
// ask GoTrue to verify a password and let the database record that it did.

import { corsHeaders, json } from '../_shared/http.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const WINDOW_MINUTES = 15;
const MAX_FAILURES = 5;
const GENERIC_FAILURE = 'PLATFORM_ACCESS_DENIED';

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, '0')).join('');
}

/** Compares two hex digests without letting the time taken say how much of it matched. */
function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

function text(body: Record<string, unknown>, key: string, max = 200): string {
  return String(body[key] ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function splitName(displayName: string): { firstName: string; lastName: string } {
  const parts = displayName.split(' ').filter(Boolean);
  return { firstName: parts[0] ?? displayName, lastName: parts.slice(1).join(' ') || '-' };
}

function adminEmail(recordId: string): string {
  const domain = Deno.env.get('ADMIN_ACCESS_EMAIL_DOMAIN') ?? 'admins.smart-classroom.invalid';
  return `admin.${recordId}@${domain}`;
}

Deno.serve(async (request) => {
  const headers = corsHeaders(request.headers.get('Origin'));
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return json({ code: 'METHOD_NOT_ALLOWED' }, 405, headers);

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anonKey || !serviceKey) return json({ code: 'SERVER_CONFIGURATION_ERROR' }, 503, headers);

  const authorization = request.headers.get('Authorization') ?? '';
  const service = createClient(url, serviceKey, { auth: { persistSession: false } });
  const anon = createClient(url, anonKey, { auth: { persistSession: false } });
  const scoped = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } }, auth: { persistSession: false }
  });

  const { data: authData } = await scoped.auth.getUser();
  const actor = authData?.user?.id;
  const actorEmail = authData?.user?.email;
  if (!actor) return json({ code: 'AUTH_REQUIRED' }, 401, headers);

  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const fingerprintHash = await sha256(`${forwarded}|${request.headers.get('user-agent') ?? 'unknown'}`);
  const windowStart = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString();

  /** Reuses the administrator attempt ledger rather than starting a second one for the same job. */
  async function failures(): Promise<number> {
    const { count } = await service.from('admin_access_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('actor_profile_id', actor).eq('fingerprint_hash', fingerprintHash)
      .eq('succeeded', false).gte('attempted_at', windowStart);
    return count ?? 0;
  }

  async function recordAttempt(succeeded: boolean): Promise<void> {
    await service.from('admin_access_attempts').insert({
      actor_profile_id: actor, fingerprint_hash: fingerprintHash, succeeded
    });
  }

  try {
    const body = await request.json() as Record<string, unknown>;
    const action = String(body.action ?? '');

    if (await failures() >= MAX_FAILURES) {
      return json({ code: 'PLATFORM_ACCESS_LOCKED', retryAfterMinutes: WINDOW_MINUTES }, 429, headers);
    }


    if (action === 'enroll') {
      const expected = Deno.env.get('PLATFORM_ADMIN_CODE_HASH')?.trim().toLowerCase();
      if (!expected || !/^[a-f0-9]{64}$/.test(expected)) {
        return json({ code: 'SERVER_CONFIGURATION_ERROR' }, 503, headers);
      }
      // Pasted codes arrive with trailing whitespace far more often than they arrive wrong. Trimming
      // the outside costs nothing; what is inside still has to match byte for byte.
      const supplied = await sha256(String(body.accessCode ?? '').trim());
      if (!constantTimeEqual(supplied, expected)) {
        await recordAttempt(false);
        return json({ code: GENERIC_FAILURE }, 403, headers);
      }
      const { data, error } = await service.rpc('grant_platform_admin', {
        p_actor: actor, p_profile_id: actor,
        p_display_name: String(body.displayName ?? '').slice(0, 200),
        p_notes: String(body.notes ?? '').slice(0, 400)
      });
      if (error) {
        await recordAttempt(false);
        return json({ code: GENERIC_FAILURE }, 403, headers);
      }
      await recordAttempt(true);
      return json(data, 201, headers);
    }

    if (action === 'reauthenticate') {
      const password = String(body.password ?? '');
      if (!actorEmail || password.length < 1) {
        await recordAttempt(false);
        return json({ code: GENERIC_FAILURE }, 400, headers);
      }
      const { data: platform } = await service.from('platform_admins')
        .select('profile_id').eq('profile_id', actor).eq('status', 'active').maybeSingle();
      if (!platform) {
        await recordAttempt(false);
        return json({ code: 'PLATFORM_FORBIDDEN' }, 403, headers);
      }
      // GoTrue verifies the password, exactly as it does at sign-in. This function never sees a
      // hash and never compares one.
      const { data: verified, error: signInError } = await anon.auth.signInWithPassword({
        email: actorEmail, password
      });
      if (signInError || !verified.session) {
        await recordAttempt(false);
        return json({ code: GENERIC_FAILURE }, 401, headers);
      }
      const { error: recordError } = await service.rpc('record_platform_reauth', { p_actor: actor });
      if (recordError) return json({ code: GENERIC_FAILURE }, 400, headers);
      await recordAttempt(true);
      return json({ verified: true, windowMinutes: 15 }, 200, headers);
    }

    if (action === 'grant') {
      // Granting somebody else platform authority needs a fresh password of the operator doing it,
      // which the database checks; this endpoint only carries the request.
      const targetProfileId = String(body.profileId ?? '');
      if (!targetProfileId) return json({ code: GENERIC_FAILURE }, 400, headers);
      const { data: fresh } = await service.rpc('platform_reauth_fresh', { p_actor: actor, p_minutes: 15 });
      if (fresh !== true) return json({ code: 'REAUTHENTICATION_REQUIRED' }, 403, headers);
      const { data, error } = await service.rpc('grant_platform_admin', {
        p_actor: actor, p_profile_id: targetProfileId,
        p_display_name: String(body.displayName ?? '').slice(0, 200),
        p_notes: String(body.notes ?? '').slice(0, 400)
      });
      if (error) return json({ code: 'PLATFORM_FORBIDDEN' }, 403, headers);
      return json(data, 201, headers);
    }

    if (action === 'provision-school-admin') {
      const { data: platform } = await service.from('platform_admins')
        .select('profile_id').eq('profile_id', actor).eq('status', 'active').is('revoked_at', null).maybeSingle();
      if (!platform) return json({ code: 'PLATFORM_FORBIDDEN' }, 403, headers);
      const { data: fresh } = await service.rpc('platform_reauth_fresh', { p_actor: actor, p_minutes: 15 });
      if (fresh !== true) return json({ code: 'REAUTHENTICATION_REQUIRED' }, 403, headers);

      const displayName = text(body, 'displayName');
      const password = String(body.password ?? '');
      const schoolId = text(body, 'schoolId', 80) || null;
      const schoolName = text(body, 'schoolName');
      const schoolCode = text(body, 'schoolCode', 20).toUpperCase();
      const academicYear = text(body, 'academicYear', 40);
      const term = text(body, 'term', 40);
      const recordId = text(body, 'recordId', 80) || crypto.randomUUID();
      if (displayName.length < 2 || password.length < 8 || (schoolId === null && (schoolName.length < 2 || !/^[A-Z0-9-]{3,20}$/.test(schoolCode) || academicYear.length < 2 || term.length < 1))) {
        return json({ code: 'VALIDATION_ERROR' }, 400, headers);
      }

      const { firstName, lastName } = splitName(displayName);
      const email = adminEmail(recordId);
      const { data: created, error: createError } = await service.auth.admin.createUser({
        email, password, email_confirm: true,
        user_metadata: { display_name: displayName, requested_role: 'admin' },
        app_metadata: { access_model: 'platform_managed_name_password', member_role: 'admin', ...(schoolId ? { school_id: schoolId } : {}) }
      });
      let profileId = created.user?.id ?? null;
      if (createError || !profileId) {
        const existing = await service.auth.admin.getUserByEmail(email);
        profileId = existing.data.user?.id ?? null;
        if (!profileId) return json({ code: 'ADMIN_ACCOUNT_FAILED' }, 400, headers);
        const { error: updateError } = await service.auth.admin.updateUserById(profileId, { password });
        if (updateError) return json({ code: 'ADMIN_ACCOUNT_FAILED' }, 400, headers);
      }

      const { data: bound, error: bindError } = await service.rpc('provision_school_admin', {
        p_actor: actor, p_profile_id: profileId, p_display_name: displayName,
        p_first_name: firstName, p_last_name: lastName, p_auth_email: email,
        p_school_id: schoolId, p_school_name: schoolName, p_school_code: schoolCode,
        p_academic_year: academicYear, p_term: term
      });
      if (bindError || !bound) {
        if (created.user) await service.auth.admin.deleteUser(created.user.id).catch(() => undefined);
        const message = String(bindError?.message ?? '');
        const code = message.includes('SCHOOL_CODE_TAKEN') ? 'SCHOOL_CODE_TAKEN'
          : message.includes('SCHOOL_NOT_FOUND') ? 'SCHOOL_NOT_FOUND'
            : message.includes('ROLE_CONFLICT') ? 'ROLE_CONFLICT'
              : message.includes('REAUTHENTICATION_REQUIRED') ? 'REAUTHENTICATION_REQUIRED'
                : message.includes('FORBIDDEN') ? 'PLATFORM_FORBIDDEN' : 'ADMIN_ACCOUNT_FAILED';
        return json({ code }, code === 'SCHOOL_CODE_TAKEN' ? 409 : code === 'SCHOOL_NOT_FOUND' ? 404 : 400, headers);
      }
      return json(bound, 201, headers);
    }

    if (action === 'revoke') {
      const targetProfileId = String(body.profileId ?? '');
      const reason = String(body.reason ?? '').trim().slice(0, 400);
      if (!targetProfileId || reason.length < 4) return json({ code: GENERIC_FAILURE }, 400, headers);
      const { data: fresh } = await service.rpc('platform_reauth_fresh', { p_actor: actor, p_minutes: 15 });
      if (fresh !== true) return json({ code: 'REAUTHENTICATION_REQUIRED' }, 403, headers);
      const { error } = await service.rpc('revoke_platform_admin', {
        p_actor: actor, p_profile_id: targetProfileId, p_reason: reason
      });
      if (error) {
        const message = String(error.message ?? '');
        if (message.includes('LAST_PLATFORM_ADMIN')) return json({ code: 'LAST_PLATFORM_ADMIN' }, 409, headers);
        return json({ code: 'PLATFORM_FORBIDDEN' }, 403, headers);
      }
      return json({ revoked: true }, 200, headers);
    }

    return json({ code: 'UNSUPPORTED_ACTION' }, 400, headers);
  } catch {
    return json({ code: GENERIC_FAILURE }, 400, headers);
  }
});
