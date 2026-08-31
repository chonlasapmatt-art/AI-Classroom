// Puts the minimum in place for the quiz probe and takes it out again.
//
// It writes into a real school, so everything it creates is tagged and removed by `down`: three
// bank questions, and an enrolment for one student if they were not already in the class. A probe
// that leaves a child enrolled in a class nobody put them in is worse than no probe.

const url = process.env.SC_URL;
const key = process.env.SC_SERVICE_KEY;
const school = process.env.SC_SCHOOL_ID;
const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

const rest = (path, init = {}) => fetch(`${url}/rest/v1/${path}`, {
  ...init, headers: { ...headers, ...(init.headers ?? {}) }
}).then(async (response) => ({ status: response.status, body: await response.json().catch(() => null) }));

const PROBE_TAG = 'quiz-probe';

async function up() {
  const term = await rest(`academic_terms?select=id&school_id=eq.${school}&limit=1`);
  const classroom = await rest(`classes?select=id&school_id=eq.${school}&limit=1`);
  const student = await rest(`students?select=id&school_id=eq.${school}&student_code=eq.${process.env.SC_STUDENT_CODE}`);
  const termId = term.body?.[0]?.id;
  const classId = classroom.body?.[0]?.id;
  const studentId = student.body?.[0]?.id;
  if (!termId || !classId || !studentId) throw new Error('school is missing a term, a class or the student');

  const questions = await rest('question_bank', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify([1, 2, 3].map((index) => ({
      school_id: school, difficulty: 'easy', question_type: 'multiple_choice',
      prompt: `[${PROBE_TAG}] คำถามทดสอบข้อที่ ${index}`,
      choices: [{ id: 'a', text: 'ถูก' }, { id: 'b', text: 'ผิด' }],
      answer_key: ['a'], points: 1, tags: [PROBE_TAG], status: 'active'
    })))
  });

  const existing = await rest(
    `student_class_enrollments?select=id&student_id=eq.${studentId}&class_id=eq.${classId}&status=eq.active`
  );
  let enrolmentId = existing.body?.[0]?.id ?? null;
  let enrolmentCreated = false;
  if (!enrolmentId) {
    const created = await rest('student_class_enrollments', {
      method: 'POST', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        school_id: school, student_id: studentId, class_id: classId,
        academic_term_id: termId, status: 'active'
      })
    });
    enrolmentId = created.body?.[0]?.id ?? null;
    enrolmentCreated = true;
    if (!enrolmentId) throw new Error(`could not enrol: ${JSON.stringify(created.body)}`);
  }

  console.log(JSON.stringify({
    questions: (questions.body ?? []).map((row) => row.id),
    classId, studentId, enrolmentId, enrolmentCreated
  }));
}

async function down() {
  const sessionId = process.env.SC_PROBE_SESSION_ID;
  if (sessionId) {
    // score_events first: they reference the session and are the only rows that would otherwise
    // linger on a child's record.
    await rest(`score_events?source_id=eq.${sessionId}`, { method: 'DELETE' });
    await rest(`quiz_sessions?id=eq.${sessionId}`, { method: 'DELETE' });
  }
  await rest(`question_bank?tags=cs.{${PROBE_TAG}}`, { method: 'DELETE' });
  if (process.env.SC_PROBE_ENROLMENT_CREATED === 'true' && process.env.SC_PROBE_ENROLMENT_ID) {
    await rest(`student_class_enrollments?id=eq.${process.env.SC_PROBE_ENROLMENT_ID}`, { method: 'DELETE' });
  }
  const left = await rest(`question_bank?select=id&tags=cs.{${PROBE_TAG}}`);
  console.log('probe questions remaining:', (left.body ?? []).length);
}

const command = process.argv[2];
(command === 'down' ? down() : up()).catch((reason) => {
  console.error('fixture failed:', reason.message);
  process.exit(1);
});
