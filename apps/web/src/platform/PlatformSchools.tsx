import { useCallback, useEffect, useState } from 'react';
import { Icon } from '../ui/Icon';
import {
  Badge, Button, Card, CardHeader, DataTable, EmptyState, ErrorState, Field, Modal, Skeleton, Stat, Toolbar
} from '../ui/components';
import { formatMoment, useDangerousAction } from './consoleHelpers';
import { DangerousActionDialog } from './ReauthGate';
import {
  forceSchoolLogout, healthLabel, healthTone, platformSchoolDetail, platformSchools,
  setSchoolStatus, startSupportSession,
  type SchoolDetail, type SchoolSummary
} from './platformClient';

const SUPPORT_DURATIONS = [15, 30, 60, 120, 240];

/**
 * Starting a support session.
 *
 * The reason and the duration are asked for together and neither has a default that lets an operator
 * skip thinking about it. A session is not a login: it is a statement, recorded in the school's own
 * audit log, that somebody from the platform was inside this school between these two times and why.
 */
function StartSupportDialog({ school, onClose, onStarted }: {
  school: SchoolSummary | SchoolDetail; onClose(): void; onStarted(message: string): void;
}) {
  const [reason, setReason] = useState('');
  const [minutes, setMinutes] = useState(60);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true); setError(null);
    try {
      await startSupportSession(school.schoolId, reason.trim(), minutes);
      onStarted(`เข้าสู่ Support Mode ของ ${school.name} แล้ว · หมดอายุใน ${minutes} นาที`);
      onClose();
    } catch (reason2) {
      setError(reason2 instanceof Error ? reason2.message : 'เริ่ม Support Mode ไม่สำเร็จ');
    } finally { setBusy(false); }
  }

  return (
    <Modal
      title={`เข้าดูแลโรงเรียน ${school.name}`}
      description="ระบบจะบันทึกเหตุผลนี้ไว้ในบันทึกตรวจสอบของโรงเรียน และโรงเรียนเปิดดูได้"
      onClose={onClose}
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>ยกเลิก</Button>
          <Button variant="primary" onClick={() => void start()} loading={busy} disabled={reason.trim().length < 8}>
            เริ่ม Support Mode
          </Button>
        </>
      }
    >
      <div className="alert warning" role="alert">
        ระหว่าง Support Mode คุณจะทำงานในโรงเรียนนี้ได้เท่ากับผู้ดูแลโรงเรียน
        ทุกการกระทำจะถูกบันทึกพร้อมรหัส Session นี้
      </div>
      <Field label="เหตุผล" hint="อย่างน้อย 8 ตัวอักษร เช่น “โรงเรียนแจ้งว่าคะแนนไม่ซิงก์ ขอให้ตรวจสอบ”">
        <textarea rows={3} value={reason} onChange={(event) => setReason(event.target.value)} required />
      </Field>
      <Field label="ระยะเวลา" hint="หมดเวลาแล้วสิทธิ์จะหยุดเองทันที ไม่ต้องมีใครมากดปิด">
        <select value={minutes} onChange={(event) => setMinutes(Number(event.target.value))}>
          {SUPPORT_DURATIONS.map((value) => <option key={value} value={value}>{value} นาที</option>)}
        </select>
      </Field>
      {error && <div className="alert error" role="alert">{error}</div>}
    </Modal>
  );
}

// ---------------------------------------------------------------------------

