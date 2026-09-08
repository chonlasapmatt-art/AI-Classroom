import { useMemo, useState, type FormEvent } from 'react';
import { useSession } from '../../app/SessionContext';
import { useRepository, useSchoolSnapshot } from '../../data/RepositoryContext';
import { Badge, Button, Card, CardHeader, ConfirmDialog, EmptyState, Field, FieldGroup } from '../../ui/components';
import { Icon, type IconName } from '../../ui/Icon';
import { useToast } from '../../ui/toastContext';
import {
  broadcastLogFrom, broadcastToneLabels, BROADCAST_VISIBLE_MS, SCHOOL_BROADCAST_KEY,
  SCHOOL_BROADCAST_LOG_KEY, withBroadcastLogged, withBroadcastRemoved,
  type BroadcastTone, type SchoolBroadcast
} from './schoolBroadcast';
import { publishSchoolBroadcast } from './schoolBroadcastLive';

const toneIcons: Record<BroadcastTone, IconName> = { info: 'info', warning: 'warning', danger: 'error' };

const toneBadge: Record<BroadcastTone, 'info' | 'warning' | 'danger'> = {
  info: 'info', warning: 'warning', danger: 'danger'
};

const visibleSeconds = BROADCAST_VISIBLE_MS / 1000;

function whenLabel(raisedAt: string): string {
  const at = new Date(raisedAt);
  if (Number.isNaN(at.getTime())) return 'ไม่ทราบเวลา';
  return at.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
}

/**
 * Where an administrator raises the notice everybody sees.
 *
 * It sits on the announcement screen rather than in settings because it is a thing said, not a
 * thing configured, and the administrator who needs it is already here looking at what the school
 * has been told. The wording is deliberately theirs to write: the log entry that prompted it is
 * written for an operator, and passing that text on unedited is how a school gets told "SYNC_
 * CONFLICT" when what it needed to hear was which lesson to go to.
 *
 * Nothing stays on this screen after it is said. A notice holds every screen in the school for ten
 * seconds and then takes itself down, and here it becomes a line in the log below — which is the
 * honest shape of the thing, because "currently announcing" was never true for longer than it took
 * somebody to read it.
 */
