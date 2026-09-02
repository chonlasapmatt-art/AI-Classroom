// Runs a whole round against the real database: a teacher opens it, a student joins and answers,
// the same answer is sent twice, a late answer is refused, and the bonus lands in the score ledger.
//
// Two sessions are used, because the properties being checked are about who is allowed to see what.
// The teacher signs in by name and password; the student by name and student number, through the
// same passwordless entrance a child uses.

const url = process.env.SC_URL;
const anon = process.env.SC_ANON_KEY;
const school = process.env.SC_SCHOOL_ID;

const headers = (token) => ({
  apikey: anon, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json'
});

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

async function studentToken(displayName, studentCode) {
  const response = await fetch(`${url}/functions/v1/student-access`, {
    method: 'POST', headers: headers(anon),
    body: JSON.stringify({ action: 'login', displayName, studentCode, schoolId: school })
  });
  const body = await response.json().catch(() => null);
  if (!body?.session) throw new Error(`student sign-in failed: ${response.status} ${JSON.stringify(body)}`);
  return body.session.accessToken;
}

const line = (label, value) => console.log(`  ${label}`.padEnd(34), value);

(async () => {
  const teacher = await teacherToken();
  console.log('teacher signed in');

  // A question to ask, and a class to ask it of.
  const bank = await fetch(
    `${url}/rest/v1/question_bank?select=id,prompt,answer_key,subject_id&school_id=eq.${school}&status=eq.active&limit=3`,
    { headers: headers(teacher) }
  ).then((response) => response.json());
  if (!Array.isArray(bank) || bank.length === 0) throw new Error('no active questions in the bank');
  // The round belongs to a subject — that is what lets its points become marks — and the questions
  // this teacher can see are the ones in subjects they own, so the bank names the subject.
  const subjectId = bank.find((question) => question.subject_id)?.subject_id ?? null;
  if (!subjectId) throw new Error('the questions this teacher can see carry no subject');

  const classes = await fetch(
    `${url}/rest/v1/classes?select=id,name&school_id=eq.${school}&limit=1`, { headers: headers(teacher) }
  ).then((response) => response.json());
  if (!Array.isArray(classes) || classes.length === 0) throw new Error('no classes');
  const classId = classes[0].id;

  const created = await call('create_quiz_session', teacher, {
    p_school_id: school, p_class_id: classId, p_subject_id: subjectId,
    p_title: 'ตรวจระบบ Quiz Challenge',
    p_question_ids: bank.map((question) => question.id),
    p_timer_seconds: 30, p_scoring_mode: 'accuracy', p_leaderboard_visible: true
  });
  line('create session', `${created.status} ${JSON.stringify(created.body)}`);
  const sessionId = created.body?.sessionId;
  if (!sessionId) throw new Error('no session');

  const student = await studentToken(process.env.SC_STUDENT_NAME, process.env.SC_STUDENT_CODE);
  console.log('student signed in');

  const waiting = await call('quiz_waiting_for_me', student);
  line('student sees the round', `${waiting.status} waiting=${waiting.body?.waiting}`);

  const joined = await call('join_quiz', student, { p_session_id: sessionId });
  line('student joins', joined.status);
  const rejoin = await call('join_quiz', student, { p_session_id: sessionId });
  line('joining twice', `${rejoin.status} same participant=${rejoin.body?.participantId === joined.body?.participantId}`);

  await call('control_quiz_session', teacher, { p_session_id: sessionId, p_command: 'start' });
  const board = await call('quiz_board', teacher, { p_session_id: sessionId });
  const questionId = board.body?.question?.id;
  line('board shows question 1', `${board.status} key=${JSON.stringify(board.body?.question?.answerKey)}`);

  const view = await call('quiz_view', student, { p_session_id: sessionId });
  line('student view has no key', `${view.status} keys=${Object.keys(view.body?.question ?? {}).join(',')}`);

  const correctAnswer = board.body?.question?.answerKey ?? [];
  const first = await call('submit_quiz_answer', student, {
    p_session_id: sessionId, p_question_id: questionId, p_selected: correctAnswer
  });
  line('student answers correctly', `${first.status} correct=${first.body?.isCorrect} awarded=${first.body?.awarded}`);

  const repeat = await call('submit_quiz_answer', student, {
    p_session_id: sessionId, p_question_id: questionId, p_selected: ['zzz']
  });
  line('same answer sent again', `${repeat.status} alreadyAnswered=${repeat.body?.alreadyAnswered} awarded=${repeat.body?.awarded}`);

  const afterBoard = await call('quiz_board', teacher, { p_session_id: sessionId });
  line('board counted it once', `answered=${afterBoard.body?.answered} score=${afterBoard.body?.leaderboard?.[0]?.score}`);

  // Advance twice, then answer the question that was up in between: unanswered, and no longer the
  // one on the board, which is the case the position check exists for.
  await call('control_quiz_session', teacher, { p_session_id: sessionId, p_command: 'next' });
  const second = await call('quiz_board', teacher, { p_session_id: sessionId });
  const skippedId = second.body?.question?.id;
  await call('control_quiz_session', teacher, { p_session_id: sessionId, p_command: 'next' });
  const stale = await call('submit_quiz_answer', student, {
    p_session_id: sessionId, p_question_id: skippedId, p_selected: correctAnswer
  });
  line('answering a closed question', `${stale.status} ${String(stale.body?.message ?? '').split(' ')[0]}`);

  await call('control_quiz_session', teacher, { p_session_id: sessionId, p_command: 'end' });
  const results = await call('quiz_results', teacher, { p_session_id: sessionId });
  const winner = results.body?.participants?.[0];
  line('results', `${results.status} ${results.body?.participants?.length ?? 0} participant(s)`);

  const awarded = await call('award_quiz_bonus', teacher, {
    p_session_id: sessionId,
    p_awards: winner ? [{ studentId: winner.studentId, points: 2 }] : [],
    p_reason: 'ตรวจระบบ'
  });
  line('award bonus', `${awarded.status} ${JSON.stringify(awarded.body)}`);

  const again = await call('award_quiz_bonus', teacher, {
    p_session_id: sessionId, p_awards: winner ? [{ studentId: winner.studentId, points: 2 }] : [],
    p_reason: 'ตรวจระบบซ้ำ'
  });
  line('award bonus twice', `${again.status} ${String(again.body?.message ?? '').split(' ')[0]}`);

  const events = await fetch(
    `${url}/rest/v1/score_events?select=points,category,source_type,reason&source_id=eq.${sessionId}`,
    { headers: headers(teacher) }
  ).then((response) => response.json());
  line('score ledger', JSON.stringify(events));

  console.log('\nprobe session id (left in place for cleanup):', sessionId);
})().catch((reason) => { console.error('probe failed:', reason.message); process.exit(1); });
