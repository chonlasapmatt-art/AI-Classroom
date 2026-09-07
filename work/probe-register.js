// Walks the teacher registration screen's own calls against the deployed gateway, in order, so a
// failure says which step failed rather than "it does not work".
//
// The last step creates a real account, which is why it is only run when SC_PROBE_REGISTER is set.

const url = process.env.SC_URL;
const anon = process.env.SC_ANON_KEY;
const headers = { apikey: anon, Authorization: `Bearer ${anon}`, 'Content-Type': 'application/json' };

const gateway = async (body) => {
  const response = await fetch(`${url}/functions/v1/member-access`, {
    method: 'POST', headers, body: JSON.stringify(body)
  });
  return { status: response.status, body: await response.json().catch(() => null) };
};

(async () => {
  console.log('1. school search — what the screen offers to pick from');
  for (const query of ['บ้าน', 'ไทเกอร์', 'บ้านไทเกอร์', 'SC-01']) {
    const { status, body } = await gateway({ action: 'schools', query });
    const found = (body?.schools ?? []).map((s) => `${s.name}`).join(', ') || '(none)';
    console.log(`   "${query}"`.padEnd(20), status, found);
  }

  if (!process.env.SC_PROBE_REGISTER) {
    console.log('\nset SC_PROBE_REGISTER=1 to also attempt a real registration');
    return;
  }

  console.log('\n2. registration attempts');
  const school = process.env.SC_SCHOOL_ID;
  const stamp = Date.now();
  const attempts = [
    ['valid code', { accessCode: 'SC-001' }],
    ['wrong code', { accessCode: 'SC-999' }],
    ['no code', { accessCode: '' }]
  ];
  for (const [label, extra] of attempts) {
    const { status, body } = await gateway({
      action: 'register-teacher',
      firstName: 'ทดสอบ', lastName: `ระบบ${stamp}`,
      schoolId: school,
      recoveryEmail: `probe.${stamp}@example.invalid`,
      password: 'ProbePassword123',
      ...extra
    });
    const outcome = body?.session ? 'REGISTERED' : (body?.code ?? 'unknown');
    console.log(`   ${label}`.padEnd(20), status, outcome);
    if (body?.session) console.log('     created profileId:', body?.member?.profileId);
  }
})();