export function SchoolBroadcastComposer() {
  const { membership } = useSession();
  const repository = useRepository();
  const snapshot = useSchoolSnapshot();
  const { toast } = useToast();
  const log = useMemo(() => broadcastLogFrom(snapshot.settings), [snapshot.settings]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [tone, setTone] = useState<BroadcastTone>('warning');
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<SchoolBroadcast | null>(null);

  async function announce(entry: SchoolBroadcast): Promise<void> {
    // The settings row is what a device finds when it wakes up; the channel is what puts the notice
    // in front of the people who are looking now. The row is written first, so a notice that was
    // heard live is always one that was also recorded.
    await repository.saveSetting(SCHOOL_BROADCAST_KEY, { ...entry });
    await repository.saveSetting(SCHOOL_BROADCAST_LOG_KEY, { entries: withBroadcastLogged(log, entry) });
    publishSchoolBroadcast(membership.schoolId, entry);
  }

  async function raise(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const heading = title.trim();
    if (heading.length < 2) { toast('หัวข้อประกาศสั้นเกินไป', { tone: 'error' }); return; }
    setBusy(true);
    try {
      await announce({
        id: crypto.randomUUID(),
        title: heading,
        body: body.trim(),
        tone,
        raisedAt: new Date().toISOString(),
        raisedBy: membership.displayName
      });
      setTitle(''); setBody('');
      toast('ประกาศขึ้นกลางจอทุกเครื่องแล้ว · ปิดเองใน ' + visibleSeconds + ' วินาที', { tone: 'success' });
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : 'ประกาศไม่สำเร็จ', { tone: 'error' });
    } finally { setBusy(false); }
  }

  async function repeat(entry: SchoolBroadcast) {
    setBusy(true);
    try {
      // Said again is a new notice, not the old one: a fresh id and time is what brings it back to
      // somebody who already closed the first one.
      await announce({
        ...entry, id: crypto.randomUUID(), raisedAt: new Date().toISOString(), raisedBy: membership.displayName
      });
      toast('ประกาศซ้ำให้ทุกคนแล้ว', { tone: 'success' });
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : 'ประกาศซ้ำไม่สำเร็จ', { tone: 'error' });
    } finally { setBusy(false); }
  }

  async function remove(entry: SchoolBroadcast) {
    setBusy(true);
    try {
      await repository.saveSetting(SCHOOL_BROADCAST_LOG_KEY, { entries: withBroadcastRemoved(log, entry.id) });
      toast('ลบออกจากบันทึกประกาศแล้ว');
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : 'ลบไม่สำเร็จ', { tone: 'error' });
    } finally { setBusy(false); setRemoving(null); }
  }

  return (
    <>
      <Card className="broadcast-composer">
        <CardHeader
          title="ประกาศด่วนกลางจอ"
          description={'ขึ้นกลางจอทุกเครื่องทันที ทั้งครู นักเรียน และผู้ปกครอง แล้วปิดเองใน '
            + visibleSeconds + ' วินาที ทุกฉบับถูกเก็บไว้ในบันทึกด้านล่าง'}
        />
        <form onSubmit={(event) => void raise(event)} className="broadcast-composer-form">
          <div className="broadcast-composer-fields">
            <Field label="หัวข้อ" hint="สั้นและตรง เช่น ระบบเช็กชื่อขัดข้อง">
              <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} required />
            </Field>
            <Field label="รายละเอียด" hint="บอกให้ชัดว่าต้องทำอะไรต่อ">
              <textarea value={body} onChange={(event) => setBody(event.target.value)} rows={3} maxLength={600} />
            </Field>
            <FieldGroup columns={1}>
              <Field label="ระดับความสำคัญ">
                <div className="broadcast-tone-choice" role="radiogroup" aria-label="ระดับความสำคัญของประกาศ">
                  {(Object.keys(broadcastToneLabels) as BroadcastTone[]).map((value) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={tone === value}
                      className="broadcast-tone-option"
                      data-tone={value}
                      onClick={() => setTone(value)}
                    >
                      <Icon name={toneIcons[value]} size={18} />
                      <span>{broadcastToneLabels[value]}</span>
                    </button>
                  ))}
                </div>
              </Field>
            </FieldGroup>
          </div>

          {/* What the school will see, at the size it will see it. An administrator who can read the
              notice before sending it sends fewer notices that had to be corrected afterwards. */}
          <aside className="broadcast-preview" data-tone={tone} aria-label="ตัวอย่างประกาศที่ทุกคนจะเห็น">
            <span className="broadcast-preview-label">ตัวอย่างที่ทุกคนจะเห็น</span>
            <div className="broadcast-preview-card">
              <span className="broadcast-medallion" aria-hidden="true"><Icon name={toneIcons[tone]} size={22} /></span>
              <strong>{title.trim() || 'หัวข้อประกาศ'}</strong>
              <p>{body.trim() || 'รายละเอียดที่ทุกคนในโรงเรียนจะได้อ่าน'}</p>
              <span className="broadcast-preview-meta">
                {membership.displayName} · ปิดเองใน {visibleSeconds} วินาที
              </span>
            </div>
          </aside>

          <div className="broadcast-composer-actions">
            <Button variant="primary" type="submit" loading={busy} disabled={title.trim().length < 2}>
              ประกาศให้ทุกคนเห็นทันที
            </Button>
          </div>
        </form>
      </Card>

      <Card className="broadcast-log">
        <CardHeader
          title={log.length > 0 ? 'บันทึกประกาศ (' + log.length + ')' : 'บันทึกประกาศ'}
          description="ทุกประกาศที่เคยขึ้นกลางจอ เก็บไว้ที่นี่หลังจากมันปิดตัวเองแล้ว"
        />
        {log.length === 0 ? (
          <EmptyState
            icon={<Icon name="announcements" size={28} />}
            title="ยังไม่เคยประกาศ"
            description="ประกาศที่ส่งไปแล้วจะมาอยู่ในบันทึกนี้"
          />
        ) : (
          <ol className="broadcast-log-list">
            {log.map((entry) => (
              <li key={entry.id} className="broadcast-log-entry" data-tone={entry.tone}>
                <span className="broadcast-log-medallion" aria-hidden="true">
                  <Icon name={toneIcons[entry.tone]} size={16} />
                </span>
                <div className="broadcast-log-copy">
                  <div className="broadcast-log-head">
                    <strong>{entry.title}</strong>
                    <Badge tone={toneBadge[entry.tone]}>{broadcastToneLabels[entry.tone]}</Badge>
                  </div>
                  {entry.body && <p>{entry.body}</p>}
                  <span className="broadcast-log-meta">
                    {whenLabel(entry.raisedAt)} · {entry.raisedBy || 'ผู้ดูแลระบบ'}
                  </span>
                </div>
                <div className="broadcast-log-actions">
                  <Button size="sm" variant="secondary" onClick={() => void repeat(entry)} disabled={busy}>
                    ประกาศซ้ำ
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setRemoving(entry)} disabled={busy}>ลบ</Button>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>

      {removing && (
        <ConfirmDialog
          title="ลบออกจากบันทึก?"
          description={'ประกาศ "' + removing.title + '" จะหายไปจากบันทึกของโรงเรียน ประกาศที่ขึ้นไปแล้วไม่ถูกเรียกคืน'}
          confirmLabel="ลบ"
          onCancel={() => setRemoving(null)}
          onConfirm={() => void remove(removing)}
        />
      )}
    </>
  );
}
