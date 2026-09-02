import { useCallback, useEffect, useState } from 'react';
import {
  Badge, Button, Card, CardHeader, DataTable, EmptyState, ErrorState, Field, Skeleton, Stat, Toolbar
} from '../ui/components';
import { formatMoment, useDangerousAction } from './consoleHelpers';
import { DangerousActionDialog } from './ReauthGate';
import {
  platformDevices, platformErrors, platformFlagsAndReleases, platformNotificationQueue, platformOnlinePeople, platformOverview, platformSecurityLog,
  publishRelease, resolveErrorEvent, revokeDevice, setFeatureFlag,
  type DeviceRow, type ErrorRow, type FeatureFlagRow, type NotificationQueueRow, type OnlinePerson, type PlatformOverview, type ReleaseRow,
  type SecurityEventRow
} from './platformClient';

/** One loading/error/empty shape, so every page behaves the same way when the server is unhappy. */
function useRemote<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    setLoading(true); setError(null);
    return load()
      .then((value) => setData(value))
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'โหลดข้อมูลไม่สำเร็จ'))
      .finally(() => setLoading(false));
  }, [load]);

  useEffect(() => { void refresh(); }, [refresh]);
  return { data, error, loading, refresh, setData };
}

// ---------------------------------------------------------------------------

export function OverviewPage() {
  const load = useCallback(async () => {
    const [overviewResult, onlineResult, activityResult] = await Promise.allSettled([
      platformOverview(), platformOnlinePeople(10), platformSecurityLog(8)
    ]);
    if (overviewResult.status === 'rejected') throw overviewResult.reason;
    const online = onlineResult.status === 'fulfilled'
      ? onlineResult.value
      : (await platformDevices(null, 10).catch(() => [])).filter((device) =>
        device.lastSeenAt && Date.now() - new Date(device.lastSeenAt).getTime() <= 15 * 60_000
      ).map((device): OnlinePerson => ({
        profileId: null, displayName: device.name, role: 'user', schoolName: device.schoolName ?? null,
        deviceName: device.name, deviceType: device.type, lastSeenAt: device.lastSeenAt!
      }));
    return {
      overview: overviewResult.value,
      online,
      activity: activityResult.status === 'fulfilled' ? activityResult.value : []
    };
  }, []);
  const { data, error, loading, refresh } = useRemote<{ overview: PlatformOverview; online: OnlinePerson[]; activity: SecurityEventRow[] }>(load);

  if (loading && !data) return <Skeleton lines={8} />;
  if (error) return <ErrorState message={error} onRetry={() => void refresh()} />;
  if (!data) return null;

  const overview = data.overview;
  const health = overview.errors.critical > 0 ? 'critical' : overview.errors.high > 0 ? 'warning' : 'healthy';
  const healthLabel = health === 'critical' ? 'ต้องแก้ไขด่วน' : health === 'warning' ? 'ควรตรวจสอบ' : 'ทำงานปกติ';
  const healthTone = health === 'critical' ? 'danger' : health === 'warning' ? 'warning' : 'success';
  const activeSchoolPercent = overview.schools.total > 0
    ? Math.round((overview.schools.active / overview.schools.total) * 100)
    : 0;

  return (
    <>
      <header className="platform-dashboard-heading">
        <div>
          <span className="ui-eyebrow">Operations Center</span>
          <h1>ภาพรวมระบบ</h1>
          <p>ติดตามผู้ใช้งาน โรงเรียน และสุขภาพแพลตฟอร์มได้จากหน้าจอเดียว</p>
        </div>
        <div className="platform-dashboard-actions">
          <span className="platform-server-time">อัปเดตล่าสุด {formatMoment(overview.serverTime)}</span>
          <Button onClick={() => void refresh()}>รีเฟรชข้อมูล</Button>
        </div>
      </header>

      <section className="platform-kpi-grid" aria-label="ตัวเลขสำคัญ">
        <Stat label="โรงเรียนทั้งหมด" value={overview.schools.total} hint={`ใช้งาน ${overview.schools.active} · ระงับ ${overview.schools.suspended}`} tone="brand" />
        <Stat label="นักเรียนทั้งหมด" value={overview.people.students} hint={`ครู ${overview.people.teachers}`} tone="info" />
        <Stat label="ผู้ดูแลแพลตฟอร์ม" value={overview.people.platformAdmins} hint="บัญชีที่ดูแลระบบรวม" tone="warning" />
        <Stat label="ผู้ปกครอง" value={overview.people.parents} hint="บัญชีผู้ปกครองทั้งหมด" tone="success" />
      </section>

      <div className="platform-overview-grid">
        <Card className="platform-online-card">
          <CardHeader
            title={<span className="platform-section-title"><span className="platform-live-dot" />ผู้ใช้ออนไลน์</span>}
            description="ตรวจจาก heartbeat ภายใน 15 นาทีล่าสุด"
            action={<Badge tone="success">{data.online.length} คน</Badge>}
          />
          {data.online.length > 0 ? (
            <ul className="platform-online-list">
              {data.online.map((person) => (
                <li key={`${person.profileId ?? person.deviceName}-${person.deviceName}`}>
                  <span className="platform-person-avatar">{person.displayName.trim().slice(0, 1) || '•'}</span>
                  <span className="platform-person-copy">
                    <strong>{person.displayName}</strong>
                    <small>{platformRoleLabel(person.role)}{person.schoolName ? ` · ${person.schoolName}` : ''}</small>
                  </span>
                  <span className="platform-person-meta">
                    <span>{person.deviceName}</span>
                    <time dateTime={person.lastSeenAt}>{formatMoment(person.lastSeenAt)}</time>
                  </span>
                </li>
              ))}
            </ul>
          ) : <EmptyState icon="◉" title="ยังไม่พบผู้ใช้ออนไลน์" description="เมื่อมีอุปกรณ์ส่ง heartbeat รายชื่อจะแสดงที่นี่" />}
        </Card>

        <Card className="platform-health-card">
          <CardHeader title="สุขภาพระบบ" description="ค่าประเมินจาก error, sync และอุปกรณ์ที่เชื่อมต่อ" />
          <div className={`platform-health-hero ${healthTone}`}>
            <span className="platform-health-icon">{health === 'healthy' ? '✓' : '!'}</span>
            <div><strong>{healthLabel}</strong><span>{overview.errors.openTotal} รายการที่ยังไม่ปิด</span></div>
            <Badge tone={healthTone}>{health === 'healthy' ? 'Healthy' : health === 'warning' ? 'Warning' : 'Critical'}</Badge>
          </div>
          <div className="platform-health-grid">
            <div><span>ข้อมูลขัดแย้ง</span><strong>{overview.sync.conflictsOpen}</strong><small>รอตรวจสอบ</small></div>
            <div><span>อุปกรณ์</span><strong>{overview.devices.total}</strong><small>ใช้งานอยู่</small></div>
            <div><span>แจ้งเตือนค้าง</span><strong>{overview.notifications.pending}</strong><small>ล้มเหลว {overview.notifications.failed}</small></div>
          </div>
          <div className="platform-health-progress">
            <div><span>โรงเรียนที่ใช้งานอยู่</span><strong>{activeSchoolPercent}%</strong></div>
            <div className="platform-progress-track"><span style={{ width: `${activeSchoolPercent}%` }} /></div>
          </div>
        </Card>
      </div>

      <div className="platform-overview-grid platform-overview-grid-lower">
        <Card>
          <CardHeader title="สถานะโรงเรียนทั้งหมด" description="ภาพรวมการเปิดใช้งานของโรงเรียนในแพลตฟอร์ม" />
          <div className="platform-school-summary">
            <div className="platform-school-total"><strong>{overview.schools.total}</strong><span>โรงเรียน</span></div>
            <div className="platform-school-bars">
              <div><span><i className="platform-dot active" />ใช้งานอยู่</span><strong>{overview.schools.active}</strong></div>
              <div><span><i className="platform-dot suspended" />ระงับ/อื่น ๆ</span><strong>{overview.schools.suspended}</strong></div>
            </div>
          </div>
          <div className="platform-detail-stats">
            <span>การเปลี่ยนแปลง 24 ชม. <strong>{overview.sync.changesToday}</strong></span>
            <span>ล่าสุด <strong>{formatMoment(overview.sync.lastChangeAt)}</strong></span>
          </div>
        </Card>

        <Card>
          <CardHeader title="Activity log ล่าสุด" description="รายการการใช้งานระดับแพลตฟอร์มแบบย่อ" />
          {data.activity.length > 0 ? (
            <ul className="platform-activity-list">
              {data.activity.map((event) => (
                <li key={event.id}>
                  <span className="platform-activity-icon">↗</span>
                  <span><strong>{event.actorName ?? 'ระบบ'}</strong><small>{event.action}{event.schoolName ? ` · ${event.schoolName}` : ''}</small></span>
                  <time dateTime={event.occurredAt}>{formatMoment(event.occurredAt)}</time>
                </li>
              ))}
            </ul>
          ) : <EmptyState icon="↗" title="ยังไม่มี activity log" description="กิจกรรมของผู้ดูแลจะแสดงที่นี่" />}
        </Card>
      </div>

      <Card>
        <CardHeader title="การทำงานเบื้องหลัง" description="ตัวเลขประกอบสำหรับตรวจสอบระบบแบบรวดเร็ว" />
        <div className="stat-row">
          <Stat label="ข้อผิดพลาดที่ยังไม่ปิด" value={overview.errors.openTotal} hint={`ร้ายแรง ${overview.errors.critical} · สูง ${overview.errors.high}`} tone={healthTone} />
          <Stat label="อุปกรณ์ไม่ซิงก์เกิน 7 วัน" value={overview.devices.staleWeek} hint={`ถูกเพิกถอน ${overview.devices.revoked}`} tone={overview.devices.staleWeek > 0 ? 'warning' : 'success'} />
          <Stat label="Support Session ที่เปิดอยู่" value={overview.support.activeSessions} hint={`วันนี้ ${overview.support.sessionsToday}`} tone={overview.support.activeSessions > 0 ? 'warning' : 'neutral'} />
          <Stat label="เวอร์ชัน Production" value={overview.release?.version ?? 'ยังไม่ประกาศ'} hint={overview.release ? `ขั้นต่ำ ${overview.release.minimumSupportedVersion || '—'} · protocol ${overview.release.protocolVersion}` : 'ประกาศได้ที่หน้า Releases'} />
        </div>
      </Card>
    </>
  );
}

