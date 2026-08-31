import { useCallback, useEffect, useState } from 'react';
import {
  Badge, Button, Card, CardHeader, EmptyState, ErrorState, Field, Skeleton, Stat, Toolbar
} from '../ui/components';
import { formatMoment, useDangerousAction } from './consoleHelpers';
import { DangerousActionDialog } from './ReauthGate';
import {
  platformFlagsAndReleases, platformSecurityLog, publishRelease,
  type ReleaseRow, type SecurityEventRow
} from './platformClient';

declare const __APP_VERSION__: string;
declare const __BUILD_TIME__: string;

/**
 * What changed in the system, and when.
 *
 * Two different questions get asked when something looks wrong, and they need different answers, so
 * both are on this page. "What version is this and what was in it" is answered by the release
 * history. "Who changed something and why" is answered by the operator actions beside it — a school
 * suspended, a flag flipped, a protocol raised. Neither alone tells you what happened on a Tuesday.
 *
 * The running build is shown at the top because the most common cause of a report that does not
 * reproduce is a browser holding a version nobody is looking at.
 */
const changeActions: Record<string, string> = {
  RELEASE_PUBLISHED: 'ประกาศรุ่นใหม่',
  FEATURE_FLAG_SET: 'เปลี่ยน Feature Flag',
  SCHOOL_SUSPENDED: 'ระงับโรงเรียน',
  SCHOOL_RESTORED: 'คืนสิทธิ์โรงเรียน',
  ACCOUNT_SUSPENDED: 'ระงับบัญชี',
  ACCOUNT_RESTORED: 'คืนสิทธิ์บัญชี',
  DEVICE_REVOKED: 'เพิกถอนอุปกรณ์',
  SCHOOL_FORCE_LOGOUT: 'บังคับออกจากระบบทั้งโรงเรียน',
  PLATFORM_ADMIN_GRANTED: 'เพิ่มผู้ดูแลแพลตฟอร์ม',
  PLATFORM_ADMIN_REVOKED: 'เพิกถอนผู้ดูแลแพลตฟอร์ม',
  SUPPORT_SESSION_STARTED: 'เริ่ม Support Mode',
  SUPPORT_SESSION_ENDED: 'ออกจาก Support Mode',
  PLATFORM_DEV_SIGN_IN: 'เข้าระบบด้วยรหัสสิทธิ์ (นักพัฒนา)',
  ERROR_RESOLVED: 'ปิดรายการข้อผิดพลาด'
};

// Re-authentication and a password prompt are noise on a page about what changed; they are events
// about proving identity, not about the system changing.
const uninteresting = new Set(['PLATFORM_REAUTHENTICATED']);

const channelTone: Record<ReleaseRow['channel'], 'success' | 'warning' | 'info'> = {
  production: 'success', staging: 'warning', beta: 'info'
};

