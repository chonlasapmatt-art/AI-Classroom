// Removes the throwaway teacher the registration probe created, and hands back the use of the
// school's code that it consumed. Leaving either behind would put a fake teacher on a real roster.

const url = process.env.SC_URL;
const key = process.env.SC_SERVICE_KEY;
const profileId = process.env.SC_PROBE_PROFILE_ID;
const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

const del = async (path) => {
  const response = await fetch(`${url}/rest/v1/${path}`, {
    method: 'DELETE', headers: { ...headers, Prefer: 'return=representation' }
  });
  const rows = await response.json().catch(() => null);
  return `${response.status} ${Array.isArray(rows) ? rows.length : 0} row(s)`;
};

(async () => {
  if (!profileId) { console.error('no probe profile id'); process.exit(1); }

  console.log('school_memberships ', await del(`school_memberships?profile_id=eq.${profileId}`));
  console.log('teacher_code_uses  ', await del(`teacher_access_code_uses?profile_id=eq.${profileId}`));
  console.log('teachers           ', await del(`teachers?profile_id=eq.${profileId}`));
  console.log('login identity     ', await del(`member_login_identities?profile_id=eq.${profileId}`));
  console.log('account events     ', await del(`member_account_events?profile_id=eq.${profileId}`));

  const authResponse = await fetch(`${url}/auth/v1/admin/users/${profileId}`, { method: 'DELETE', headers });
  console.log('auth user          ', authResponse.status);

  // The probe claimed one use of the school's code. Give it back.
  const codes = await fetch(`${url}/rest/v1/teacher_access_codes?select=id,use_count&status=eq.active`, { headers })
    .then((response) => response.json());
  for (const code of codes ?? []) {
    if ((code.use_count ?? 0) > 0) {
      await fetch(`${url}/rest/v1/rpc/release_teacher_access_code`, {
        method: 'POST', headers, body: JSON.stringify({ p_code_id: code.id })
      });
      console.log('released one use of the active code');
    }
  }
})();
