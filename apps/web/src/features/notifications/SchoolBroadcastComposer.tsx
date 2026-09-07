import { useState, type FormEvent } from 'react';
import { useSession } from '../../app/SessionContext';
import { useRepository, useSchoolSnapshot } from '../../data/RepositoryContext';
import { Button, Card, CardHeader, ConfirmDialog, Field, FieldGroup } from '../../ui/components';
import { useToast } from '../../ui/toastContext';
import {
  broadcastToneLabels, schoolBroadcastFrom, SCHOOL_BROADCAST_KEY, type BroadcastTone
} from './schoolBroadcast';

/**
 * Where an administrator raises the notice everybody sees.
 *
 * It sits on the announcement screen rather than in settings because it is a thing said, not a
 * thing configured, and the administrator who needs it is already here looking at what the school
 * has been told. The wording is deliberately theirs to write: the log entry that prompted it is
 * written for an operator, and passing that text on unedited is how a school gets told "SYNC_
 * CONFLICT" when what it needed to hear was which lesson to go to.
 */
export function SchoolBroadcastComposer() {
  const { membership } = useSession();
  const repository = useRepository();
  const snapshot = useSchoolSnapshot();
  const { toast } = useToast();
  const current = schoolBroadcastFrom(snapshot.settings);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [tone, setTone] = useState<BroadcastTone>('warning');
  const [busy, setBusy] = useState(false);
  const [clearing, setClearing] = useState(false);

  async function raise(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const heading = title.trim();
    if (heading.length < 2) { toast('หัวข้อประกาศสั้นเกินไป', { tone: 'error' }); return; }
    setBusy(true);
    try {
      await repository.saveSetting(SCHOOL_BROADCAST_KEY, {
        title: heading,
        body: body.trim(),
        tone,
        // A fresh timestamp is what brings the notice back to somebody who closed the previous one.
        raisedAt: new Date().toISOString(),
        raisedBy: membership.displayName
      });
      setTitle(''); setBody('');
      toast('ประกาศขึ้นกลางจอให้ทุกคนในโรงเรียนแล้ว', { tone: 'success' });
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : 'ประกาศไม่สำเร็จ', { tone: 'error' });
    } finally { setBusy(false); }
  }

  async function clear() {
    setBusy(true);
    try {
      // Cleared, not deleted: the row keeps who raised the last notice and when it came down.
      await repository.saveSetting(SCHOOL_BROADCAST_KEY, {
        title: '', body: '', tone: 'info', raisedAt: new Date().toISOString(), raisedBy: membership.displayName
      });
      toast('เก็บประกาศลงแล้ว ทุกคนจะไม่เห็นอีก', { tone: 'success' });
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : 'เก็บประกาศไม่สำเร็จ', { tone: 'error' });
    } finally { setBusy(false); setClearing(false); }
  }

  return (
    <Card>
      <CardHeader
        title="ประกาศด่วนกลางจอ"
        description="ขึ้นกลางจอให้ทุกคนในโรงเรียนเห็นทันที ทั้งครู นักเรียน และผู้ปกครอง ทุกห้องทุกระดับชั้น ไม่มีเงื่อนไข"
      />
      {current && (
        <div className={`alert ${current.tone === 'danger' ? 'error' : current.tone === 'warning' ? 'warning' : 'info'}`} role="status">
          <strong>กำลังประกาศอยู่ · {current.title}</strong>
          {current.body && <div>{current.body}</div>}
          <div className="fine-print">โดย {current.raisedBy || 'ผู้ดูแลระบบ'}</div>
        </div>
      )}
      <form onSubmit={(event) => void raise(event)}>
        <FieldGroup columns={2}>
          <Field label="หัวข้อ" hint="สั้นและตรง เช่น ระบบเช็กชื่อขัดข้อง">
            <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} required />
          </Field>
          <Field label="ระดับความสำคัญ">
            <select value={tone} onChange={(event) => setTone(event.target.value as BroadcastTone)}>
              {(Object.keys(broadcastToneLabels) as BroadcastTone[]).map((value) => (
                <option key={value} value={value}>{broadcastToneLabels[value]}</option>
              ))}
            </select>
          </Field>
        </FieldGroup>
        <Field label="รายละเอียด" hint="บอกให้ชัดว่าต้องทำอะไรต่อ">
          <textarea value={body} onChange={(event) => setBody(event.target.value)} rows={3} maxLength={600} />
        </Field>
        <div className="ui-card-actions">
          {current && (
            <Button variant="ghost" type="button" onClick={() => setClearing(true)} disabled={busy}>
              เก็บประกาศปัจจุบันลง
            </Button>
          )}
          <Button variant="primary" type="submit" loading={busy} disabled={title.trim().length < 2}>
            {current ? 'เปลี่ยนเป็นประกาศนี้' : 'ประกาศให้ทุกคนเห็น'}
          </Button>
        </div>
      </form>
      {clearing && (
        <ConfirmDialog
          title="เก็บประกาศลง?"
          description="ทุกคนในโรงเรียนจะไม่เห็นประกาศนี้อีก ประกาศใหม่ขึ้นได้ตลอดเวลา"
          confirmLabel="เก็บลง"
          onCancel={() => setClearing(false)}
          onConfirm={() => void clear()}
        />
      )}
    </Card>
  );
}
