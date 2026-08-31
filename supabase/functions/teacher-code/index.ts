// The administrator's side of the teacher access code: issuing one, reading it back, rotating it and
// closing it.
//
// Every action here is taken by a signed-in person and authorised against their own school by the
// database, not by this file. What this file owns is the key material: it generates the code, seals
// it, hashes it, and is the only place either operation can happen. The database stores the results
// and never sees the secret.
//
// Reading a code back is rate limited like a credential, because that is what it is. An account that
// has lost its administrator membership, or one that never had it, gets the same refusal whether the
// school exists or not.

import { corsHeaders, json } from '../_shared/http.ts';
import { clients } from '../_shared/clients.ts';
import {
  accessCodeHint, formatAccessCode, generateAccessCode, hashAccessCode, openAccessCode, sealAccessCode
} from '../_shared/teacherCode.ts';

const WINDOW_MINUTES = 15;
const ACTION_LIMIT = 30;
const GENERIC_FAILURE = 'TEACHER_CODE_DENIED';
const MAX_ISSUE_ATTEMPTS = 5;

async function hmacHex(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return [...new Uint8Array(signature)].map((part) => part.toString(16).padStart(2, '0')).join('');
}

function clientFingerprint(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for') ?? '';
  const address = forwarded.split(',')[0]?.trim() || request.headers.get('cf-connecting-ip') || 'unknown';
  return `${address}|${request.headers.get('user-agent') ?? 'unknown'}`;
}

Deno.serve(async (request) => {
  const headers = corsHeaders(request.headers.get('Origin'));
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return json({ code: 'METHOD_NOT_ALLOWED' }, 405, headers);

  const secret = Deno.env.get('TEACHER_CODE_SECRET') ?? Deno.env.get('MEMBER_ACCESS_HMAC_SECRET');
  if (!secret || secret.length < 32) return json({ code: 'SERVER_CONFIGURATION_ERROR' }, 503, headers);

  let user: ReturnType<typeof clients>['user'];
  let service: ReturnType<typeof clients>['service'];
  try { ({ user, service } = clients(request)); }
  catch { return json({ code: 'SERVER_CONFIGURATION_ERROR' }, 503, headers); }

  const { data: authData } = await user.auth.getUser();
  const actor = authData?.user?.id;
  if (!actor) return json({ code: 'AUTH_REQUIRED' }, 401, headers);

  const clientHash = await hmacHex(clientFingerprint(request), secret);
  const identityHash = await hmacHex(`teacher-code|${actor}`, secret);

  async function record(action: string, succeeded: boolean, failureReason?: string): Promise<void> {
    await service.from('member_access_attempts').insert({
      action: `teacher-code-${action}`, identity_hash: identityHash, client_hash: clientHash,
      succeeded, failure_reason: failureReason ?? null, profile_id: actor ?? null
    });
  }

  async function overLimit(): Promise<boolean> {
    const since = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString();
    const { count } = await service.from('member_access_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('identity_hash', identityHash).gte('attempted_at', since);
    return (count ?? 0) >= ACTION_LIMIT;
  }

  try {
    const body = await request.json() as Record<string, unknown>;
    const action = String(body.action ?? '');
    const schoolId = String(body.schoolId ?? '');
    if (!schoolId) return json({ code: GENERIC_FAILURE }, 400, headers);

    if (await overLimit()) {
      await record(action || 'unknown', false, 'locked_out');
      return json({ code: 'TEACHER_CODE_LOCKED', retryAfterMinutes: WINDOW_MINUTES }, 429, headers);
    }

    if (action === 'issue') {
      const label = String(body.label ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
      const expiresAt = body.expiresAt ? new Date(String(body.expiresAt)).toISOString() : null;
      const maxUses = body.maxUses === null || body.maxUses === undefined || body.maxUses === ''
        ? null : Number(body.maxUses);
      if (maxUses !== null && (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 10000)) {
        return json({ code: 'TEACHER_CODE_INVALID_LIMIT' }, 400, headers);
      }

      // A six-digit code can collide with one another school already holds; the unique index on
      // active hashes is what says so, and the answer is to draw again rather than to fail.
      for (let attempt = 0; attempt < MAX_ISSUE_ATTEMPTS; attempt += 1) {
        const code = generateAccessCode();
        const { data, error } = await service.rpc('issue_teacher_access_code', {
          p_actor: actor, p_school_id: schoolId,
          p_code_hash: await hashAccessCode(schoolId, code, secret),
          p_code_cipher: await sealAccessCode(code, secret),
          p_code_hint: accessCodeHint(code), p_label: label,
          p_expires_at: expiresAt, p_max_uses: maxUses
        });
        if (!error) {
          await record('issue', true);
          return json({ ...(data as Record<string, unknown>), code: formatAccessCode(code) }, 201, headers);
        }
        const message = String(error.message ?? '');
        if (message.includes('FORBIDDEN')) {
          await record('issue', false, 'forbidden');
          return json({ code: 'TEACHER_CODE_FORBIDDEN' }, 403, headers);
        }
        if (!message.includes('teacher_access_code_active_hash')) {
          await record('issue', false, 'rejected');
          return json({ code: GENERIC_FAILURE }, 400, headers);
        }
      }
      await record('issue', false, 'collision');
      return json({ code: GENERIC_FAILURE }, 503, headers);
    }

    if (action === 'reveal') {
      const { data, error } = await service.rpc('reveal_teacher_access_code', {
        p_actor: actor, p_school_id: schoolId
      });
      if (error) {
        await record('reveal', false, 'forbidden');
        return json({ code: 'TEACHER_CODE_FORBIDDEN' }, 403, headers);
      }
      const result = data as Record<string, unknown>;
      if (!result?.exists) { await record('reveal', true); return json({ exists: false }, 200, headers); }
      const opened = await openAccessCode(String(result.cipher ?? ''), secret);
      await record('reveal', true);
      // A code sealed under a key that has since been replaced cannot be shown. Saying so plainly is
      // better than showing nothing: the fix is to rotate, and the screen can offer that.
      const { cipher: _sealed, ...safe } = result;
      return json({ ...safe, code: opened, unreadable: opened === null }, 200, headers);
    }

    if (action === 'revoke') {
      const codeId = String(body.codeId ?? '');
      const reason = String(body.reason ?? '').replace(/\s+/g, ' ').trim().slice(0, 400);
      if (!codeId) return json({ code: GENERIC_FAILURE }, 400, headers);
      const { data, error } = await service.rpc('revoke_teacher_access_code', {
        p_actor: actor, p_code_id: codeId, p_reason: reason
      });
      if (error) {
        await record('revoke', false, 'forbidden');
        return json({ code: 'TEACHER_CODE_FORBIDDEN' }, 403, headers);
      }
      await record('revoke', true);
      return json(data, 200, headers);
    }

    if (action === 'history') {
      const { data, error } = await service.rpc('teacher_access_code_history', {
        p_actor: actor, p_school_id: schoolId
      });
      if (error) {
        await record('history', false, 'forbidden');
        return json({ code: 'TEACHER_CODE_FORBIDDEN' }, 403, headers);
      }
      await record('history', true);
      return json(data, 200, headers);
    }

    return json({ code: 'UNSUPPORTED_ACTION' }, 400, headers);
  } catch {
    return json({ code: GENERIC_FAILURE }, 400, headers);
  }
});
