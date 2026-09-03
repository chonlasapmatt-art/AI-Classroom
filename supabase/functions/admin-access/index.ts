// First-run activation: drawing a customer's product key, and spending it to create their school.
//
// Two things can authorise a school here, and they answer two different situations.
//
//   * The key the setup wizard drew for this account. The gateway generates it, shows it once, and
//     keeps only its digest. This is what a customer who bought the product uses, and it is theirs
//     alone — a key read off one customer's screen activates nothing on anybody else's server.
//   * `ADMIN_ACCESS_CODE_HASH`, the code hashed into the server environment at install time. This
//     is how the owner activates a deployment by hand, and it stays supported unchanged.
//
// Whichever one is used, the check is against a digest, in constant time, rate limited per account
// and per machine, and every attempt is written down. The plaintext of a key exists in exactly one
// place for exactly one response: the moment it is drawn.

import { corsHeaders, json } from '../_shared/http.ts';
import { clients } from '../_shared/clients.ts';
import {
  formatProductKey, generateProductKey, normalizeProductKey, openProductKey,
  productKeyHint, resolveProductKeySecret, sealProductKey, sha256Hex as sha256
} from '../_shared/productKey.ts';

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
    const { user, service } = clients(request);
    const { data: authData, error: authError } = await user.auth.getUser();
    if (authError || !authData.user) return json({ code: 'AUTH_REQUIRED' }, 401, headers);

    const body = await request.json() as Record<string, unknown>;
    const action = String(body.action ?? 'activate');
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

    // Drawing a key is the step before any code is typed, so it is rate limited on its own terms:
    // an account being hammered is not handed an endless supply of fresh keys to try against.
    //
    // Asking twice is not drawing twice. A customer who reloads the wizard, or comes back to it a
    // week later, gets the key they were sold — the same twenty characters, opened from the seal
    // rather than generated again. A key that changes under somebody who wrote it down is a key
    // they no longer trust.
    if (action === 'issue-product-key') {
      if (locked || failureCount >= MAX_FAILURES) {
        return json({ code: 'TEMPORARILY_LOCKED' }, 429, headers);
      }
      const secret = resolveProductKeySecret((name) => Deno.env.get(name));
      // Without the sealing secret a key could still be drawn, and could never be recovered by
      // anybody — which is the failure this whole path exists to remove. Refusing here is a
      // configuration error the installer can fix in one command; an unrecoverable key is not.
      if (!secret) return json({ code: 'SERVER_CONFIGURATION_ERROR' }, 503, headers);

      const drawn = generateProductKey();
      const { data: issued, error: issueError } = await service.rpc('issue_product_activation_key', {
        // Hashed through the same normaliser the activation step uses, so the two can never drift
        // apart again: whatever `formatProductKey` shows reduces back to exactly this.
        p_actor: actorId, p_key_hash: await sha256(normalizeProductKey(drawn)),
        p_key_cipher: await sealProductKey(drawn, secret), p_key_hint: productKeyHint(drawn)
      });
      if (issueError) {
        const message = String(issueError.message ?? '');
        if (message.includes('ALREADY_HAS_MEMBERSHIP')) return json({ code: 'ALREADY_HAS_MEMBERSHIP' }, 409, headers);
        return json({ code: 'PRODUCT_KEY_FAILED' }, 400, headers);
      }

      const record = (issued ?? {}) as { existing?: boolean; keyCipher?: string; hint?: string };
      if (record.existing && record.keyCipher) {
        const opened = await openProductKey(record.keyCipher, secret);
        // A seal that will not open under the configured secret means the secret was rotated. Saying
        // so beats handing back a different key and letting the customer discover the swap later.
        if (!opened) return json({ code: 'PRODUCT_KEY_UNREADABLE' }, 409, headers);
        return json({ productKey: formatProductKey(opened), hint: productKeyHint(opened), existing: true }, 200, headers);
      }

      return json({ productKey: formatProductKey(drawn), hint: productKeyHint(drawn), existing: false }, 201, headers);
    }

    if (action !== 'activate') return json({ code: 'ACTION_NOT_SUPPORTED' }, 400, headers);

    // The code is pasted far more often than it is typed, and a pasted line usually carries a
    // trailing space or newline. Comparing that byte for byte spends one of five attempts on a
    // character nobody can see, so the surrounding whitespace is removed before the check. What is
    // inside the code still has to match exactly.
    const accessCode = String(body.accessCode ?? '').trim();
    const displayName = String(body.displayName ?? '').replace(/\s+/g, ' ').trim();
    if (displayName.length < 2 || displayName.length > 200) return json({ code: 'VALIDATION_ERROR' }, 400, headers);

    // The account's own product key is tried first, on the normalised form, because that is what a
    // customer holds. The environment code is the owner's install-time path and is compared exactly
    // as typed, since it was hashed that way.
    const { data: matchedKeyId } = await service.rpc('verify_product_activation_key', {
      p_actor: actorId, p_key_hash: await sha256(normalizeProductKey(accessCode))
    });
    const productKeyId = typeof matchedKeyId === 'string' ? matchedKeyId : null;

    const expectedHash = Deno.env.get('ADMIN_ACCESS_CODE_HASH')?.trim().toLowerCase();
    const environmentCodeConfigured = Boolean(expectedHash) && /^[a-f0-9]{64}$/.test(expectedHash ?? '');
    const environmentCodeMatches = environmentCodeConfigured
      && constantTimeEqual(await sha256(accessCode), expectedHash!);

    // Neither door exists on this deployment: no key has been drawn for this account and no code was
    // hashed into the environment. That is a server that was never finished being set up, and saying
    // so is more use than five refusals that all look like a typo.
    if (!productKeyId && !environmentCodeConfigured) {
      return json({ code: 'SERVER_CONFIGURATION_ERROR' }, 503, headers);
    }

    const accessCodeMatches = Boolean(productKeyId) || environmentCodeMatches;
    // A correct code is an intentional recovery path after a mistyped-code lock.
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

    // Spent only now. A key spent before the school existed would be gone for good the first time a
    // school code collided, leaving a paying customer with a key that opens nothing.
    if (productKeyId) {
      await service.rpc('consume_product_activation_key', { p_key_id: productKeyId, p_school_id: schoolId });
    }

    await service.from('admin_access_attempts').insert({
      actor_profile_id: actorId, fingerprint_hash: fingerprintHash, succeeded: true
    });
    return json({ schoolId }, 201, headers);
  } catch {
    return json({ code: 'INTERNAL_ERROR' }, 500, headers);
  }
});
