// One-off check that the school's teacher code behaves the way a teacher registering will find it.
//
// It uses the production path rather than reading the stored hash: claim the code, then hand the use
// straight back with release_teacher_access_code, which exists for exactly this — a registration that
// claimed a use and then failed.

import crypto from 'node:crypto';

const url = process.env.SC_URL;
const key = process.env.SC_SERVICE_KEY;
const secret = process.env.SC_TEACHER_SECRET;
const school = 'd7663c42-7cde-4f12-8159-82aeef99e3c5';
const otherSchool = 'a7a9c3ef-14ad-438f-94da-8c5469986b6a';

const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
const rpc = (fn, body) => fetch(`${url}/rest/v1/rpc/${fn}`, {
  method: 'POST', headers, body: JSON.stringify(body)
}).then(async (response) => response.json().catch(() => null));

const normalize = (typed) => typed.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
const hashFor = (schoolId, typed) => crypto
  .createHmac('sha256', secret)
  .update(`teacher-code|${schoolId}|${normalize(typed)}`)
  .digest('hex');

(async () => {
  for (const typed of ['SC-001', 'sc001', 'SC 001', '  sc-001 ', 'SC-002']) {
    const result = await rpc('claim_teacher_access_code', {
      p_school_id: school, p_code_hash: hashFor(school, typed)
    });
    const accepted = result && result.valid === true;
    console.log(`typed "${typed}"`.padEnd(20), accepted ? 'ACCEPTED' : 'refused');
    if (accepted) await rpc('release_teacher_access_code', { p_code_id: result.codeId });
  }

  const crossSchool = await rpc('claim_teacher_access_code', {
    p_school_id: otherSchool, p_code_hash: hashFor(otherSchool, 'SC-001')
  });
  console.log('same code, other school'.padEnd(20),
    crossSchool && crossSchool.valid === true ? 'ACCEPTED — WRONG' : 'refused');
})();
