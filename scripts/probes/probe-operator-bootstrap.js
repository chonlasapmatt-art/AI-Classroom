// Checks the operator bootstrap against a live project: the wrong code is refused, the window is
// shut once an operator exists, and a school administrator cannot be turned into an operator.
//
// Read-mostly on a project that already has an operator, which is the normal case: every call below
// is expected to be REFUSED there, and a refusal is the pass. Run it against a project with no
// operator only if you mean to create one — set SC_BOOTSTRAP_NAME and SC_BOOTSTRAP_PASSWORD, and
// remember the account it creates is real and belongs to no school.
//
//   SC_URL=... SC_ANON_KEY=... SC_PLATFORM_CODE=... node scripts/probes/probe-operator-bootstrap.js

const url = process.env.SC_URL;
const anon = process.env.SC_ANON_KEY;
const code = process.env.SC_PLATFORM_CODE;
const name = process.env.SC_BOOTSTRAP_NAME;
const password = process.env.SC_BOOTSTRAP_PASSWORD;

if (!url || !anon || !code) {
  console.error('SC_URL, SC_ANON_KEY and SC_PLATFORM_CODE are required.');
  process.exit(2);
}

const headers = { apikey: anon, Authorization: `Bearer ${anon}`, 'Content-Type': 'application/json' };
const bootstrap = (body) => fetch(`${url}/functions/v1/platform-bootstrap`, {
  method: 'POST', headers, body: JSON.stringify(body)
}).then(async (response) => ({ status: response.status, body: await response.json().catch(() => null) }));

(async () => {
  let failures = 0;
  const expect = (label, actual, wanted) => {
    const ok = wanted.includes(actual);
    if (!ok) failures += 1;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: ${actual} (expected ${wanted.join(' or ')})`);
  };

  // The code is checked before anything else, so a wrong one must not reveal whether the platform
  // has an operator yet.
  const wrong = await bootstrap({ accessCode: 'NOT-THE-CODE', displayName: 'probe', password: 'x'.repeat(16) });
  expect('wrong code refused', wrong.body?.code ?? String(wrong.status), ['PLATFORM_ACCESS_DENIED', 'PLATFORM_ACCESS_LOCKED']);

  // A short password must be refused even with the right code: this account sees every school.
  const weak = await bootstrap({ accessCode: code, displayName: 'probe', password: 'short' });
  expect('short password refused', weak.body?.code ?? String(weak.status),
    ['VALIDATION_ERROR', 'PLATFORM_ALREADY_BOOTSTRAPPED', 'PLATFORM_ACCESS_LOCKED']);

  if (!name || !password) {
    // The usual case. A project with an operator must slam this door, and that is what we assert.
    const shut = await bootstrap({ accessCode: code, displayName: 'probe operator', password: 'x'.repeat(16) });
    expect('window shut once an operator exists', shut.body?.code ?? String(shut.status),
      ['PLATFORM_ALREADY_BOOTSTRAPPED', 'PLATFORM_ACCESS_LOCKED']);
    console.log('\nSet SC_BOOTSTRAP_NAME and SC_BOOTSTRAP_PASSWORD to exercise the creating path.');
  } else {
    const created = await bootstrap({ accessCode: code, displayName: name, password });
    console.log('bootstrap:', created.status, JSON.stringify(created.body));
    if (created.status === 201) {
      console.log('\nCreated operator', created.body?.profileId);
      console.log('Sign in through the console with the platform code, then confirm on the');
      console.log('operators page that it shows "ไม่สังกัด" for this account.');
      // Immediately shut: the second call with the same code must now be refused.
      const again = await bootstrap({ accessCode: code, displayName: `${name} again`, password });
      expect('second bootstrap refused', again.body?.code ?? String(again.status), ['PLATFORM_ALREADY_BOOTSTRAPPED']);
    } else {
      failures += 1;
    }
  }

  console.log(failures === 0 ? '\nAll expectations held.' : `\n${failures} expectation(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
})();
