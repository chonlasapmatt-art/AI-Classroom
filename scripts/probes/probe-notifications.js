// Proves that a queued parent notification actually leaves the building.
//
// This is the probe for the gap that mattered most: the outbox, the preferences and the delivery log
// all existed and were all written to, the console showed a queue, and nothing read it. Every gate
// was green while a school believed a parent had been told something that was never sent.
//
// A green suite cannot catch that, because the failure is a deployment that never scheduled a
// function rather than code that is wrong. So this probe drives the real endpoint with the real
// secret and reads the real queue afterwards.
//
// It enqueues its own message rather than waiting for a school to generate one, and removes both the
// outbox row and the log row when it is done.
//
//   $env:SC_URL, SC_ANON_KEY, SC_SERVICE_KEY, SC_SCHOOL_ID
//   $env:SC_DISPATCH_SECRET  = the NOTIFICATION_DISPATCH_SECRET set on the server
//
// A school with no LINE-linked parent is the ordinary case on a fresh project. The probe says so and
// still checks everything except delivery itself, which is the part LINE owns.

const url = process.env.SC_URL;
const anon = process.env.SC_ANON_KEY;
const service = process.env.SC_SERVICE_KEY;
const school = process.env.SC_SCHOOL_ID;
const dispatchSecret = process.env.SC_DISPATCH_SECRET;

for (const [name, value] of Object.entries({ SC_URL: url, SC_ANON_KEY: anon, SC_SERVICE_KEY: service, SC_SCHOOL_ID: school })) {
  if (!value) throw new Error(`${name} is not set`);
}

const serviceHeaders = { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' };

const rest = (path, init = {}) => fetch(`${url}/rest/v1/${path}`, {
  ...init, headers: { ...serviceHeaders, ...(init.headers ?? {}) }
}).then(async (response) => ({ status: response.status, body: await response.json().catch(() => null) }));

const rpc = (fn, args) => fetch(`${url}/rest/v1/rpc/${fn}`, {
  method: 'POST', headers: serviceHeaders, body: JSON.stringify(args ?? {})
}).then(async (response) => ({ status: response.status, body: await response.json().catch(() => null) }));

const dispatch = (secret, body = { limit: 5 }) => fetch(`${url}/functions/v1/notification-dispatch`, {
  method: 'POST',
  headers: { apikey: anon, 'Content-Type': 'application/json', 'x-notification-dispatch-secret': secret ?? '' },
  body: JSON.stringify(body)
}).then(async (response) => ({ status: response.status, body: await response.json().catch(() => null) }));

const line = (label, value) => console.log(`  ${label}`.padEnd(36), value);

(async () => {
  // 1. The endpoint refuses a caller without the secret. Checked first, because an endpoint that
  //    answers anybody is a way for a stranger to drain somebody else's queue.
  const noSecret = await dispatch('');
  line('no secret refused', `${noSecret.status} ${noSecret.body?.code ?? ''}`);
  if (noSecret.status !== 401) throw new Error('dispatcher answered a caller with no secret');

  const wrongSecret = await dispatch('x'.repeat(48));
  line('wrong secret refused', `${wrongSecret.status} ${wrongSecret.body?.code ?? ''}`);
  if (wrongSecret.status !== 401) throw new Error('dispatcher answered a caller with the wrong secret');

  if (!dispatchSecret) {
    line('SC_DISPATCH_SECRET', 'not set — stopping after the refusal checks');
    return;
  }

  // 2. A parent with a LINE link is what delivery needs. Without one the queue still works and the
  //    dispatcher still runs; the message is completed as NO_LINE_LINK rather than sent.
  const parents = await rest(`parents?select=id,line_user_id&school_id=eq.${school}&status=eq.active&limit=1`);
  const parent = parents.body?.[0];
  if (!parent) throw new Error('this school has no active parent to address');
  line('parent has LINE link', parent.line_user_id ? 'yes' : 'no (delivery will report NO_LINE_LINK)');

  const students = await rest(`students?select=id&school_id=eq.${school}&limit=1`);
  const student = students.body?.[0];
  if (!student) throw new Error('this school has no student');

  // 3. Enqueue one message of our own, through the same table the triggers write to.
  const marker = `probe-${Date.now()}`;
  const queued = await rest('notification_outbox', {
    method: 'POST', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      school_id: school, event_type: 'assignment_new', parent_id: parent.id, student_id: student.id,
      payload_json: { title: 'ตรวจระบบแจ้งเตือน', body: 'ข้อความทดสอบจาก probe — ไม่ต้องดำเนินการ' },
      idempotency_key: marker
    })
  });
  const queuedId = queued.body?.[0]?.id;
  if (!queuedId) throw new Error(`could not enqueue: ${JSON.stringify(queued.body)}`);
  line('message queued', queuedId);

  // 4. Drive the dispatcher the way a scheduler would.
  const run = await dispatch(dispatchSecret, { limit: 5 });
  line('dispatcher answered', `${run.status} accepted=${run.body?.accepted} sent=${run.body?.sent} retried=${run.body?.retried} dead=${run.body?.deadLettered}`);
  if (run.status !== 200) throw new Error('dispatcher refused a correct secret');
  if ((run.body?.accepted ?? 0) < 1) throw new Error('dispatcher claimed nothing while a message was pending');

  // 5. The row moved out of pending, and the delivery log says what happened to it. Either outcome
  //    is a pass here: what is being checked is that the queue is read and answered, not that LINE
  //    accepted a message on a project that may have no channel configured.
  const after = await rest(`notification_outbox?select=status,retry_count,processed_at&id=eq.${queuedId}`);
  const row = after.body?.[0];
  line('message status now', `${row?.status} (retry ${row?.retry_count})`);
  if (row?.status === 'pending') throw new Error('the message is still pending after a dispatcher run');

  const log = await rest(`notifications_log?select=status,error_code,provider_message_id&parent_id=eq.${parent.id}&order=created_at.desc&limit=1`);
  line('delivery log', `${log.body?.[0]?.status ?? '—'} ${log.body?.[0]?.error_code ?? log.body?.[0]?.provider_message_id ?? ''}`);

  // 6. The run was recorded, which is what makes a stopped scheduler visible instead of silent.
  const runs = await rest('notification_dispatch_runs?select=ran_at,claimed,sent,error_code&order=ran_at.desc&limit=1');
  const lastRun = runs.body?.[0];
  line('run recorded', lastRun ? `${lastRun.ran_at} claimed=${lastRun.claimed} sent=${lastRun.sent}` : 'NO — health will report a dead sender');
  if (!lastRun) throw new Error('the dispatcher ran and left no record of it');

  const health = await rpc('notification_dispatch_health');
  // Called with the service key, this refuses: the function asks `is_platform_admin(auth.uid())` and
  // the service role has no session. That refusal is the correct answer and worth seeing.
  line('health as service role', `${health.status} (403/400 expected — it is an operator read)`);

  // 7. Clean up. Probes write into a real school and take their rows back out.
  await rest(`notification_outbox?id=eq.${queuedId}`, { method: 'DELETE' });
  await rest(`notifications_log?parent_id=eq.${parent.id}&type=eq.assignment_new&order=created_at.desc&limit=1`, { method: 'DELETE' });
  const leftover = await rest(`notification_outbox?select=id&idempotency_key=eq.${marker}`);
  line('cleanup', (leftover.body ?? []).length === 0 ? 'probe rows removed' : 'ROWS LEFT BEHIND');
})().catch((reason) => { console.error('probe failed:', reason.message); process.exit(1); });