function platformRoleLabel(role: OnlinePerson['role']): string {
  return ({ teacher: 'ครู', student: 'นักเรียน', parent: 'ผู้ปกครอง', admin: 'ผู้ดูแลโรงเรียน', platform_admin: 'ผู้ดูแลแพลตฟอร์ม', user: 'ผู้ใช้งาน' })[role];
}

// ---------------------------------------------------------------------------

const severityTone: Record<ErrorRow['severity'], 'danger' | 'warning' | 'info' | 'neutral'> = {
  critical: 'danger', high: 'warning', medium: 'info', low: 'neutral'
};
const severityLabel: Record<ErrorRow['severity'], string> = {
  critical: 'ร้ายแรง', high: 'สูง', medium: 'ปานกลาง', low: 'ต่ำ'
};

export function ErrorsPage() {
  const [severity, setSeverity] = useState<string>('');
  const [days, setDays] = useState(7);
  const load = useCallback(
    () => platformErrors({ severity: severity || null, days }),
    [days, severity]
  );
  const { data, error, loading, refresh } = useRemote<ErrorRow[]>(load);
  const [message, setMessage] = useState<string | null>(null);

  async function resolve(row: ErrorRow) {
    const note = window.prompt(`ปิดข้อผิดพลาด: ${row.message}\n\nบันทึกสั้น ๆ ว่าแก้ไขอย่างไร`, '');
    if (note === null) return;
    try {
      await resolveErrorEvent(row.id, note);
      setMessage('ปิดรายการแล้ว');
      await refresh();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'ปิดรายการไม่สำเร็จ');
    }
  }

  return (
    <Card>
      <CardHeader
        title="ศูนย์ข้อผิดพลาด"
        description="ไม่แสดงข้อมูลในระเบียนของโรงเรียน แสดงเฉพาะข้อความและบริบทที่ระบบบันทึกไว้"
        action={<Button onClick={() => void refresh()}>รีเฟรช</Button>}
      />
      <Toolbar>
        <Field label="ระดับความรุนแรง">
          <select value={severity} onChange={(event) => setSeverity(event.target.value)}>
            <option value="">ทั้งหมด</option>
            <option value="critical">ร้ายแรง</option>
            <option value="high">สูง</option>
            <option value="medium">ปานกลาง</option>
            <option value="low">ต่ำ</option>
          </select>
        </Field>
        <Field label="ช่วงเวลา">
          <select value={days} onChange={(event) => setDays(Number(event.target.value))}>
            <option value={1}>24 ชั่วโมง</option>
            <option value={7}>7 วัน</option>
            <option value={30}>30 วัน</option>
            <option value={90}>90 วัน</option>
          </select>
        </Field>
      </Toolbar>

      {message && <div className="alert success" role="status">{message}</div>}
      {error && <ErrorState message={error} onRetry={() => void refresh()} />}
      {loading && !data ? <Skeleton lines={5} /> : (data && data.length > 0 ? (
        <DataTable
          caption="ข้อผิดพลาดล่าสุด"
          head={<tr><th>ระดับ</th><th>โรงเรียน</th><th>ส่วนของระบบ</th><th>ข้อความ</th><th>เวอร์ชัน</th><th>เมื่อ</th><th /></tr>}
        >
          {data.map((row) => (
            <tr key={row.id}>
              <td><Badge tone={severityTone[row.severity]}>{severityLabel[row.severity]}</Badge></td>
              <td>{row.schoolName ?? 'ไม่ระบุโรงเรียน'}</td>
              <td>{row.feature || '—'}{row.code && <span className="fine-print"> · {row.code}</span>}</td>
              <td>{row.message}</td>
              <td>{row.clientVersion || '—'}</td>
              <td>{formatMoment(row.occurredAt)}</td>
              <td>
                {row.resolvedAt
                  ? <Badge tone="success">ปิดแล้ว</Badge>
                  : <Button size="sm" onClick={() => void resolve(row)}>ปิดรายการ</Button>}
              </td>
            </tr>
          ))}
        </DataTable>
      ) : <EmptyState title="ไม่มีข้อผิดพลาดในช่วงที่เลือก" description="ลองขยายช่วงเวลาหรือเปลี่ยนระดับความรุนแรง" />)}
    </Card>
  );
}

