import { corsHeaders, json } from '../_shared/http.ts';
import { clients } from '../_shared/clients.ts';

const WINDOW_MINUTES = 15;
const MAX_FAILURES = 5;
const LOCK_MINUTES = 30;

function setupFailureCode(error: { code?: string; message?: string }): string {
  const code = String(error.code ?? '').toUpperCase();
  const message = String(error.message ?? '').toUpperCase();
  if (code === '23505' || message.includes('SCHOOL_CODE') || message.includes('SCHOOLS_CODE')) return 'SCHOOL_CODE_EXISTS';
  if (message.includes('ALREADY_HAS_MEMBERSHIP')) return 'ALREADY_HAS_MEMBERSHIP';
  if (message.includes('AUTH_REQUIRED')) return 'AUTH_REQUIRED';
  if (message.includes('VALIDATION_ERROR')) return 'VALIDATION_ERROR';
  return 'SETUP_REJECTED';
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, '0')).join('');
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

Deno.serve(async (request) => {
  const headers = corsHeaders(request.headers.get('Origin'));
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return json({ code: 'METHOD_NOT_ALLOWED' }, 405, headers);

  try {
    const expectedHash = Deno.env.get('ADMIN_ACCESS_CODE_HASH')?.trim().toLowerCase();
    if (!expectedHash || !/^[a-f0-9]{64}$/.test(expectedHash)) {
      return json({ code: 'SERVER_CONFIGURATION_ERROR' }, 503, headers);
    }

    const { user, service } = clients(request);
    const { data: authData, error: authError } = await user.auth.getUser();
    if (authError || !authData.user) return json({ code: 'AUTH_REQUIRED' }, 401, headers);

    const body = await request.json() as Record<string, unknown>;
    // The code is pasted far more often than it is typed, and a pasted line usually carries a
    // trailing space or newline. Comparing that byte for byte spends one of five attempts on a
    // character nobody can see, so the surrounding whitespace is removed before the check. What is
    // inside the code still has to match exactly.
    const accessCode = String(body.accessCode ?? '').trim();
    const displayName = String(body.displayName ?? '').replace(/\s+/g, ' ').trim();
    if (displayName.length < 2 || displayName.length > 200) return json({ code: 'VALIDATION_ERROR' }, 400, headers);
    const actorId = authData.user.id;
    const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
    const fingerprintHash = await sha256(`${forwarded}|${request.headers.get('user-agent') ?? 'unknown'}`);
    const windowStart = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString();

    const { data: attempts, error: attemptsError } = await service.from('admin_access_attempts')
      .select('succeeded,locked_until').eq('actor_profile_id', actorId).eq('fingerprint_hash', fingerprintHash)
      .gte('attempted_at', windowStart).order('attempted_at', { ascending: false });
    if (attemptsError) throw attemptsError;
    const locked = (attempts ?? []).some((row) => row.locked_until && new Date(row.locked_until).getTime() > Date.now());
    const failureCount = (attempts ?? []).filter((row) => !row.succeeded).length;
    const suppliedHash = await sha256(accessCode);
    const accessCodeMatches = constantTimeEqual(suppliedHash, expectedHash);
    // A correct server-side code is an intentional recovery path after a mistyped-code lock.
    // Incorrect codes remain rate-limited exactly as before.
    if ((locked || failureCount >= MAX_FAILURES) && !accessCodeMatches) return json({ code: 'TEMPORARILY_LOCKED' }, 429, headers);

    if (!accessCodeMatches) {
      const lockNow = failureCount + 1 >= MAX_FAILURES;
      await service.from('admin_access_attempts').insert({
        actor_profile_id: actorId, fingerprint_hash: fingerprintHash, succeeded: false,
        failure_reason: 'INVALID_CODE',
        locked_until: lockNow ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString() : null
      });
      return json({ code: lockNow ? 'TEMPORARILY_LOCKED' : 'ACCESS_DENIED' }, lockNow ? 429 : 403, headers);
    }

    const { data: schoolId, error: setupError } = await service.rpc('bootstrap_school_owner', {
      p_actor: actorId,
      p_school_name: String(body.schoolName ?? ''),
      p_school_code: String(body.schoolCode ?? ''),
      p_academic_year: String(body.academicYear ?? ''),
      p_term: String(body.term ?? ''),
      p_display_name: displayName
    });
    if (setupError) {
      const failureCode = setupFailureCode(setupError);
      await service.from('admin_access_attempts').insert({
        actor_profile_id: actorId, fingerprint_hash: fingerprintHash, succeeded: false,
        failure_reason: failureCode
      });
      return json({ code: failureCode }, failureCode === 'AUTH_REQUIRED' ? 401 : 400, headers);
    }

    await service.from('admin_access_attempts').insert({
      actor_profile_id: actorId, fingerprint_hash: fingerprintHash, succeeded: true
    });
    return json({ schoolId }, 201, headers);
  } catch {
    return json({ code: 'INTERNAL_ERROR' }, 500, headers);
  }
});
