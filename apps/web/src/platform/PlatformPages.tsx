import { useCallback, useEffect, useState } from 'react';
import {
  Badge, Button, Card, CardHeader, DataTable, EmptyState, ErrorState, Field, Skeleton, Stat, Toolbar
} from '../ui/components';
import { formatMoment, useDangerousAction } from './consoleHelpers';
import { DangerousActionDialog } from './ReauthGate';
import {
  platformDevices, platformErrors, platformFlagsAndReleases, platformOverview, platformSecurityLog,
  publishRelease, resolveErrorEvent, revokeDevice, setFeatureFlag,
  type DeviceRow, type ErrorRow, type FeatureFlagRow, type PlatformOverview, type ReleaseRow,
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
  const { data, error, loading, refresh } = useRemote<PlatformOverview>(platformOverview);

  if (loading && !data) return <Skeleton lines={8} />;
  if (error) return <ErrorState message={error} onRetry={() => void refresh()} />;
  if (!data) return null;

  const health = data.errors.critical > 0 ? 'critical' : data.errors.high > 0 ? 'warning' : 'healthy';

  return (
    <>
      <Card>
        <CardHeader
          title="ภาพรวมแพลตฟอร์ม"
          description={`เวลาเซิร์ฟเวอร์ ${formatMoment(data.serverTime)}`}
          action={<Button onClick={() => void refresh()}>รีเฟรช</Button>}
        />
        <div className="stat-row">
          <Stat label="โรงเรียนทั้งหมด" value={data.schools.total} hint={`ใช้งาน ${data.schools.active} · ระงับ ${data.schools.suspended}`} />
          <Stat label="ครู" value={data.people.teachers} />
          <Stat label="นักเรียน" value={data.people.students} />
          <Stat label="ผู้ปกครอง" value={data.people.parents} />
          <Stat label="ผู้ดูแลแพลตฟอร์ม" value={data.people.platformAdmins} tone="warning" />
        </div>
      </Card>

      <Card>
        <CardHeader title="สุขภาพระบบ" description="ตัวเลขทั้งหมดคำนวณสดจากเซิร์ฟเวอร์ ไม่ได้เก็บค่าไว้" />
        <div className="stat-row">
          <Stat
            label="ข้อผิดพลาดที่ยังไม่ปิด" value={data.errors.openTotal}
            hint={`ร้ายแรง ${data.errors.critical} · สูง ${data.errors.high}`}
            tone={health === 'critical' ? 'danger' : health === 'warning' ? 'warning' : 'success'}
          />
          <Stat label="ข้อมูลขัดแย้งรอตรวจสอบ" value={data.sync.conflictsOpen} tone={data.sync.conflictsOpen > 0 ? 'warning' : 'success'} />
          <Stat label="การเปลี่ยนแปลงใน 24 ชม." value={data.sync.changesToday} hint={`ล่าสุด ${formatMoment(data.sync.lastChangeAt)}`} />
          <Stat label="อุปกรณ์ที่เชื่อมต่อ" value={data.devices.total} hint={`ไม่ซิงก์เกิน 7 วัน ${data.devices.staleWeek} · ถูกเพิกถอน ${data.devices.revoked}`} />
          <Stat label="การแจ้งเตือนค้าง" value={data.notifications.pending} hint={`ล้มเหลว ${data.notifications.failed}`} tone={data.notifications.failed > 0 ? 'warning' : 'neutral'} />
        </div>
      </Card>

      <Card>
        <CardHeader title="Support Mode และเวอร์ชัน" />
        <div className="stat-row">
          <Stat label="Support Session ที่เปิดอยู่" value={data.support.activeSessions} tone={data.support.activeSessions > 0 ? 'warning' : 'neutral'} />
          <Stat label="Support Session วันนี้" value={data.support.sessionsToday} />
          <Stat label="เวอร์ชัน Production" value={data.release?.version ?? 'ยังไม่ประกาศ'} hint={data.release ? `ขั้นต่ำ ${data.release.minimumSupportedVersion || '—'} · protocol ${data.release.protocolVersion}` : 'ประกาศได้ที่หน้า Releases'} />
        </div>
      </Card>
    </>
  );
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