// ---------------------------------------------------------------------------

const queueStatusTone: Record<NotificationQueueRow['status'], 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  pending: 'info', processing: 'warning', sent: 'success', failed: 'warning', dead_letter: 'danger'
};
const queueStatusLabel: Record<NotificationQueueRow['status'], string> = {
  pending: 'รอส่ง', processing: 'กำลังส่ง', sent: 'ส่งแล้ว', failed: 'รอ retry', dead_letter: 'หยุดส่ง'
};

export function NotificationsPage() {
  const [status, setStatus] = useState<NotificationQueueRow['status'] | ''>('');
  const load = useCallback(() => platformNotificationQueue(status || null), [status]);
  const { data, error, loading, refresh } = useRemote<NotificationQueueRow[]>(load);

  return (
    <Card>
      <CardHeader
        title="ศูนย์แจ้งเตือน"
        description="ตรวจสอบคิว LINE และการ retry โดยไม่เปิดเผยข้อมูลผู้รับหรือเนื้อหาส่วนตัว"
        action={<Button onClick={() => void refresh()}>รีเฟรช</Button>}
      />
      <Toolbar>
        <Field label="สถานะ">
          <select value={status} onChange={(event) => setStatus(event.target.value as NotificationQueueRow['status'] | '')}>
            <option value="">ทั้งหมด</option>
            <option value="pending">รอส่ง</option>
            <option value="processing">กำลังส่ง</option>
            <option value="failed">รอ retry</option>
            <option value="dead_letter">หยุดส่ง</option>
            <option value="sent">ส่งแล้ว</option>
          </select>
        </Field>
      </Toolbar>
      {error && <ErrorState message={error} onRetry={() => void refresh()} />}
      {loading && !data ? <Skeleton lines={6} /> : (data && data.length > 0 ? (
        <DataTable
          caption="คิวแจ้งเตือนล่าสุด"
          head={<tr><th>เมื่อ</th><th>โรงเรียน</th><th>เหตุการณ์</th><th>สถานะ</th><th>Retry</th><th>กำหนดครั้งถัดไป</th><th>ข้อผิดพลาดล่าสุด</th></tr>}
        >
          {data.map((row) => (
            <tr key={row.id}>
              <td>{formatMoment(row.createdAt)}</td>
              <td>{row.schoolName ?? 'ไม่ระบุโรงเรียน'}</td>
              <td>{row.eventType}</td>
              <td><Badge tone={queueStatusTone[row.status]}>{queueStatusLabel[row.status]}</Badge></td>
              <td>{row.retryCount}/5</td>
              <td>{formatMoment(row.nextRetryAt)}</td>
              <td>{row.lastError ?? '—'}</td>
            </tr>
          ))}
        </DataTable>
      ) : <EmptyState title="ไม่มีรายการในสถานะนี้" description="ลองเปลี่ยนตัวกรองหรือรอให้มีเหตุการณ์ใหม่" />)}
    </Card>
  );
}

