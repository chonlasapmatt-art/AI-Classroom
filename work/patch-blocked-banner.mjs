import { patch } from './patchlib.mjs';
const file = 'apps/web/src/layouts/AppShell.tsx';

const old = `        <main className="page-content">
          <StudentQuizPanel />
          {snapshot.ready ? children : <PageLoading />}
        </main>`;

const neu = `        <main className="page-content">
          <StudentQuizPanel />
          {/*
            * Work the server refused, said out loud.
            *
            * Every write is made to the device first and pushed afterwards, which is what keeps the
            * app usable on a school connection -- and it means a push the server refuses leaves the
            * screen showing something nobody else can see. That is how a term's worth of turned-in
            * work sat on twenty tablets reading "ส่งแล้ว" while the teacher's tracking screen
            * truthfully reported an empty server, and how a child added to a room existed for the
            * teacher who added them and for nobody else.
            *
            * The count was already kept; it was only ever shown on the Sync screen, which is an
            * administrator's screen, and by a pill in the corner that says "ต้องตรวจสอบข้อมูล" once
            * and then goes quiet. This says it on every screen, to whoever is looking at it, until
            * the queue is empty -- because the person who can tell that something is missing is the
            * one who just did the work, not the one who reads the queue.
            */}
          {snapshot.blockedSync > 0 && (
            <div className="sync-blocked-banner" role="status">
              <Icon name="warning" size={18} />
              <div>
                <strong>ข้อมูล {snapshot.blockedSync} รายการยังไม่ขึ้นเซิร์ฟเวอร์</strong>
                <span>
                  บันทึกไว้ในเครื่องนี้แล้ว แต่เซิร์ฟเวอร์ยังไม่รับ · คนอื่นจึงยังมองไม่เห็น
                  {membership.role === 'admin' ? ' · เปิดหน้า Sync & Backup เพื่อดูเหตุผลรายรายการ' : ' · แจ้งผู้ดูแลระบบเพื่อตรวจสอบ'}
                </span>
              </div>
              {membership.role === 'admin'
                ? <NavLink to="/operations" className="sync-blocked-action">ดูรายการ</NavLink>
                : <button type="button" className="sync-blocked-action" onClick={() => void sync?.syncNow()}>ลองซิงก์ใหม่</button>}
            </div>
          )}
          {snapshot.ready ? children : <PageLoading />}
        </main>`;

patch(file, [[old, neu]]);
console.log('blocked work is announced on every screen');