export function ChangelogPage() {
  const [releases, setReleases] = useState<ReleaseRow[] | null>(null);
  const [events, setEvents] = useState<SecurityEventRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const { pending, request, dismiss } = useDangerousAction();
  const [draft, setDraft] = useState({
    channel: 'production' as ReleaseRow['channel'],
    version: '',
    minimumVersion: '',
    protocolVersion: 1,
    notes: ''
  });

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [flagsAndReleases, log] = await Promise.all([
        platformFlagsAndReleases(), platformSecurityLog(200)
      ]);
      setReleases(flagsAndReleases.releases);
      setEvents(log.filter((event) => !uninteresting.has(event.action)));
      // Publishing on a channel carries the protocol forward by default rather than resetting it to
      // one, which would quietly tell every client it may fall back.
      const current = flagsAndReleases.releases.find((row) => row.channel === 'production' && row.isCurrent);
      if (current) {
        setDraft((value) => value.version
          ? value
          : { ...value, protocolVersion: current.protocolVersion, minimumVersion: current.version });
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'โหลดบันทึกการเปลี่ยนแปลงไม่สำเร็จ');
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const current = releases?.find((row) => row.channel === 'production' && row.isCurrent) ?? null;
  const runningVersion = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'ไม่ทราบ';
  const behind = current !== null && current.version !== runningVersion;

  return (
    <>
      <Card>
        <CardHeader
          title="บันทึกการเปลี่ยนแปลงระบบ"
          description="รุ่นที่ประกาศ และการกระทำของผู้ดูแลแพลตฟอร์มที่เปลี่ยนพฤติกรรมของระบบ"
          action={<Button onClick={() => void refresh()}>รีเฟรช</Button>}
        />
        {error && <ErrorState message={error} onRetry={() => void refresh()} />}
        {message && <div className="alert success" role="status">{message}</div>}
        <div className="stat-row">
          <Stat
            label="เวอร์ชันที่หน้านี้กำลังรันอยู่" value={runningVersion}
            hint={`บิลด์เมื่อ ${formatMoment(typeof __BUILD_TIME__ === 'string' ? __BUILD_TIME__ : null)}`}
            tone={behind ? 'warning' : 'neutral'}
          />
          <Stat
            label="เวอร์ชัน Production ที่ประกาศไว้" value={current?.version ?? 'ยังไม่ประกาศ'}
            hint={current ? `protocol ${current.protocolVersion} · ขั้นต่ำ ${current.minimumSupportedVersion || '—'}` : 'ประกาศได้ด้านล่าง'}
          />
          <Stat label="จำนวนรุ่นที่บันทึกไว้" value={releases?.length ?? 0} />
          <Stat label="การเปลี่ยนแปลงที่บันทึกไว้" value={events.length} />
        </div>
        {behind && (
          <div className="alert warning" role="alert">
            หน้าจอนี้กำลังรันเวอร์ชัน {runningVersion} แต่รุ่น Production ที่ประกาศไว้คือ {current?.version} ·
            ถ้ากำลังไล่ปัญหาที่ทำซ้ำไม่ได้ ให้เช็กว่าเบราว์เซอร์ถือบิลด์เก่าอยู่หรือเปล่า
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="ประวัติรุ่น" description="ใหม่สุดอยู่บนสุด" />
        {!releases ? <Skeleton lines={4} /> : (releases.length > 0 ? (
          <ol className="changelog">
            {releases.map((release) => (
              <li key={release.id}>
                <div className="changelog-head">
                  <strong>{release.version}</strong>
                  <Badge tone={channelTone[release.channel]}>{release.channel}</Badge>
                  {release.isCurrent && <Badge tone="brand">ใช้อยู่</Badge>}
                  <span className="fine-print">{formatMoment(release.releasedAt)}</span>
                </div>
                <p className="fine-print">
                  protocol {release.protocolVersion}
                  {release.minimumSupportedVersion && ` · รองรับขั้นต่ำ ${release.minimumSupportedVersion}`}
                </p>
                {release.releaseNotes
                  ? <p className="changelog-notes">{release.releaseNotes}</p>
                  : <p className="fine-print">ไม่มีบันทึกการเปลี่ยนแปลง</p>}
              </li>
            ))}
          </ol>
        ) : (
          <EmptyState
            title="ยังไม่มีการประกาศรุ่น"
            description="บันทึกรุ่นแรกด้านล่าง เพื่อให้มีจุดอ้างอิงว่าอะไรเปลี่ยนไปเมื่อไหร่"
          />
        ))}
      </Card>

      <Card>
        <CardHeader
          title="บันทึกรุ่นใหม่"
          description="เขียนสิ่งที่เปลี่ยนไว้ที่นี่ จะได้ตอบได้ทีหลังว่าเดือนที่แล้วทำอะไรไป"
        />
        <Toolbar>
          <Field label="ช่องทาง">
            <select
              value={draft.channel}
              onChange={(event) => setDraft((value) => ({ ...value, channel: event.target.value as ReleaseRow['channel'] }))}
            >
              <option value="production">production</option>
              <option value="staging">staging</option>
              <option value="beta">beta</option>
            </select>
          </Field>
          <Field label="เวอร์ชัน" hint={`เวอร์ชันที่บิลด์อยู่ตอนนี้คือ ${runningVersion}`}>
            <input
              value={draft.version} placeholder={runningVersion}
              onChange={(event) => setDraft((value) => ({ ...value, version: event.target.value }))}
            />
          </Field>
          <Field label="เวอร์ชันต่ำสุดที่รองรับ">
            <input
              value={draft.minimumVersion}
              onChange={(event) => setDraft((value) => ({ ...value, minimumVersion: event.target.value }))}
            />
          </Field>
          <Field label="protocol" hint="ขึ้นเลขนี้เมื่อเครื่องเก่าต้องถูกปฏิเสธเท่านั้น">
            <input
              type="number" min={1} value={draft.protocolVersion}
              onChange={(event) => setDraft((value) => ({ ...value, protocolVersion: Number(event.target.value) }))}
            />
          </Field>
        </Toolbar>
        <Field label="สิ่งที่เปลี่ยน">
          <textarea
            rows={4} value={draft.notes} placeholder="เช่น เพิ่มรหัสสำหรับครู · แก้หน้าโรงเรียนที่โหลดไม่ขึ้น"
            onChange={(event) => setDraft((value) => ({ ...value, notes: event.target.value }))}
          />
        </Field>
        <Button
          variant="danger"
          disabled={draft.version.trim().length < 1}
          onClick={() => request({
            summary: `บันทึกรุ่น ${draft.version} บนช่องทาง ${draft.channel}`,
            consequence: draft.channel === 'production'
              ? `เครื่องที่ใช้ protocol ต่ำกว่า ${draft.protocolVersion} จะถูกปฏิเสธจนกว่าจะอัปเดต`
              : 'ช่องทางนี้ไม่กระทบเครื่องของผู้ใช้จริง',
            confirmLabel: 'บันทึกรุ่นนี้',
            run: async () => {
              await publishRelease({
                channel: draft.channel, version: draft.version.trim(),
                minimumVersion: draft.minimumVersion.trim(),
                protocolVersion: draft.protocolVersion, notes: draft.notes.trim()
              });
              setDraft((value) => ({ ...value, version: '', notes: '' }));
              await refresh();
            }
          })}
        >
          บันทึกรุ่น
        </Button>
      </Card>

      <Card>
        <CardHeader
          title="การเปลี่ยนแปลงที่ผู้ดูแลแพลตฟอร์มทำ"
          description="ทุกรายการมีผู้ทำและเหตุผลกำกับ · การพิสูจน์ตัวตนซ้ำไม่นับเป็นการเปลี่ยนแปลงจึงไม่แสดง"
        />
        {events.length > 0 ? (
          <ol className="changelog compact">
            {events.map((event) => (
              <li key={event.id}>
                <div className="changelog-head">
                  <strong>{changeActions[event.action] ?? event.action}</strong>
                  {event.schoolName && <Badge tone="neutral">{event.schoolName}</Badge>}
                  {event.supportSessionId && <Badge tone="warning">Support Mode</Badge>}
                  <span className="fine-print">{formatMoment(event.occurredAt)}</span>
                </div>
                <p className="fine-print">
                  โดย {event.actorName ?? 'ไม่ทราบผู้ทำรายการ'}
                  {event.reason ? ` · ${event.reason}` : ''}
                </p>
              </li>
            ))}
          </ol>
        ) : <EmptyState title="ยังไม่มีการเปลี่ยนแปลงที่บันทึกไว้" />}
      </Card>

      {pending && (
        <DangerousActionDialog action={pending} onClose={dismiss} onDone={(text) => setMessage(text)} />
      )}
    </>
  );
}
