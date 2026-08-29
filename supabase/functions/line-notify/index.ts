import { corsHeaders, json } from '../_shared/http.ts';
import { clients } from '../_shared/clients.ts';

const encoder = new TextEncoder();

async function verifySignature(body: string, signature: string, secret: string): Promise<boolean> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
  let binary = '';
  new Uint8Array(digest).forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary) === signature;
}

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function hmacHex(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
}

async function reply(replyToken: string, text: string): Promise<void> {
  const token = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN');
  if (!token || !replyToken) return;
  await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ replyToken, messages: [{ type: 'text', text }] })
  });
}

async function profileName(lineUserId: string): Promise<string> {
  const token = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN');
  if (!token) return '';
  const response = await fetch(`https://api.line.me/v2/bot/profile/${lineUserId}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) return '';
  const profile = await response.json() as { displayName?: string };
  return profile.displayName ?? '';
}

interface LineEvent {
  type: string;
  replyToken?: string;
  source?: { userId?: string };
  message?: { type: string; text?: string };
}

/**
 * LINE webhook. Verifies the channel signature, then completes parent account linking: a parent
 * sends the six-digit code a teacher issued, and the code is matched against the open invitations
 * using the same salted HMAC the parent-link function stored. Codes are never logged, attempts are
 * counted server side, and linking runs through a service-role RPC — nothing here trusts the client.
 */
Deno.serve(async (request) => {
  const headers = corsHeaders(request.headers.get('Origin'));
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });

  const channelSecret = Deno.env.get('LINE_CHANNEL_SECRET');
  const linkSecret = Deno.env.get('PARENT_LINK_HMAC_SECRET');
  if (!channelSecret || !linkSecret) return json({ code: 'SERVER_CONFIGURATION_ERROR' }, 500, headers);

  const raw = await request.text();
  if (!await verifySignature(raw, request.headers.get('x-line-signature') ?? '', channelSecret)) {
    return json({ code: 'INVALID_SIGNATURE' }, 401, headers);
  }

  const { service } = clients(request);
  let events: LineEvent[] = [];
  try { events = (JSON.parse(raw) as { events?: LineEvent[] }).events ?? []; } catch { events = []; }

  let linked = 0;
  for (const event of events) {
    const lineUserId = event.source?.userId;
    const text = event.message?.text?.trim() ?? '';
    if (event.type !== 'message' || event.message?.type !== 'text' || !lineUserId) continue;
    if (!/^\d{6}$/.test(text)) {
      await reply(event.replyToken ?? '', 'ส่งรหัสผูกบัญชี 6 หลักที่ได้รับจากครูประจำชั้นเพื่อเชื่อมบัญชีผู้ปกครอง');
      continue;
    }

    const { data: invitations, error } = await service.rpc('open_parent_invitations');
    if (error) return json({ code: 'LOOKUP_FAILED' }, 500, headers);

    let matched: { id: string; school_id: string; student_id: string } | null = null;
    for (const invitation of (invitations ?? []) as Array<{ id: string; school_id: string; student_id: string }>) {
      const candidate = await hmacHex(linkSecret, `${invitation.school_id}:${invitation.student_id}:${text}`);
      const { data: stored } = await service
        .from('parent_link_invitations').select('code_hash').eq('id', invitation.id).limit(1).maybeSingle();
      if (stored?.code_hash === candidate) { matched = invitation; break; }
      await service.rpc('record_parent_invitation_attempt', { p_invitation_id: invitation.id });
    }

    if (!matched) {
      await reply(event.replyToken ?? '', 'รหัสไม่ถูกต้องหรือหมดอายุแล้ว กรุณาขอรหัสใหม่จากครูประจำชั้น');
      continue;
    }

    const displayName = await profileName(lineUserId);
    const { error: redeemError } = await service.rpc('redeem_parent_invitation', {
      p_invitation_id: matched.id, p_line_user_id: lineUserId, p_display_name: displayName, p_relationship: 'ผู้ปกครอง'
    });
    if (redeemError) {
      await reply(event.replyToken ?? '', 'เชื่อมบัญชีไม่สำเร็จ กรุณาติดต่อครูประจำชั้น');
      continue;
    }

    linked += 1;
    await reply(event.replyToken ?? '', 'เชื่อมบัญชีผู้ปกครองเรียบร้อยแล้ว โรงเรียนจะส่งข่าวสารของบุตรหลานผ่าน LINE นี้');
  }

  return json({ accepted: true, linked }, 202, headers);
});
