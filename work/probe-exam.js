// Sits a real exam end to end: a teacher composes and schedules it, a student starts it, reads a
// paper with no answer key, answers, refreshes, and submits. Then the same student is refused a
// second attempt.

const url = process.env.SC_URL;
const anon = process.env.SC_ANON_KEY;
const service = process.env.SC_SERVICE_KEY;
const school = process.env.SC_SCHOOL_ID;

const headers = (token) => ({
  apikey: anon, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json'
});
const serviceHeaders = { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' };

const call = (fn, token, args) => fetch(`${url}/rest/v1/rpc/${fn}`, {
  method: 'POST', headers: headers(token), body: JSON.stringify(args ?? {})
}).then(async (response) => ({ status: response.status, body: await response.json().catch(() => null) }));

async function teacherToken() {
  const response = await fetch(`${url}/functions/v1/member-access`, {
    method: 'POST', headers: headers(anon),
    body: JSON.stringify({
      action: 'login', role: 'teacher',
      displayName: process.env.SC_LOGIN_NAME, password: process.env.SC_LOGIN_PASSWORD
    })
  });
  const body = await response.json().catch(() => null);
  if (!body?.session) throw new Error(`teacher sign-in failed: ${JSON.stringify(body)}`);
  return body.session.accessToken;
}

async function studentToken() {
  const response = await fetch(`${url}/functions/v1/student-access`, {
    method: 'POST', headers: headers(anon),
    body: JSON.stringify({
      action: 'login', displayName: process.env.SC_STUDENT_NAME,
      studentCode: process.env.SC_STUDENT_CODE, schoolId: school
    })
  });
  const body = await response.json().catch(() => null);
  if (!body?.session) throw new Error(`student sign-in failed: ${JSON.stringify(body)}`);
  return body.session.accessToken;
}

const line = (label, value) => console.log(`  ${label}`.padEnd(34), value);

(async () => {
  const teacher = await teacherToken();

  const bank = await fetch(
    `${url}/rest/v1/question_bank?select=id,answer_key&school_id=eq.${school}&status=eq.active&limit=2`,
    { headers: headers(teacher) }
  ).then((response) => response.json());
  const classes = await fetch(
    `${url}/rest/v1/classes?select=id&school_id=eq.${school}&limit=1`, { headers: headers(teacher) }
  ).then((response) => response.json());
  if (!bank?.length || !classes?.length) throw new Error('fixture missing');

  // The exam row itself is an ordinary synced record, so it is created with the service key rather
  // than by replaying the whole offline mutation path here.
  const created = await fetch(`${url}/rest/v1/tests`, {
    method: 'POST', headers: { ...serviceHeaders, Prefer: 'return=representation' },
    body: JSON.stringify({
      school_id: school, class_id: classes[0].id, title: '[exam-probe] ตรวจระบบข้อสอบ',
      test_date: new Date().toISOString().slice(0, 10), max_score: 10, status: 'draft'
    })
  }).then((response) => response.json());
  const testId = created?.[0]?.id;
  if (!testId) throw new Error(`could not create exam: ${JSON.stringify(created)}`);
  line('create exam', testId);

  const composed = await call('compose_exam', teacher, {
    p_test_id: testId, p_question_ids: bank.map((question) => question.id)
  });
  line('compose', `${composed.status} ${composed.body} question(s) copied`);

  const scheduled = await call('schedule_exam', teacher, {
    p_test_id: testId, p_opens_at: new Date(Date.now() - 60_000).toISOString(),
    p_closes_at: new Date(Date.now() + 3_600_000).toISOString(),
    p_duration_minutes: 30, p_attempt_limit: 1, p_status: 'published'
  });
  line('schedule', `${scheduled.status} state=${scheduled.body?.state}`);

  const student = await studentToken();
  const access = await call('exam_access', student, { p_test_id: testId });
  line('student sees it open', `${access.status} state=${access.body?.state} canStart=${access.body?.canStart}`);

  const started = await call('start_exam_attempt', student, { p_test_id: testId });
  const attemptId = started.body?.attemptId;
  line('start attempt', `${started.status} resumed=${started.body?.resumed}`);

  const resumed = await call('start_exam_attempt', student, { p_test_id: testId });
  line('start again resumes', `${resumed.status} resumed=${resumed.body?.resumed} same=${resumed.body?.attemptId === attemptId}`);

  const paper = await call('take_exam', student, { p_attempt_id: attemptId });
  const keys = Object.keys(paper.body?.questions?.[0] ?? {});
  line('paper has no key', `${paper.status} keys=${keys.join(',')}`);

  const answers = {};
  for (const question of paper.body?.questions ?? []) {
    const source = bank.find((item) => item.answer_key);
    answers[question.id] = source?.answer_key ?? ['a'];
  }
  const draft = await call('submit_exam_attempt', student, {
    p_attempt_id: attemptId, p_answers: answers, p_final: false
  });
  line('save without submitting', `${draft.status} submittedAt=${draft.body?.submittedAt}`);

  const final = await call('submit_exam_attempt', student, {
    p_attempt_id: attemptId, p_answers: answers, p_final: true
  });
  line('submit', `${final.status} reason=${final.body?.reason} autoScore=${final.body?.autoScore}`);

  const again = await call('submit_exam_attempt', student, {
    p_attempt_id: attemptId, p_answers: {}, p_final: true
  });
  line('submit twice', `${again.status} alreadySubmitted=${again.body?.alreadySubmitted}`);

  const second = await call('start_exam_attempt', student, { p_test_id: testId });
  line('second attempt refused', `${second.status} ${String(second.body?.message ?? '').split(' ')[0]}`);

  const composeAfter = await call('compose_exam', teacher, {
    p_test_id: testId, p_question_ids: [bank[0].id]
  });
  line('edit paper after sitting', `${composeAfter.status} ${String(composeAfter.body?.message ?? '').split(' ')[0]}`);

  console.log('\nprobe test id:', testId);
})().catch((reason) => { console.error('probe failed:', reason.message); process.exit(1); });
