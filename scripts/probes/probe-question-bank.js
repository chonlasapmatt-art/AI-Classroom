// Exercises the question bank as a signed-in member of staff, and then as nobody, because the two
// answers are the point: staff read and write it, and everyone else is refused by the database.

const url = process.env.SC_URL;
const anon = process.env.SC_ANON_KEY;
const displayName = process.env.SC_LOGIN_NAME;
const password = process.env.SC_LOGIN_PASSWORD;
const school = process.env.SC_SCHOOL_ID;

const headers = (token) => ({
  apikey: anon, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json'
});

async function signIn() {
  const response = await fetch(`${url}/functions/v1/member-access`, {
    method: 'POST', headers: headers(anon),
    body: JSON.stringify({ action: 'login', role: 'teacher', displayName, password })
  });
  const body = await response.json().catch(() => null);
  if (!body?.session) throw new Error(`sign-in failed: ${JSON.stringify(body)}`);
  return body.session.accessToken;
}

const rpc = (token, fn, args) => fetch(`${url}/rest/v1/rpc/${fn}`, {
  method: 'POST', headers: headers(token), body: JSON.stringify(args)
}).then(async (response) => ({ status: response.status, body: await response.json().catch(() => null) }));

const select = (token, path) => fetch(`${url}/rest/v1/${path}`, { headers: headers(token) })
  .then(async (response) => ({ status: response.status, body: await response.json().catch(() => null) }));

(async () => {
  const token = await signIn();
  console.log('signed in as staff');

  const category = await rpc(token, 'save_question_category', {
    p_school_id: school, p_category_id: null, p_subject_id: null,
    p_name: 'ตรวจระบบคลังข้อสอบ', p_description: 'สร้างโดยการทดสอบ'
  });
  console.log('create category      ', category.status, String(category.body).slice(0, 40));
  const categoryId = category.status < 400 ? category.body : null;

  const saved = await rpc(token, 'save_bank_question', {
    p_school_id: school, p_question_id: null,
    p_payload: {
      categoryId, difficulty: 'easy', questionType: 'multiple_choice',
      prompt: 'ทดสอบระบบ: ดาวเคราะห์ดวงใดอยู่ใกล้ดวงอาทิตย์ที่สุด',
      choices: [{ id: 'a', text: 'ดาวพุธ' }, { id: 'b', text: 'ดาวศุกร์' }],
      answerKey: ['a'], explanation: 'ดาวพุธ', points: 1, tags: ['probe'], status: 'active'
    }
  });
  console.log('create question      ', saved.status, String(saved.body).slice(0, 40));
  const questionId = saved.status < 400 ? saved.body : null;

  const listed = await select(token, `question_bank?select=id,prompt,category_id&school_id=eq.${school}`);
  console.log('staff list           ', listed.status,
    Array.isArray(listed.body) ? `${listed.body.length} question(s)` : JSON.stringify(listed.body).slice(0, 120));

  const searched = await select(token,
    `question_bank?select=id&school_id=eq.${school}&prompt=ilike.*ดาวเคราะห์*`);
  console.log('keyword search       ', searched.status,
    Array.isArray(searched.body) ? `${searched.body.length} match(es)` : '');

  const categories = await select(token, `question_categories?select=id,name,position,status&school_id=eq.${school}`);
  console.log('staff categories     ', categories.status,
    Array.isArray(categories.body) ? `${categories.body.length} category(ies)` : '');

  // Nobody at all: the anon key with no session.
  const strangerBank = await select(anon, 'question_bank?select=id&limit=1');
  const strangerCategories = await select(anon, 'question_categories?select=id&limit=1');
  console.log('anon reads bank      ', strangerBank.status, strangerBank.body?.message ?? '');
  console.log('anon reads categories', strangerCategories.status, strangerCategories.body?.message ?? '');

  if (questionId) {
    await rpc(token, 'archive_bank_question', { p_question_id: questionId });
    console.log('archived probe question');
  }
  if (categoryId) {
    await rpc(token, 'set_question_category_status', { p_category_id: categoryId, p_status: 'archived' });
    console.log('archived probe category');
  }
})().catch((reason) => { console.error('probe failed:', reason.message); process.exit(1); });
