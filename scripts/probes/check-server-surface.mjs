/**
 * Asks one Supabase project which parts of this repository it is actually running.
 *
 * Two different screens failing to create anything usually means one thing: the project is behind
 * the migrations and Edge Functions in this checkout. This probe says so in one page instead of a
 * screen-by-screen hunt. It reads nothing and writes nothing — every call is made with the browser
 * key and no session, so a function that exists answers "permission denied" and a function that was
 * never deployed answers "not found". That difference is the whole report.
 *
 * Usage:
 *   node scripts/probes/check-server-surface.mjs
 *   node scripts/probes/check-server-surface.mjs <supabase-url> <anon-key>
 *
 * With no arguments it reads VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from the environment,
 * then from apps/web/.env.local.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(here, '..', '..');

/** The functions the classroom, roster and provisioning screens call. */
const RPCS = [
  'upsert_class', 'set_class_capacity', 'archive_class', 'restore_class', 'delete_class',
  'can_manage_classes', 'search_school_students', 'invite_student_to_class',
  'upsert_teacher', 'upsert_subject', 'sync_pull', 'register_device',
  'platform_overview', 'is_platform_admin', 'platform_reauth_fresh', 'provision_school_admin',
  'find_auth_user_by_email', 'platform_operator_has_mfa', 'record_platform_reauth'
];

/** The Edge Functions the sign-in and provisioning paths go through. */
const EDGE_FUNCTIONS = [
  'platform-access', 'platform-sign-in', 'platform-bootstrap', 'member-access', 'admin-account',
  'teacher-account', 'teacher-code', 'student-access', 'account-onboarding', 'parent-link',
  'member-invitation', 'first-school-setup', 'sync-push', 'notification-dispatch'
];

function readEnvFile(path) {
  try {
    const values = {};
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
      if (!match) continue;
      values[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
    }
    return values;
  } catch { return {}; }
}

function resolveConfig() {
  const [urlArgument, keyArgument] = process.argv.slice(2);
  const fromFile = readEnvFile(join(repositoryRoot, 'apps', 'web', '.env.local'));
  const url = (urlArgument || process.env.VITE_SUPABASE_URL || fromFile.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
  const key = keyArgument || process.env.VITE_SUPABASE_ANON_KEY || fromFile.VITE_SUPABASE_ANON_KEY || '';
  return { url, key };
}

async function probeRpc(url, key, name) {
  const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: '{}'
  });
  const body = await response.text();
  if (response.status === 404 && body.includes('PGRST202')) return { state: 'missing', detail: 'ยังไม่มีฟังก์ชันนี้ในฐานข้อมูล' };
  if (response.status === 401 && body.includes('Invalid API key')) return { state: 'unknown', detail: 'anon key ไม่ถูกต้อง' };
  if (response.status === 401 || response.status === 403) return { state: 'present', detail: 'มีอยู่ (ปฏิเสธ anon ตามที่ควรเป็น)' };
  return { state: 'present', detail: `HTTP ${response.status}` };
}

async function probeEdgeFunction(url, key, name) {
  const response = await fetch(`${url}/functions/v1/${name}`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: '{}'
  });
  const body = await response.text();
  if (response.status === 404 && /not.?found/i.test(body)) return { state: 'missing', detail: 'ยังไม่ได้ deploy' };
  return { state: 'present', detail: `HTTP ${response.status}` };
}

const label = { present: 'OK      ', missing: 'MISSING ', unknown: '?       ' };

async function main() {
  const { url, key } = resolveConfig();
  if (!url || !key) {
    console.error('ต้องมี VITE_SUPABASE_URL และ VITE_SUPABASE_ANON_KEY');
    console.error('เช่น: node scripts/probes/check-server-surface.mjs https://xxx.supabase.co sb_publishable_xxx');
    process.exit(2);
  }
  console.log(`project: ${url}\n`);

  const missing = [];
  console.log('ฟังก์ชันในฐานข้อมูล (RPC)');
  for (const name of RPCS) {
    const result = await probeRpc(url, key, name);
    if (result.state === 'missing') missing.push(`rpc ${name}`);
    console.log(`  ${label[result.state]} ${name.padEnd(26)} ${result.detail}`);
  }

  console.log('\nEdge Functions');
  for (const name of EDGE_FUNCTIONS) {
    const result = await probeEdgeFunction(url, key, name);
    if (result.state === 'missing') missing.push(`function ${name}`);
    console.log(`  ${label[result.state]} ${name.padEnd(26)} ${result.detail}`);
  }

  console.log('');
  if (missing.length === 0) {
    console.log('ครบทุกชิ้น · เซิร์ฟเวอร์ตรงกับ repository นี้แล้ว หากยังสร้างข้อมูลไม่ได้ ปัญหาอยู่ที่สิทธิ์ของบัญชี ไม่ใช่ที่การ deploy');
    return;
  }
  console.log(`ขาด ${missing.length} ชิ้น:`);
  for (const item of missing) console.log(`  - ${item}`);
  console.log('\nแก้ด้วย: ./scripts/setup-supabase.ps1 -ProjectRef <project-ref> -SkipSecrets');
  process.exitCode = 1;
}

await main();
