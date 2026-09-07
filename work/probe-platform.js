// Calls every operations-console read the way the console calls them: as the operator's own signed-in
// session, not as service_role. A read that works with the service key and fails in the browser is
// exactly the failure worth finding, so the session is obtained through the ordinary gateway.

const url = process.env.SC_URL;
const anon = process.env.SC_ANON_KEY;
const service = process.env.SC_SERVICE_KEY;
const displayName = process.env.SC_LOGIN_NAME;
const password = process.env.SC_LOGIN_PASSWORD;

const anonHeaders = { apikey: anon, 'Content-Type': 'application/json' };
const serviceHeaders = { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' };

async function signIn() {
  const response = await fetch(`${url}/functions/v1/member-access`, {
    method: 'POST',
    headers: { ...anonHeaders, Authorization: `Bearer ${anon}` },
    body: JSON.stringify({ action: 'login', role: 'teacher', displayName, password })
  });
  const body = await response.json().catch(() => null);
  if (!body?.session) throw new Error(`sign-in failed: ${response.status} ${JSON.stringify(body)}`);
  return { token: body.session.accessToken, profileId: body.member?.profileId };
}

const rpcAs = (token, fn, body = {}) => fetch(`${url}/rest/v1/rpc/${fn}`, {
  method: 'POST',
  headers: { ...anonHeaders, Authorization: `Bearer ${token}` },
  body: JSON.stringify(body)
}).then(async (response) => ({ status: response.status, body: await response.json().catch(() => null) }));

(async () => {
  const { token, profileId } = await signIn();
  console.log('signed in as', displayName, profileId);

  const me = await rpcAs(token, 'is_platform_admin');
  console.log('is_platform_admin:', me.status, JSON.stringify(me.body));

  if (me.body !== true) {
    console.log('\ngranting platform authority (service_role, bootstrap path)');
    const granted = await fetch(`${url}/rest/v1/rpc/grant_platform_admin`, {
      method: 'POST', headers: serviceHeaders,
      body: JSON.stringify({
        p_actor: profileId, p_profile_id: profileId,
        p_display_name: displayName, p_notes: 'bootstrapped while diagnosing the console'
      })
    });
    console.log('grant:', granted.status, (await granted.text()).slice(0, 160));
  }

  console.log('\nconsole reads, as the operator:');
  for (const [fn, args] of [
    ['platform_overview', {}],
    ['platform_schools', {}],
    ['platform_devices', { p_school_id: null, p_limit: 50 }],
    ['platform_errors', { p_school_id: null, p_severity: null, p_since: '7 days', p_limit: 50 }],
    ['platform_security_log', { p_limit: 20 }],
    ['platform_flags_and_releases', {}],
    ['current_support_session', {}]
  ]) {
    const { status, body } = await rpcAs(token, fn, args);
    const summary = status >= 400
      ? `FAILED ${JSON.stringify(body).slice(0, 220)}`
      : (Array.isArray(body) ? `${body.length} row(s)` : 'ok');
    console.log(`  ${fn}`.padEnd(34), status, summary);
  }

  const schools = await rpcAs(token, 'platform_schools');
  if (Array.isArray(schools.body) && schools.body.length > 0) {
    const first = schools.body[0];
    console.log('\n  first school:', first.name, '| health:', first.health?.status);
    const detail = await rpcAs(token, 'platform_school_detail', { p_school_id: first.schoolId });
    console.log('  platform_school_detail'.padEnd(34), detail.status,
      detail.status >= 400 ? `FAILED ${JSON.stringify(detail.body).slice(0, 300)}` : 'ok');
  }
})().catch((reason) => { console.error('probe failed:', reason.message); process.exit(1); });
