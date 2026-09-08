import { useMemo, useState } from 'react';
import { useSession } from '../../app/SessionContext';
import { useSchoolSnapshot } from '../../data/RepositoryContext';
import { recallRecord, rememberRecord } from '../../app/deviceMemory';
import { Badge, Button, Card, CardHeader, EmptyState, PageHeader, Segmented } from '../../ui/components';
import { Icon, type IconName } from '../../ui/Icon';
import { useToast } from '../../ui/toastContext';
import { FEEDBACK_WINDOW_MS, feedbackFeed, pruneDismissed, type FeedbackItem, type FeedbackKind } from './feedbackFeed';

type Filter = 'all' | FeedbackKind;

const filterLabels: Record<Filter, string> = {
  all: 'ทั้งหมด', submission: 'ส่งงาน', attendance: 'การมาเรียน'
};

const kindIcons: Record<FeedbackKind, IconName> = {
  submission: 'assignments', attendance: 'attendance'
};

const dismissedKey = (profileId: string) => `feedback-inbox-cleared:${profileId}`;

function timeLabel(at: string): string {
  const stamp = new Date(at);
  if (Number.isNaN(stamp.getTime())) return '';
  const minutes = Math.max(0, Math.round((Date.now() - stamp.getTime()) / 60_000));
  if (minutes < 1) return 'เมื่อสักครู่';
  if (minutes < 60) return `${minutes} นาทีที่แล้ว`;
  return `${Math.floor(minutes / 60)} ชั่วโมงที่แล้ว`;
}

/**
 * The staff-room inbox: what the children have done in the last few hours.
 *
 * It is written like a mail box because that is how it is used — skimmed, acted on, cleared — and
 * because a teacher who cannot clear it stops reading it. Deleting hides a message on this device
 * only; the underlying record (the turn-in, the register mark) is untouched, and the whole feed
 * expires by itself after three hours, so nothing accumulates and nothing has to be tidied.
 *
 * The reader decides what it holds: a teacher sees their own rooms and subjects, an advisor their
 * whole room, an administrator the school. Nobody else is given the screen — it names children and
 * says what they did.
 */
export function FeedbackInboxPage() {
  const { membership } = useSession();
  const snapshot = useSchoolSnapshot();
  const { toast } = useToast();
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dismissed, setDismissed] = useState<Record<string, string>>(
    () => pruneDismissed(Object.entries(recallRecord<Record<string, string>>(dismissedKey(membership.profileId), {})))
  );

  const items = useMemo(() => feedbackFeed(snapshot, {
    role: membership.role,
    profileId: membership.profileId,
    dismissed: new Set(Object.keys(dismissed))
  }), [dismissed, membership.profileId, membership.role, snapshot]);

  const visible = filter === 'all' ? items : items.filter((item) => item.kind === filter);

  function remember(next: Record<string, string>) {
    const pruned = pruneDismissed(Object.entries(next));
    setDismissed(pruned);
    rememberRecord(dismissedKey(membership.profileId), pruned);
  }

  function hide(ids: string[]) {
    if (ids.length === 0) return;
    const at = new Date().toISOString();
    remember({ ...dismissed, ...Object.fromEntries(ids.map((id) => [id, at])) });
    setSelected(new Set());
    toast(`ลบออกจากกล่องข้อความแล้ว ${ids.length} รายการ`);
  }

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const hours = Math.round(FEEDBACK_WINDOW_MS / 3_600_000);

  return (
    <>
      <PageHeader
        eyebrow="กล่องข้อความจากห้องเรียน"
        title="รายงานความเคลื่อนไหว"
        description={`สิ่งที่นักเรียนทำใน ${hours} ชั่วโมงล่าสุด — ส่งงาน ขาด ลา มาสาย · ระบบลบให้เองเมื่อพ้น ${hours} ชั่วโมง`}
        action={items.length > 0 && (
          <Button variant="secondary" icon={<Icon name="trash" size={16} />} onClick={() => hide(items.map((item) => item.id))}>
            ล้างทั้งกล่อง
          </Button>
        )}
      />

      <Card>
        <CardHeader
          title={visible.length > 0 ? `${visible.length} ข้อความ` : 'กล่องข้อความ'}
          description={membership.role === 'admin'
            ? 'มุมมองผู้ดูแล: เห็นความเคลื่อนไหวของทั้งโรงเรียน โดยไม่มีการแจ้งเตือนเด้งขึ้นมา'
            : 'เห็นเฉพาะห้องและรายวิชาที่คุณรับผิดชอบ'}
          action={(
            <Segmented
              ariaLabel="กรองประเภทข้อความ"
              value={filter}
              onChange={setFilter}
              options={(['all', 'submission', 'attendance'] as Filter[]).map((value) => ({
                value, label: filterLabels[value]
              }))}
            />
          )}
        />

        {selected.size > 0 && (
          <div className="feedback-bulk" role="status">
            <span>เลือกไว้ {selected.size} รายการ</span>
            <Button size="sm" variant="secondary" onClick={() => hide([...selected])}>ลบที่เลือก</Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>ยกเลิกการเลือก</Button>
          </div>
        )}

        {visible.length === 0 ? (
          <EmptyState
            icon={<Icon name="bell" size={28} />}
            title="ยังไม่มีความเคลื่อนไหว"
            description={`เมื่อนักเรียนส่งงาน หรือมีการเช็กชื่อขาด ลา มาสาย ข้อความจะขึ้นที่นี่และอยู่ ${hours} ชั่วโมง`}
          />
        ) : (
          <ul className="feedback-list">
            {visible.map((item) => (
              <FeedbackRow
                key={item.id}
                item={item}
                checked={selected.has(item.id)}
                onToggle={() => toggle(item.id)}
                onHide={() => hide([item.id])}
              />
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

function FeedbackRow({ item, checked, onToggle, onHide }: {
  item: FeedbackItem; checked: boolean; onToggle(): void; onHide(): void;
}) {
  return (
    <li className="feedback-row" data-tone={item.tone}>
      <label className="feedback-select">
        <input type="checkbox" checked={checked} onChange={onToggle} aria-label={`เลือกข้อความของ ${item.studentName}`} />
      </label>
      <span className="feedback-icon" aria-hidden="true"><Icon name={kindIcons[item.kind]} size={18} /></span>
      <div className="feedback-copy">
        <div className="feedback-head">
          <strong>{item.title}</strong>
          {item.className && <Badge tone="neutral">{item.className}</Badge>}
          {item.subjectName && <Badge tone="info">{item.subjectName}</Badge>}
        </div>
        <p>{item.body}</p>
        <span className="feedback-meta">{timeLabel(item.at)}</span>
      </div>
      <Button size="sm" variant="ghost" onClick={onHide}>ลบ</Button>
    </li>
  );
}
