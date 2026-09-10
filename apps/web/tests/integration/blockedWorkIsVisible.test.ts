import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(process.cwd(), '../..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

const shell = read('apps/web/src/layouts/AppShell.tsx');
const styles = read('apps/web/src/design-system/screens.css');

/**
 * Work the server refused, said out loud.
 *
 * Every write lands on the device first and is pushed afterwards, which is what keeps the app usable
 * on a school connection. It also means a refused push leaves the screen showing something nobody
 * else can see, and the count of those refusals was only ever shown on the Sync screen -- which is
 * an administrator's screen -- plus a pill in the corner that says "ต้องตรวจสอบข้อมูล" once and then
 * goes quiet.
 *
 * That is how a term of turned-in work sat on twenty tablets reading "ส่งแล้ว" against an empty
 * server, and how a child added to a room existed only for the teacher who added them.
 */
describe('work that never reached the server', () => {
  it('is announced on the page rather than only on an administrator screen', () => {
    expect(shell).toContain('snapshot.blockedSync > 0');
    expect(shell).toContain('sync-blocked-banner');
    expect(shell).toContain('ยังไม่ขึ้นเซิร์ฟเวอร์');
  });

  it('says the thing that matters: it is on this device and nobody else can see it', () => {
    expect(shell).toContain('บันทึกไว้ในเครื่องนี้แล้ว แต่เซิร์ฟเวอร์ยังไม่รับ');
    expect(shell).toContain('คนอื่นจึงยังมองไม่เห็น');
  });

  it('offers the administrator the reasons and everybody else a retry', () => {
    expect(shell).toContain('to="/operations"');
    expect(shell).toContain('ลองซิงก์ใหม่');
  });

  it('is a status region, so it is read out rather than merely coloured', () => {
    expect(shell).toContain('className="sync-blocked-banner" role="status"');
    expect(styles).toContain('.sync-blocked-banner');
  });
});
