// Checks the development sign-in end to end: the wrong code is refused, the right one hands back a
// session, and that session really is an operator's.

const url = process.env.SC_URL;
const anon = process.env.SC_ANON_KEY;
const code = process.env.SC_PLATFORM_CODE;
const headers = { apikey: anon, Authorization: `Bearer ${anon}`, 'Content-Type': 'application/json' };

const call = (accessCode) => fetch(`${url}/functions/v1/platform-dev-access`, {
  method: 'POST', headers, body: JSON.stringify({ accessCode })
}).then(async (response) => ({ status: response.status, body: await response.json().catch(() => null) }));

(async () => {
  const wrong = await call('NOT-THE-CODE');
  console.log('wrong code   ', wrong.status, wrong.body?.code ?? '');

  const right = await call(code);
  console.log('correct code ', right.status, right.body?.session ? 'session returned' : right.body?.code);
  if (!right.body?.session) process.exit(1);

  const token = right.body.session.accessToken;
  const check = await fetch(`${url}/rest/v1/rpc/is_platform_admin`, {
    method: 'POST',
    headers: { apikey: anon, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: '{}'
  });
  console.log('is_platform_admin with that session:', check.status, await check.text());

  const schools = await fetch(`${url}/rest/v1/rpc/platform_schools`, {
    method: 'POST',
    headers: { apikey: anon, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: '{}'
  });
  const rows = await schools.json().catch(() => null);
  console.log('platform_schools with that session:', schools.status,
    Array.isArray(rows) ? `${rows.length} school(s)` : JSON.stringify(rows).slice(0, 160));
})();