export function SchoolsPage() {
  const [schools, setSchools] = useState<SchoolSummary[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [supporting, setSupporting] = useState<SchoolSummary | SchoolDetail | null>(null);
  const [query, setQuery] = useState('');
  const [onlyUnhealthy, setOnlyUnhealthy] = useState(false);

  const refresh = useCallback(async () => {
    setError(null);
    try { setSchools(await platformSchools()); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'โหลดรายชื่อโรงเรียนไม่สำเร็จ'); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  if (selected) {
    return (
      <SchoolDetailPanel
        schoolId={selected}
        onBack={() => { setSelected(null); void refresh(); }}
        onSupport={(school) => setSupporting(school)}
      />
    );
  }

  const visible = (schools ?? []).filter((school) => {
    if (onlyUnhealthy && school.health.status === 'healthy') return false;
    if (!query.trim()) return true;
    const needle = query.trim().toLowerCase();
    return school.name.toLowerCase().includes(needle) || school.code.toLowerCase().includes(needle);
  });

  const healthyCount = visible.filter((school) => school.health.status === 'healthy').length;
  const attentionCount = visible.length - healthyCount;

  return (
    <Card className="school-directory-card">
      <div className="school-directory-head">
        <div>
          <span className="ui-eyebrow">SCHOOL DIRECTORY</span>
          <h1>โรงเรียนทั้งหมด</h1>
          <p>จัดการโรงเรียนเป็นโฟลเดอร์ ดูสุขภาพระบบ และเปิดรายละเอียดการใช้งานเชิงลึก</p>
        </div>
        <Button onClick={() => void refresh()}>รีเฟรช</Button>
      </div>
      {message && <div className="alert success" role="status">{message}</div>}
      {error && <ErrorState message={error} onRetry={() => void refresh()} />}

      <div className="school-directory-summary">
        <Stat label="โรงเรียนที่พบ" value={visible.length} hint={`จากทั้งหมด ${schools?.length ?? 0} แห่ง`} />
        <Stat label="สุขภาพปกติ" value={healthyCount} tone="success" hint="พร้อมใช้งาน" />
        <Stat label="ต้องดูแล" value={attentionCount} tone={attentionCount ? 'warning' : 'neutral'} hint="ตรวจสอบได้จากโฟลเดอร์" />
      </div>

      <Toolbar>
        <Field label="ค้นหา">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ชื่อหรือรหัสโรงเรียน" />
        </Field>
        <label className="checkbox-field">
          <input type="checkbox" checked={onlyUnhealthy} onChange={(event) => setOnlyUnhealthy(event.target.checked)} />
          แสดงเฉพาะที่ต้องดูแล
        </label>
      </Toolbar>

      {!schools ? <Skeleton lines={5} /> : (visible.length > 0 ? (
        <div className="school-folder-grid">
          {visible.map((school) => (
            <article key={school.schoolId} className={`school-folder school-folder-${school.health.status}`}>
              <button className="school-folder-main" type="button" onClick={() => setSelected(school.schoolId)} aria-label={`ดูรายละเอียด ${school.name}`}>
                <div className="school-folder-top">
                  <span className="school-folder-icon" aria-hidden="true"><Icon name="classes" size={20} /></span>
                  <div>
                    <strong>{school.name}</strong>
                    <span>{school.code}</span>
                  </div>
                  <Badge tone={school.status === 'active' ? 'success' : 'danger'}>{school.status === 'active' ? 'ใช้งาน' : 'ระงับ'}</Badge>
                </div>
                <div className="school-folder-health">
                  <Badge tone={healthTone(school.health.status)}>{healthLabel(school.health.status)}</Badge>
                  <span>{school.health.reasons[0] ?? 'ไม่พบสัญญาณผิดปกติ'}</span>
                </div>
                <div className="school-folder-metrics">
                  <div><strong>{school.teachers}</strong><span>ครู</span></div>
                  <div><strong>{school.students}</strong><span>นักเรียน</span></div>
                  <div><strong>{school.health.deviceCount}</strong><span>อุปกรณ์</span></div>
                </div>
              </button>
              <footer className="school-folder-footer">
                <span>ซิงก์ล่าสุด {formatMoment(school.health.lastSuccessfulSyncAt)}</span>
                <div>
                  <Button size="sm" onClick={() => setSelected(school.schoolId)}>รายละเอียด</Button>
                  <Button size="sm" variant="primary" onClick={() => setSupporting(school)}>เข้าดูแลโรงเรียน</Button>
                </div>
              </footer>
            </article>
          ))}
        </div>
      ) : <EmptyState title="ไม่พบโรงเรียนที่ตรงกับเงื่อนไข" />)}

      {supporting && (
        <StartSupportDialog
          school={supporting}
          onClose={() => setSupporting(null)}
          onStarted={(text) => {
            setMessage(text);
            // Move straight into the school's real app. AuthContext will read the fresh support
            // session from the server on this entrypoint.
            window.location.assign('/');
          }}
        />
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------

function SchoolDetailPanel({ schoolId, onBack, onSupport }: {
  schoolId: string; onBack(): void; onSupport(school: SchoolDetail): void;
}) {
  const [detail, setDetail] = useState<SchoolDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const { pending, request, dismiss } = useDangerousAction();

  const refresh = useCallback(async () => {
    setError(null);
    try { setDetail(await platformSchoolDetail(schoolId)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'โหลดข้อมูลโรงเรียนไม่สำเร็จ'); }
  }, [schoolId]);

  useEffect(() => { void refresh(); }, [refresh]);

  if (error) return <ErrorState message={error} onRetry={() => void refresh()} />;
  if (!detail) return <Skeleton lines={8} />;

  const suspended = detail.status !== 'active';

  return (
    <>
      <Card>
        <CardHeader
          title={detail.name}
          description={`${detail.code} · เขตเวลา ${detail.timezone} · สร้างเมื่อ ${formatMoment(detail.createdAt)}`}
          action={
            <>
              <Button onClick={onBack}>ย้อนกลับ</Button>
              <Button variant="primary" onClick={() => onSupport(detail)}>เข้าดูแลโรงเรียน</Button>
            </>
          }
        />
        {message && <div className="alert success" role="status">{message}</div>}

        <div className="stat-row">
          <Stat label="สุขภาพ" value={healthLabel(detail.health.status)} tone={healthTone(detail.health.status)}
            hint={detail.health.reasons.join(' · ') || 'ไม่พบสัญญาณผิดปกติ'} />
          <Stat label="ครู" value={detail.counts.teachers ?? 0} />
          <Stat label="นักเรียน" value={detail.counts.students ?? 0} />
          <Stat label="ผู้ปกครอง" value={detail.counts.parents ?? 0} />
          <Stat label="ห้องเรียน" value={detail.counts.classes ?? 0} />
          <Stat label="ผู้ดูแลโรงเรียน" value={detail.counts.admins ?? 0} tone={detail.counts.admins ? 'neutral' : 'warning'} />
        </div>
        <div className="stat-row">
          <Stat label="คลังข้อสอบ" value={detail.counts.questions ?? 0} />
          <Stat label="ข้อสอบ" value={detail.counts.exams ?? 0} />
          <Stat label="งานที่มอบหมาย" value={detail.counts.assignments ?? 0} />
          <Stat label="รายวิชา" value={detail.counts.subjects ?? 0} />
        </div>

        <div className="school-detail-columns">
          <Card className="platform-roster-card">
            <CardHeader title="ห้องเรียนและการใช้งาน" description="แยกตามห้อง เพื่อดูว่าครูและนักเรียนใช้งานที่ใด" />
            {detail.rooms.length > 0 ? (
              <ul className="platform-roster-list">
                {detail.rooms.map((room) => (
                  <li key={room.roomId}>
                    <div className="platform-roster-main">
                      <span className="platform-roster-icon" aria-hidden="true"><Icon name="classes" size={16} /></span>
                      <div><strong>{room.name}</strong><span>{room.gradeLevel} · ปีการศึกษา {room.academicYear} / เทอม {room.term}</span></div>
                    </div>
                    <div className="platform-roster-meta"><span>{room.teacherCount} ครู · {room.studentCount} นักเรียน</span><span>{room.assignmentCount} งาน · ใช้ล่าสุด {formatMoment(room.lastActivityAt)}</span></div>
                    {room.teachers.length > 0 && <div className="platform-roster-chips">{room.teachers.map((teacher) => <span key={teacher.teacherId}>{teacher.displayName}</span>)}</div>}
                  </li>
                ))}
              </ul>
            ) : <EmptyState title="ยังไม่มีห้องเรียน" />}
          </Card>
          <Card className="platform-roster-card">
            <CardHeader title="ครูและบัญชีเข้าใช้" description="ตรวจได้ว่าครูคนใดมีบัญชีพร้อมใช้และอยู่ห้องใด" />
            {detail.teachers.length > 0 ? (
              <ul className="platform-roster-list">
                {detail.teachers.map((teacher) => (
                  <li key={teacher.teacherId}>
                    <div className="platform-roster-main">
                      <span className="platform-roster-icon" aria-hidden="true"><Icon name="teachers" size={16} /></span>
                      <div><strong>{teacher.displayName}</strong><span>{teacher.teacherCode} · เข้าใช้ล่าสุด {formatMoment(teacher.lastLoginAt)}</span></div>
                    </div>
                    <div className="platform-roster-meta"><Badge tone={teacher.accountStatus === 'active' ? 'success' : teacher.accountStatus === 'not_provisioned' ? 'warning' : 'danger'}>{teacher.accountStatus === 'active' ? 'พร้อมใช้' : teacher.accountStatus === 'not_provisioned' ? 'ยังไม่สร้างบัญชี' : 'ต้องตรวจสอบ'}</Badge><span>{teacher.roomCount} ห้อง</span></div>
                    {teacher.rooms.length > 0 && <div className="platform-roster-chips">{teacher.rooms.map((room) => <span key={room.roomId}>{room.name}</span>)}</div>}
                  </li>
                ))}
              </ul>
            ) : <EmptyState title="ยังไม่มีข้อมูลครู" />}
          </Card>
        </div>
      </Card>

      <Card>
        <CardHeader title="การดำเนินการที่ย้อนกลับยาก" description="ทุกอย่างต้องยืนยันรหัสผ่านและระบุเหตุผล" />
        <Toolbar>
          <Button
            variant={suspended ? 'primary' : 'danger'}
            onClick={() => request({
              summary: suspended ? `คืนสิทธิ์ใช้งานให้ ${detail.name}` : `ระงับการใช้งานของ ${detail.name}`,
              consequence: suspended
                ? 'ทุกคนในโรงเรียนนี้จะกลับมาใช้งานได้ตามสิทธิ์เดิม'
                : 'ทุกคนในโรงเรียนนี้จะเข้าใช้งานไม่ได้จนกว่าจะคืนสิทธิ์ ข้อมูลทั้งหมดยังอยู่ครบและไม่ถูกลบ',
              confirmLabel: suspended ? 'คืนสิทธิ์โรงเรียน' : 'ระงับโรงเรียน',
              run: async (reason) => {
                await setSchoolStatus(detail.schoolId, suspended ? 'active' : 'suspended', reason);
                await refresh();
              }
            })}
          >
            {suspended ? 'คืนสิทธิ์โรงเรียน' : 'ระงับโรงเรียน'}
          </Button>
          <Button
            variant="danger"
            onClick={() => request({
              summary: `บังคับออกจากระบบทุกบัญชีของ ${detail.name}`,
              consequence: 'ทุกเครื่องจะถูกให้ออกจากระบบเมื่อเปิดแอปหรือซิงก์ครั้งถัดไป โทเคนที่ออกไปแล้วยังใช้ได้จนหมดอายุ ถ้าต้องการหยุดการเข้าถึงจริง ๆ ให้ใช้การระงับโรงเรียนแทน',
              confirmLabel: 'บังคับออกจากระบบ',
              run: async (reason) => {
                const result = await forceSchoolLogout(detail.schoolId, reason);
                setMessage(`สั่งออกจากระบบแล้ว ${result.accounts} บัญชี`);
              }
            })}
          >
            บังคับออกจากระบบทั้งโรงเรียน
          </Button>
        </Toolbar>
      </Card>

      <Card>
        <CardHeader title="อุปกรณ์ของโรงเรียนนี้" />
        {detail.devices.length > 0 ? (
          <DataTable head={<tr><th>อุปกรณ์</th><th>เวอร์ชัน</th><th>เห็นล่าสุด</th><th>ซิงก์ล่าสุด</th><th>สถานะ</th></tr>}>
            {detail.devices.map((device) => (
              <tr key={device.deviceId}>
                <td>{device.name}<span className="fine-print"> · {device.type}</span></td>
                <td>{device.clientVersion || '—'}</td>
                <td>{formatMoment(device.lastSeenAt)}</td>
                <td>{formatMoment(device.lastSyncAt)}</td>
                <td>{device.revokedAt ? <Badge tone="danger">เพิกถอนแล้ว</Badge> : <Badge tone="success">ใช้งานอยู่</Badge>}</td>
              </tr>
            ))}
          </DataTable>
        ) : <EmptyState title="ยังไม่มีอุปกรณ์ลงทะเบียน" />}
      </Card>

      <Card>
        <CardHeader title="ประวัติ Support Mode" description="ใครเข้ามาดูแลโรงเรียนนี้ เมื่อไหร่ และเพราะอะไร" />
        {detail.supportSessions.length > 0 ? (
          <DataTable head={<tr><th>เริ่ม</th><th>หมดอายุ</th><th>สิ้นสุดจริง</th><th>เหตุผล</th><th>จำนวนการกระทำ</th></tr>}>
            {detail.supportSessions.map((session) => (
              <tr key={session.sessionId}>
                <td>{formatMoment(session.startedAt)}</td>
                <td>{formatMoment(session.expiresAt)}</td>
                <td>{formatMoment(session.endedAt)}</td>
                <td>{session.reason}</td>
                <td>{session.actionsRecorded}</td>
              </tr>
            ))}
          </DataTable>
        ) : <EmptyState title="ยังไม่เคยมีการเข้าดูแลโรงเรียนนี้" />}
      </Card>

      <Card>
        <CardHeader title="บันทึกตรวจสอบล่าสุด" />
        {detail.recentAudit.length > 0 ? (
          <DataTable head={<tr><th>เมื่อ</th><th>การกระทำ</th><th>ประเภท</th><th>Support</th></tr>}>
            {detail.recentAudit.map((row, index) => (
              <tr key={`${row.occurredAt}-${index}`}>
                <td>{formatMoment(row.occurredAt)}</td>
                <td>{row.action}</td>
                <td>{row.entityType}</td>
                <td>{row.supportSessionId ? <Badge tone="warning">Support Mode</Badge> : '—'}</td>
              </tr>
            ))}
          </DataTable>
        ) : <EmptyState title="ยังไม่มีบันทึก" />}
      </Card>

      {pending && (
        <DangerousActionDialog action={pending} onClose={dismiss} onDone={(text) => setMessage(text)} />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------

/**
 * The banner an operator sees for as long as they are inside a school.
 *
 * It counts down rather than showing an expiry time, because "18:42 left" is something a person acts
 * on and "ends at 14:07" is something they have to work out. When it reaches zero the authority is
 * already gone on the server, so the banner says so rather than waiting to be told.
 */
export function SupportModeBanner({ session, onLeave }: {
  session: { schoolName: string; reason: string; expiresAt: string; actionsRecorded: number };
  onLeave(): void;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const remaining = new Date(session.expiresAt).getTime() - now;
  const expired = remaining <= 0;
  const minutes = Math.max(0, Math.floor(remaining / 60_000));
  const seconds = Math.max(0, Math.floor((remaining % 60_000) / 1000));

  return (
    <div className={`support-banner ${expired ? 'expired' : ''}`.trim()} role="status">
      <strong>SUPER ADMIN SUPPORT MODE</strong>
      <span>กำลังดูแล: {session.schoolName}</span>
      <span className="support-reason">เหตุผล: {session.reason}</span>
      <span className="support-timer">
        {expired ? 'หมดเวลาแล้ว — สิทธิ์ถูกยกเลิกโดยอัตโนมัติ' : `เหลือเวลา ${minutes}:${String(seconds).padStart(2, '0')}`}
      </span>
      {!expired && <button type="button" onClick={() => window.location.assign('/')}>เปิดแอปโรงเรียน</button>}
      <button type="button" onClick={onLeave}>ออกจาก Support Mode</button>
    </div>
  );
}
