// Checks the production door against a live project: a name nobody has, a real name with the wrong
// password, and — when you supply real credentials — that the session it returns really is an
// operator's.
//
// Every refusal below must answer identically. A door that says "no such operator" for one and
// "wrong password" for the other tells anybody who asks which names exist.
//
//   SC_URL=... SC_ANON_KEY=... node scripts/probes/probe-platform-sign-in.js
//   ...plus SC_OPERATOR_NAME and SC_OPERATOR_PASSWORD to exercise the succeeding path.

const url = process.env.SC_URL;
const anon = process.env.SC_ANON_KEY;
const name = process.env.SC_OPERATOR_NAME;
const password = process.env.SC_OPERATOR_PASSWORD;

if (!url || !anon) {
  console.error('SC_URL and SC_ANON_KEY are required.');
  process.exit(2);
}

const headers = { apikey: anon, Authorization: `Bearer ${anon}`, 'Content-Type': 'application/json' };
const signIn = (body) => fetch(`${url}/functions/v1/platform-sign-in`, {
  method: 'POST', headers, body: JSON.stringify(body)
}).then(async (response) => ({ status: response.status, body: await response.json().catch(() => null) }));

(async () => {
  let failures = 0;
  const expect = (label, actual, wanted) => {
    const ok = wanted.includes(actual);
    if (!ok) failures += 1;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: ${actual} (expected ${wanted.join(' or ')})`);
  };

  const unknown = await signIn({ displayName: 'ไม่มีผู้ดูแลชื่อนี้แน่นอน', password: 'whatever' });
  expect('unknown name refused', unknown.body?.code ?? String(unknown.status),
    ['PLATFORM_ACCESS_DENIED', 'PLATFORM_ACCESS_LOCKED']);

  if (name) {
    const wrongPassword = await signIn({ displayName: name, password: 'definitely-not-the-password' });
    expect('real name, wrong password refused the same way', wrongPassword.body?.code ?? String(wrongPassword.status),
      ['PLATFORM_ACCESS_DENIED', 'PLATFORM_ACCESS_LOCKED']);
    if (unknown.body?.code && wrongPassword.body?.code && unknown.body.code !== wrongPassword.body.code) {
      failures += 1;
      console.log('FAIL  the two refusals differ, which says which names exist');
    } else {
      console.log('PASS  both refusals are identical');
    }
  }

  if (!name || !password) {
    console.log('\nSet SC_OPERATOR_NAME and SC_OPERATOR_PASSWORD to check the succeeding path.');
  } else {
    const ok = await signIn({ displayName: name, password });
    expect('correct credentials return a session', ok.body?.session ? 'session' : (ok.body?.code ?? String(ok.status)), ['session']);
    if (ok.body?.session) {
      const token = ok.body.session.accessToken;
      // The session has to be an operator's, not merely a valid one.
      const check = await fetch(`${url}/rest/v1/rpc/is_platform_admin`, {
        method: 'POST',
        headers: { apikey: anon, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: '{}'
      });
      const isOperator = (await check.text()).trim();
      expect('that session is an operator', isOperator, ['true']);
      console.log('\nCheck the security log: the sign-in should appear as PLATFORM_SIGN_IN');
      console.log('against this operator, and their last-seen time should have moved.');
    }
  }

  console.log(failures === 0 ? '\nAll expectations held.' : `\n${failures} expectation(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
})();
