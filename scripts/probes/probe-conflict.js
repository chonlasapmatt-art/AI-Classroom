// Manufactures a real conflict and resolves it both ways.
//
// A conflict is a row the server writes when a device pushes against a version it has already moved
// past, so one is created here directly rather than by racing two devices — what is being checked is
// the resolution, and whether reapplying goes through the ordinary mutation path.

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

const rest = (path, init = {}) => fetch(`${url}/rest/v1/${path}`, {
  ...init, headers: { ...serviceHeaders, ...(init.headers ?? {}) }
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
  if (!body?.session) throw new Error('teacher sign-in failed');
  return body.session.accessToken;
}

const line = (label, value) => console.log(`  ${label}`.padEnd(34), value);

(async () => {
  const teacher = await teacherToken();

  const students = await rest(`students?select=id,display_name,version&school_id=eq.${school}&limit=1`);
  const devices = await rest(`devices?select=id&school_id=eq.${school}&limit=1`);
  const student = students.body?.[0];
  const deviceId = devices.body?.[0]?.id;
  if (!student || !deviceId) throw new Error('need a student and a registered device');

  const conflicts = [];
  for (const which of ['server', 'mine']) {
    const created = await rest('sync_conflicts', {
      method: 'POST', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        school_id: school, device_id: deviceId, entity_type: 'student', entity_id: student.id,
        base_version: student.version, server_version: student.version,
        client_payload: {
          id: student.id, schoolId: school, studentCode: '00002',
          displayName: `[conflict-probe-${which}] ${student.display_name}`, avatarIndex: 0
        },
        server_payload: { id: student.id, displayName: student.display_name, avatarIndex: 0 },
        status: 'needs_review'
      })
    });
    conflicts.push({ which, id: created.body?.[0]?.id });
  }
  line('conflicts created', conflicts.map((entry) => entry.which).join(', '));

  const open = await call('open_sync_conflicts', teacher, { p_school_id: school, p_limit: 20 });
  line('teacher sees them', `${open.status} ${open.body?.length ?? 0} open`);

  const keepServer = await call('resolve_sync_conflict', teacher, {
    p_conflict_id: conflicts[0].id, p_choice: 'server', p_reason: 'ตรวจระบบ: เก็บของเซิร์ฟเวอร์'
  });
  line('resolve as server', `${keepServer.status} resolution=${keepServer.body?.resolution}`);

  const nameAfterServer = await rest(`students?select=display_name&id=eq.${student.id}`);
  line('record unchanged', nameAfterServer.body?.[0]?.display_name === student.display_name ? 'yes' : 'NO');

  const keepMine = await call('resolve_sync_conflict', teacher, {
    p_conflict_id: conflicts[1].id, p_choice: 'mine', p_reason: 'ตรวจระบบ: เอาของเครื่อง'
  });
  line('resolve as mine', `${keepMine.status} applied=${keepMine.body?.applied ? 'yes' : 'no'}`);

  const after = await rest(`students?select=display_name,version&id=eq.${student.id}`);
  line('record reapplied', `${after.body?.[0]?.display_name} (version ${after.body?.[0]?.version})`);

  const twice = await call('resolve_sync_conflict', teacher, {
    p_conflict_id: conflicts[1].id, p_choice: 'mine', p_reason: 'กดซ้ำ'
  });
  line('resolve twice', `${twice.status} alreadyResolved=${twice.body?.alreadyResolved}`);

  const remaining = await call('open_sync_conflicts', teacher, { p_school_id: school });
  line('open conflicts left', remaining.body?.length ?? 0);

  const audit = await rest(`audit_log?select=action,metadata_json&action=eq.SYNC_CONFLICT_RESOLVED&order=occurred_at.desc&limit=2`);
  line('audit', JSON.stringify((audit.body ?? []).map((row) => row.metadata_json?.choice)));

  // Put the name back and clear the probe rows.
  await rest(`students?id=eq.${student.id}`, {
    method: 'PATCH', body: JSON.stringify({ display_name: student.display_name })
  });
  await rest(`sync_conflicts?entity_id=eq.${student.id}`, { method: 'DELETE' });
  line('cleanup', 'name restored, probe conflicts removed');
})().catch((reason) => { console.error('probe failed:', reason.message); process.exit(1); });
