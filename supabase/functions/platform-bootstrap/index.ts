// The first operator of a deployment that has none.
//
// Every other way into `platform_admins` needs a session, and the console's only door signs you in
// as an operator that already exists. A platform with no operator therefore could not be given one
// from inside the platform, and the only workaround was to write the row by hand in SQL.
//
// This is a separate deployable for the same reason `platform-dev-access` is: it is the one endpoint
// that acts with no session behind it, so it does not share a function with the endpoints a running
// project depends on. Where it is deployed, three things all have to hold:
//
//   * The platform code must be right, checked against the same hash every other door uses, in
//     constant time, behind the same per-machine rate limit.
//   * There must be no active operator. The window closes the moment it succeeds — after that the
//     database itself refuses, because `provision_platform_operator` requires an operator once one
//     exists rather than trusting this function to stop calling.
//   * The account it creates must belong to no school. That is checked in the database too.
//
// It creates an account and grants it platform authority, and it mints no session: whoever ran it
// then signs in through the console's ordinary door like any other operator. One fewer place that
// can hand out a session is worth the extra step.

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

/** An address nobody is ever shown, on a domain that cannot receive mail. */
function operatorEmail(recordId: string): string {
  const domain = Deno.env.get('PLATFORM_OPERATOR_EMAIL_DOMAIN') ?? 'operators.smart-classroom.invalid';
  return `operator.${recordId}@${domain}`;
}

Deno.serve(async (request) => {
  const headers = corsHeaders(request.headers.get('Origin'));
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return json({ code: 'METHOD_NOT_ALLOWED' }, 405, headers);

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const expected = (Deno.env.get('PLATFORM_ADMIN_CODE_HASH')?.trim()
    || Deno.env.get('ADMIN_ACCESS_CODE_HASH')?.trim()
    || '').toLowerCase();
  if (!url || !serviceKey || !expected || !/^[a-f0-9]{64}$/.test(expected)) {
    return json({ code: 'SERVER_CONFIGURATION_ERROR' }, 503, headers);
  }

  const service = createClient(url, serviceKey, { auth: { persistSession: false } });

  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const fingerprintHash = await sha256(`${forwarded}|${request.headers.get('user-agent') ?? 'unknown'}`);
  const windowStart = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString();

  const { count } = await service.from('admin_access_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('fingerprint_hash', fingerprintHash).eq('succeeded', false)
    .gte('attempted_at', windowStart);
  if ((count ?? 0) >= MAX_FAILURES) {
    return json({ code: 'PLATFORM_ACCESS_LOCKED', retryAfterMinutes: WINDOW_MINUTES }, 429, headers);
  }

  const record = (succeeded: boolean) => service.from('admin_access_attempts').insert({
    actor_profile_id: null, fingerprint_hash: fingerprintHash, succeeded,
    failure_reason: succeeded ? null : 'platform_bootstrap'
  });

  try {
    const body = await request.json() as Record<string, unknown>;
    const displayName = String(body.displayName ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
    const password = String(body.password ?? '');
    const supplied = await sha256(String(body.accessCode ?? '').trim());

    // The code is checked before anything about the request is acted on, and a wrong one is counted
    // whatever else was wrong with the call.
    if (!constantTimeEqual(supplied, expected)) {
      await record(false);
      return json({ code: GENERIC_FAILURE }, 403, headers);
    }

    if (displayName.length < 2 || password.length < 12) {
      // Twelve rather than eight: this account can see every school on the platform, and it is
      // typed once and then stored in a password manager.
      return json({ code: 'VALIDATION_ERROR' }, 400, headers);
    }

    // Checked here so the caller gets a message that says what happened, and checked again in the
    // database, which is what actually refuses.
    const { count: operators } = await service.from('platform_admins')
      .select('profile_id', { count: 'exact', head: true })
      .eq('status', 'active').is('revoked_at', null);
    if ((operators ?? 0) > 0) {
      return json({ code: 'PLATFORM_ALREADY_BOOTSTRAPPED' }, 409, headers);
    }

    const recordId = crypto.randomUUID();
    const email = operatorEmail(recordId);
    const { data: created, error: createError } = await service.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { display_name: displayName },
      // No `member_role` and no `school_id`: this account is not a member of anything, which is the
      // whole point of it. It cannot sign into the school application at all — there is no login
      // identity for it to resolve a name against.
      app_metadata: { access_model: 'platform_operator' }
    });
    const profileId = created?.user?.id;
    if (createError || !profileId) {
      await record(false);
      return json({ code: 'OPERATOR_ACCOUNT_FAILED' }, 400, headers);
    }

    const { data, error } = await service.rpc('provision_platform_operator', {
      p_actor: null, p_profile_id: profileId, p_display_name: displayName,
      p_notes: 'bootstrap: first operator of this deployment'
    });
    if (error) {
      // Leaving a half-made account behind would mean the next attempt could not use the same
      // address, and the operator would be locked out by their own first try.
      await service.auth.admin.deleteUser(profileId).catch(() => undefined);
      await record(false);
      const message = String(error.message ?? '');
      return json({
        code: message.includes('OPERATOR_HAS_SCHOOL_MEMBERSHIP') ? 'OPERATOR_HAS_SCHOOL_MEMBERSHIP'
          : message.includes('FORBIDDEN') ? 'PLATFORM_ALREADY_BOOTSTRAPPED'
            : 'OPERATOR_ACCOUNT_FAILED'
      }, 400, headers);
    }

    await record(true);
    // The operator id is returned so the console can say which account it just made. No session:
    // signing in is the ordinary door's job.
    return json({ ...(data as Record<string, unknown>), signInWith: 'platform-access-code' }, 201, headers);
  } catch {
    return json({ code: GENERIC_FAILURE }, 400, headers);
  }
});