export function DevicesPage() {
  const load = useCallback(() => platformDevices(null, 300), []);
  const { data, error, loading, refresh } = useRemote<DeviceRow[]>(load);
  const { pending, request, dismiss } = useDangerousAction();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader
        title="ศูนย์อุปกรณ์"
        description="เพิกถอนแล้วอุปกรณ์จะลงทะเบียนตัวเองกลับมาไม่ได้ ต้องมีคนเพิ่มใหม่โดยตั้งใจ"
        action={<Button onClick={() => void refresh()}>รีเฟรช</Button>}
      />
      {message && <div className="alert success" role="status">{message}</div>}
      {error && <ErrorState message={error} onRetry={() => void refresh()} />}
      {loading && !data ? <Skeleton lines={5} /> : (data && data.length > 0 ? (
        <DataTable
          caption="อุปกรณ์ทั้งหมด"
          head={<tr><th>อุปกรณ์</th><th>โรงเรียน</th><th>เวอร์ชัน</th><th>เห็นล่าสุด</th><th>ซิงก์ล่าสุด</th><th>สถานะ</th><th /></tr>}
        >
          {data.map((row) => (
            <tr key={row.deviceId}>
              <td>{row.name}<span className="fine-print"> · {row.type}</span></td>
              <td>{row.schoolName ?? '—'}</td>
              <td>{row.clientVersion || '—'}{row.protocolVersion ? <span className="fine-print"> · protocol {row.protocolVersion}</span> : null}</td>
              <td>{formatMoment(row.lastSeenAt)}</td>
              <td>{formatMoment(row.lastSyncAt)}</td>
              <td>
                {row.revokedAt
                  ? <Badge tone="danger">เพิกถอนแล้ว</Badge>
                  : <Badge tone="success">ใช้งานอยู่</Badge>}
              </td>
              <td>
                {!row.revokedAt && (
                  <Button size="sm" variant="danger" onClick={() => request({
                    summary: `เพิกถอนอุปกรณ์ “${row.name}” ของ ${row.schoolName ?? 'โรงเรียนนี้'}`,
                    consequence: 'อุปกรณ์นี้จะซิงก์ต่อไม่ได้ และจะลงทะเบียนตัวเองกลับมาไม่ได้ ข้อมูลที่ยังไม่ได้ซิงก์ในเครื่องนั้นจะยังค้างอยู่ที่เครื่อง',
                    confirmLabel: 'เพิกถอนอุปกรณ์',
                    minimumReasonLength: 4,
                    run: async (reason) => { await revokeDevice(row.deviceId, reason); await refresh(); }
                  })}>เพิกถอน</Button>
                )}
              </td>
            </tr>
          ))}
        </DataTable>
      ) : <EmptyState title="ยังไม่มีอุปกรณ์ลงทะเบียน" />)}

      {pending && (
        <DangerousActionDialog action={pending} onClose={dismiss} onDone={(text) => setMessage(text)} />
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------

export function SecurityPage() {
  const load = useCallback(() => platformSecurityLog(200), []);
  const { data, error, loading, refresh } = useRemote<SecurityEventRow[]>(load);

  return (
    <Card>
      <CardHeader
        title="บันทึกความปลอดภัยระดับแพลตฟอร์ม"
        description="ทุกรายการที่ผู้ดูแลแพลตฟอร์มทำ พร้อมเหตุผลและ Support Session ที่อนุญาต"
        action={<Button onClick={() => void refresh()}>รีเฟรช</Button>}
      />
      {error && <ErrorState message={error} onRetry={() => void refresh()} />}
      {loading && !data ? <Skeleton lines={6} /> : (data && data.length > 0 ? (
        <DataTable
          caption="เหตุการณ์ล่าสุด"
          head={<tr><th>เมื่อ</th><th>ผู้ทำรายการ</th><th>การกระทำ</th><th>เป้าหมาย</th><th>เหตุผล</th><th>Support</th></tr>}
        >
          {data.map((row) => (
            <tr key={row.id}>
              <td>{formatMoment(row.occurredAt)}</td>
              <td>{row.actorName ?? row.actorProfileId ?? '—'}</td>
              <td>{row.action}</td>
              <td>{row.schoolName ?? (row.targetProfileId ? 'บัญชีผู้ใช้' : '—')}</td>
              <td>{row.reason || '—'}</td>
              <td>{row.supportSessionId ? <Badge tone="warning">มี</Badge> : '—'}</td>
            </tr>
          ))}
        </DataTable>
      ) : <EmptyState title="ยังไม่มีเหตุการณ์" />)}
    </Card>
  );
}

// ---------------------------------------------------------------------------

export function PlatformSettingsPage() {
  const { data, error, loading, refresh } = useRemote<{ flags: FeatureFlagRow[]; releases: ReleaseRow[] }>(
    platformFlagsAndReleases
  );
  const { pending, request, dismiss } = useDangerousAction();
  const [message, setMessage] = useState<string | null>(null);
  const [flagKey, setFlagKey] = useState('');
  const [flagDescription, setFlagDescription] = useState('');
  const [release, setRelease] = useState({
    channel: 'production' as ReleaseRow['channel'], version: '', minimumVersion: '', protocolVersion: 1, notes: ''
  });

  async function toggle(row: FeatureFlagRow) {
    try {
      await setFeatureFlag(row.key, row.schoolId, !row.enabled, row.description);
      setMessage(`${row.key}: ${row.enabled ? 'ปิด' : 'เปิด'}แล้ว`);
      await refresh();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'เปลี่ยนค่าไม่สำเร็จ');
    }
  }

  async function createFlag() {
    try {
      await setFeatureFlag(flagKey.trim(), null, false, flagDescription.trim());
      setFlagKey(''); setFlagDescription('');
      setMessage('สร้าง Feature Flag แล้ว (ค่าเริ่มต้น: ปิด)');
      await refresh();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'สร้างไม่สำเร็จ');
    }
  }

  return (
    <>
      <Card>
        <CardHeader
          title="Feature Flags"
          description="ใช้ควบคุมการทยอยเปิดฟีเจอร์เท่านั้น ไม่ใช่ระบบสิทธิ์ การอนุญาตยังตัดสินที่ฐานข้อมูลเสมอ"
          action={<Button onClick={() => void refresh()}>รีเฟรช</Button>}
        />
        {message && <div className="alert success" role="status">{message}</div>}
        {error && <ErrorState message={error} onRetry={() => void refresh()} />}

        <Toolbar>
          <Field label="คีย์ใหม่" hint="a-z ตัวเลข และขีดล่าง เช่น quiz_challenge">
            <input value={flagKey} onChange={(event) => setFlagKey(event.target.value)} placeholder="quiz_challenge" />
          </Field>
          <Field label="คำอธิบาย">
            <input value={flagDescription} onChange={(event) => setFlagDescription(event.target.value)} placeholder="เปิดกิจกรรมตอบคำถามในห้องเรียน" />
          </Field>
          <Button variant="primary" onClick={() => void createFlag()} disabled={flagKey.trim().length < 3}>เพิ่ม Flag</Button>
        </Toolbar>

        {loading && !data ? <Skeleton lines={4} /> : (data && data.flags.length > 0 ? (
          <DataTable head={<tr><th>คีย์</th><th>ขอบเขต</th><th>สถานะ</th><th>คำอธิบาย</th><th /></tr>}>
            {data.flags.map((row) => (
              <tr key={`${row.key}-${row.schoolId ?? 'global'}`}>
                <td>{row.key}</td>
                <td>{row.schoolName ?? 'ทั้งแพลตฟอร์ม'}</td>
                <td><Badge tone={row.enabled ? 'success' : 'neutral'}>{row.enabled ? 'เปิด' : 'ปิด'}</Badge></td>
                <td>{row.description || '—'}</td>
                <td><Button size="sm" onClick={() => void toggle(row)}>{row.enabled ? 'ปิด' : 'เปิด'}</Button></td>
              </tr>
            ))}
          </DataTable>
        ) : <EmptyState title="ยังไม่มี Feature Flag" description="เพิ่มคีย์ด้านบนเพื่อเริ่มควบคุมการเปิดฟีเจอร์" />)}
      </Card>

      <Card>
        <CardHeader
          title="Releases"
          description="protocol version เดินทางไปกับรุ่น การขึ้นเลขนี้คือการเปลี่ยน “ควรอัปเดต” ให้เป็น “ต้องอัปเดต”"
        />
        <Toolbar>
          <Field label="ช่องทาง">
            <select value={release.channel} onChange={(event) => setRelease((value) => ({ ...value, channel: event.target.value as ReleaseRow['channel'] }))}>
              <option value="production">production</option>
              <option value="staging">staging</option>
              <option value="beta">beta</option>
            </select>
          </Field>
          <Field label="เวอร์ชัน"><input value={release.version} onChange={(event) => setRelease((value) => ({ ...value, version: event.target.value }))} placeholder="3.2.0" /></Field>
          <Field label="เวอร์ชันต่ำสุดที่รองรับ"><input value={release.minimumVersion} onChange={(event) => setRelease((value) => ({ ...value, minimumVersion: event.target.value }))} placeholder="3.1.0" /></Field>
          <Field label="protocol"><input type="number" min={1} value={release.protocolVersion} onChange={(event) => setRelease((value) => ({ ...value, protocolVersion: Number(event.target.value) }))} /></Field>
        </Toolbar>
        <Field label="บันทึกการเปลี่ยนแปลง">
          <textarea rows={3} value={release.notes} onChange={(event) => setRelease((value) => ({ ...value, notes: event.target.value }))} />
        </Field>
        <Button
          variant="danger"
          disabled={release.version.trim().length < 1}
          onClick={() => request({
            summary: `ประกาศ ${release.channel} เวอร์ชัน ${release.version}`,
            consequence: `เครื่องที่ใช้ protocol ต่ำกว่า ${release.protocolVersion} จะถูกปฏิเสธจนกว่าจะอัปเดต งานที่ยังไม่ซิงก์บนเครื่องเหล่านั้นจะซิงก์ไม่ได้จนกว่าจะอัปเดตเสร็จ`,
            confirmLabel: 'ประกาศรุ่นนี้',
            run: async () => {
              await publishRelease({
                channel: release.channel, version: release.version.trim(),
                minimumVersion: release.minimumVersion.trim(), protocolVersion: release.protocolVersion,
                notes: release.notes.trim()
              });
              await refresh();
            }
          })}
        >
          ประกาศรุ่น
        </Button>

        {data && data.releases.length > 0 && (
          <DataTable head={<tr><th>ช่องทาง</th><th>เวอร์ชัน</th><th>ขั้นต่ำ</th><th>protocol</th><th>เมื่อ</th><th>ปัจจุบัน</th></tr>}>
            {data.releases.map((row) => (
              <tr key={row.id}>
                <td>{row.channel}</td>
                <td>{row.version}</td>
                <td>{row.minimumSupportedVersion || '—'}</td>
                <td>{row.protocolVersion}</td>
                <td>{formatMoment(row.releasedAt)}</td>
                <td>{row.isCurrent ? <Badge tone="success">ใช่</Badge> : '—'}</td>
              </tr>
            ))}
          </DataTable>
        )}
      </Card>

      {pending && (
        <DangerousActionDialog action={pending} onClose={dismiss} onDone={(text) => setMessage(text)} />
      )}
    </>
  );
}
