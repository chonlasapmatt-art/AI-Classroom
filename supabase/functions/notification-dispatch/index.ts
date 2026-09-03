import { corsHeaders, json } from '../_shared/http.ts';
import { clients } from '../_shared/clients.ts';

const MAX_BATCH = 100;
const MAX_MESSAGE_LENGTH = 5000;

interface NotificationJob {
  id: string; parentId: string;
  payload: { title?: string; body?: string; [key: string]: unknown };
  retryCount: number;
}

function constantTimeEqual(left: string, right: string): boolean {
  const a = new TextEncoder().encode(left); const b = new TextEncoder().encode(right);
  let difference = a.length ^ b.length;
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return difference === 0;
}

function retryableStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

async function pushLine(lineUserId: string, message: string): Promise<{ ok: true; providerMessageId: string | null } | { ok: false; retryable: boolean; code: string }> {
  const token = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN');
  if (!token) return { ok: false, retryable: false, code: 'LINE_NOT_CONFIGURED' };
  const response = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: lineUserId, messages: [{ type: 'text', text: message }] })
  });
  if (response.ok) return { ok: true, providerMessageId: response.headers.get('x-line-request-id') };
  return { ok: false, retryable: retryableStatus(response.status), code: `LINE_HTTP_${response.status}` };
}

/** Internal worker: scheduler secret in, service-role queue operations inside the Edge Function. */
Deno.serve(async (request) => {
  const headers = corsHeaders(request.headers.get('Origin'));
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return json({ code: 'METHOD_NOT_ALLOWED' }, 405, headers);

  const expected = Deno.env.get('NOTIFICATION_DISPATCH_SECRET');
  const supplied = request.headers.get('x-notification-dispatch-secret') ?? '';
  if (!expected || !constantTimeEqual(supplied, expected)) return json({ code: 'INVALID_DISPATCH_SECRET' }, 401, headers);
  if (!Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN')) return json({ code: 'SERVER_CONFIGURATION_ERROR' }, 500, headers);

  let limit = 25;
  const body = await request.json().catch(() => ({})) as { limit?: unknown };
  if (typeof body.limit === 'number') limit = Math.min(MAX_BATCH, Math.max(1, Math.floor(body.limit)));

  const { service } = clients(request);
  const startedAt = Date.now();

  // Every invocation leaves a trace, including one that delivered nothing. A queue nobody drains is
  // only dangerous while it is invisible, and the operations console reads these rows to see it.
  const recordRun = async (
    counts: { claimed: number; sent: number; retried: number; deadLettered: number },
    errorCode: string | null
  ) => {
    await service.rpc('record_notification_dispatch_run', {
      p_claimed: counts.claimed, p_sent: counts.sent, p_retried: counts.retried,
      p_dead_lettered: counts.deadLettered, p_duration_ms: Date.now() - startedAt, p_error_code: errorCode
    });
  };

  const { data, error } = await service.rpc('claim_notification_outbox', { p_limit: limit });
  if (error) {
    await recordRun({ claimed: 0, sent: 0, retried: 0, deadLettered: 0 }, 'QUEUE_CLAIM_FAILED');
    return json({ code: 'QUEUE_CLAIM_FAILED' }, 500, headers);
  }

  let sent = 0; let retried = 0; let deadLettered = 0;
  for (const job of (data ?? []) as NotificationJob[]) {
    const { data: parent, error: parentError } = await service.from('parents').select('line_user_id').eq('id', job.parentId).maybeSingle();
    let result: { ok: true; providerMessageId: string | null } | { ok: false; retryable: boolean; code: string };
    if (parentError) result = { ok: false, retryable: true, code: 'PARENT_LOOKUP_FAILED' };
    else if (!parent?.line_user_id) result = { ok: false, retryable: false, code: 'NO_LINE_LINK' };
    else {
      const title = String(job.payload?.title ?? 'Smart Classroom').trim();
      const message = `${title}\n${String(job.payload?.body ?? 'มีข้อมูลใหม่จากโรงเรียน').trim()}`.slice(0, MAX_MESSAGE_LENGTH);
      try { result = await pushLine(String(parent.line_user_id), message); }
      catch { result = { ok: false, retryable: true, code: 'LINE_NETWORK_ERROR' }; }
    }
    const completion = await service.rpc('complete_notification_outbox', {
      p_id: job.id, p_success: result.ok, p_retryable: result.ok ? false : result.retryable,
      p_error_code: result.ok ? null : result.code, p_provider_message_id: result.ok ? result.providerMessageId : null
    });
    if (completion.error) continue;
    if (result.ok) sent += 1;
    else if (result.retryable && job.retryCount < 5) retried += 1;
    else deadLettered += 1;
  }
  const accepted = (data ?? []).length;
  await recordRun({ claimed: accepted, sent, retried, deadLettered }, null);
  return json({ accepted, sent, retried, deadLettered }, 200, headers);
});
