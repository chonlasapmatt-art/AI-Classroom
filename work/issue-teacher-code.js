// Issues a school's chosen teacher code directly, the way the Edge Function would.
//
// Used once to set up บ้านไทเกอร์ before its administrator had signed in. Everything the gateway
// does is reproduced here rather than skipped: the HMAC is keyed with the same secret and bound to
// the same school, and the code is sealed with AES-GCM under the same derived key, so the code this
// writes is readable and matchable by the deployed function afterwards.
//
// It then proves it, through the production path: claim the code exactly as a registering teacher
// would, and hand the use straight back with release_teacher_access_code.

import crypto from 'node:crypto';

const url = process.env.SC_URL;
const key = process.env.SC_SERVICE_KEY;
const secret = process.env.SC_TEACHER_SECRET;
const school = process.env.SC_SCHOOL_ID;
const actor = process.env.SC_ACTOR_ID;
const otherSchool = process.env.SC_OTHER_SCHOOL_ID;
const chosen = process.env.SC_CHOSEN_CODE;

if (!url || !key || !secret || !school || !actor || !chosen) {
  console.error('missing environment');
  process.exit(1);
}

const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
const rpc = (fn, body) => fetch(`${url}/rest/v1/rpc/${fn}`, {
  method: 'POST', headers, body: JSON.stringify(body)
}).then((response) => response.json().catch(() => null));

const normalize = (typed) => typed.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
const hashFor = (schoolId, typed) => crypto
  .createHmac('sha256', secret)
  .update(`teacher-code|${schoolId}|${normalize(typed)}`)
  .digest('hex');

/** Same shape the Edge Function writes: iv || ciphertext || tag, which is what WebCrypto reads. */
function seal(plain) {
  const aesKey = crypto.createHash('sha256').update(secret).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, iv);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, body, cipher.getAuthTag()]).toString('base64');
}

function hintFor(display) {
  const prefix = display.startsWith('SC-') ? 'SC-' : '';
  const body = display.slice(prefix.length);
  if (body.length <= 2) return prefix + '•'.repeat(body.length);
  return prefix + '•'.repeat(body.length - 2) + body.slice(-2);
}

(async () => {
  const normalized = normalize(chosen);
  const display = /^SC\d+$/.test(normalized) ? `SC-${normalized.slice(2)}` : normalized;

  const issued = await rpc('issue_teacher_access_code', {
    p_actor: actor,
    p_school_id: school,
    p_code_hash: hashFor(school, display),
    p_code_cipher: seal(display),
    p_code_hint: hintFor(display),
    p_label: 'รหัสที่โรงเรียนตั้งเอง',
    p_expires_at: null,
    p_max_uses: null
  });
  console.log('issued:', JSON.stringify(issued));
  if (!issued || !issued.codeId) process.exit(1);

  console.log('');
  console.log('what a registering teacher would find:');
  for (const typed of [chosen, normalized.toLowerCase(), `  ${chosen} `, 'SC-002']) {
    const result = await rpc('claim_teacher_access_code', {
      p_school_id: school, p_code_hash: hashFor(school, typed)
    });
    const accepted = result && result.valid === true;
    console.log(`  typed "${typed}"`.padEnd(26), accepted ? 'ACCEPTED' : 'refused');
    if (accepted) await rpc('release_teacher_access_code', { p_code_id: result.codeId });
  }

  if (otherSchool) {
    const cross = await rpc('claim_teacher_access_code', {
      p_school_id: otherSchool, p_code_hash: hashFor(otherSchool, chosen)
    });
    console.log('  same code, other school'.padEnd(26),
      cross && cross.valid === true ? 'ACCEPTED - WRONG' : 'refused');
  }
})();
