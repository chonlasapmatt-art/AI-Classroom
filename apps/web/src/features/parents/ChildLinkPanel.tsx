// "ลูกของฉัน" — the whole of a parent's account management, in one panel.
//
// The screen asks a parent for the child's school and real name. Everything that keeps that safe
// is on the server — the search is school-scoped and returns identity cards, never academic data.
// A valid match is linked immediately; legacy pending rows are still rendered safely.

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { requireSupabase } from '../../services/supabase';
import { linkChild, searchChildren, type ChildCandidate } from '../auth/memberAccess';
import { searchSchools, type SchoolChoice } from '../auth/studentAccess';
import { Badge, Button, Card, CardHeader, ConfirmDialog, EmptyState, Field } from '../../ui/components';
import { Icon } from '../../ui/Icon';

export interface ParentChild {
  linkId: string;
  studentId: string;
  displayName: string;
  schoolId: string;
  schoolName: string;
  className: string;
  maskedCode: string;
  avatarIndex: number;
  relationship: string;
  status: string;
}

const statusLabels: Record<string, string> = {
  linked: 'เชื่อมแล้ว', pending: 'รอครูอนุมัติ', revoked: 'ยกเลิกแล้ว'
};

async function loadParentChildren(): Promise<ParentChild[]> {
  const { data, error } = await requireSupabase().rpc('list_parent_children');
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    linkId: String(row.link_id), studentId: String(row.student_id),
    displayName: String(row.display_name), schoolId: String(row.school_id),
    schoolName: String(row.school_name ?? ''), className: String(row.class_name ?? ''),
    maskedCode: String(row.masked_code ?? ''), avatarIndex: Number(row.avatar_index ?? 0),
    relationship: String(row.relationship ?? 'ผู้ปกครอง'), status: String(row.status ?? 'pending')
  }));
}

export function ChildLinkPanel({ onChanged }: { onChanged?: () => void }) {
  const [children, setChildren] = useState<ParentChild[]>([]);
  const [adding, setAdding] = useState(false);
  const [childName, setChildName] = useState('');
  const [schoolQuery, setSchoolQuery] = useState('');
  const [schoolId, setSchoolId] = useState('');
  const [schools, setSchools] = useState<SchoolChoice[]>([]);
  const [candidates, setCandidates] = useState<ChildCandidate[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [unlinking, setUnlinking] = useState<ParentChild | null>(null);

  const reload = useCallback(async () => {
    try { setChildren(await loadParentChildren()); }
    catch { setMessage('โหลดรายชื่อบุตรหลานไม่สำเร็จ กรุณาลองใหม่'); }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  async function search(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setMessage(null);
    try {
      const found = await searchChildren(schoolId, childName);
      setCandidates(found);
      if (found.length === 0) setMessage('ไม่พบนักเรียนชื่อนี้ กรุณาตรวจสอบชื่อกับคุณครูอีกครั้ง');
    } finally { setBusy(false); }
  }

  async function connect(candidate: ChildCandidate) {
    setBusy(true); setMessage(null);
    try {
      const result = await linkChild(candidate.studentId);
      setMessage(result.status === 'linked'
        ? `เชื่อมบัญชีกับ ${result.displayName} เรียบร้อยแล้ว`
        : `ส่งคำขอเชื่อมบัญชีกับ ${result.displayName} แล้ว รอคุณครูอนุมัติ`);
      setCandidates(null); setChildName(''); setAdding(false);
      await reload();
      onChanged?.();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'เชื่อมบัญชีไม่สำเร็จ กรุณาลองใหม่');
    } finally { setBusy(false); }
  }

  async function unlink(child: ParentChild) {
    setUnlinking(null);
    setBusy(true); setMessage(null);
    try {
      const { error } = await requireSupabase().rpc('set_parent_link_state', {
        p_link_id: child.linkId, p_state: 'revoke'
      });
      if (error) { setMessage('ยกเลิกการเชื่อมไม่สำเร็จ'); return; }
      setMessage(`ยกเลิกการเชื่อมกับ ${child.displayName} แล้ว`);
      await reload();
      onChanged?.();
    } finally { setBusy(false); }
  }

  return (
    <Card className="child-panel">
      <CardHeader
        title="ลูกของฉัน"
        description="เพิ่มลูกได้เองด้วยชื่อจริง · ข้อมูลการเรียนจะแสดงหลังจากโรงเรียนยืนยันแล้วเท่านั้น"
        action={(
          <Button
            variant={adding ? 'ghost' : 'primary'}
            icon={<Icon name={adding ? 'close' : 'plus'} size={16} />}
            onClick={() => { setAdding((value) => !value); setCandidates(null); setMessage(null); }}
          >
            {adding ? 'ปิด' : 'เพิ่มลูก'}
          </Button>
        )}
      />

      {message && <div className="alert" role="status">{message}</div>}

      {adding && (
        <form className="child-search" onSubmit={(event) => void search(event)}>
          <Field label="โรงเรียนของลูก" hint="พิมพ์บางส่วนของชื่อ แล้วเลือกจากรายการที่ขึ้นมา">
            <input
              name="school" value={schoolQuery} autoComplete="off"
              onChange={(event) => {
                setSchoolQuery(event.target.value); setSchoolId('');
                void searchSchools(event.target.value).then(setSchools);
              }}
              placeholder="พิมพ์ชื่อโรงเรียน" required minLength={2}
            />
          </Field>
          {!schoolId && schools.length > 0 && (
            <ul className="school-suggestions">
              {schools.map((school) => (
                <li key={school.schoolId}>
                  <button type="button" className="text-button" onClick={() => {
                    setSchoolId(school.schoolId); setSchoolQuery(school.name); setSchools([]);
                  }}>{school.name}</button>
                </li>
              ))}
            </ul>
          )}
          <Field label="ชื่อจริงของลูก" hint="ใส่ชื่อจริงอย่างเดียวก็ได้ · ถ้ามีเด็กชื่อซ้ำจะขึ้นให้เลือกหลายการ์ด">
            <input
              name="childName" value={childName} autoComplete="off"
              onChange={(event) => { setChildName(event.target.value); setCandidates(null); }}
              placeholder="เช่น ธนกร หรือ ธนกร ศรีสุข"
              required minLength={2}
            />
          </Field>
          <div className="ui-form-actions">
            <Button variant="primary" loading={busy} disabled={!schoolId || childName.trim().length < 2} icon={<Icon name="search" size={16} />}>
              ค้นหา
            </Button>
          </div>
        </form>
      )}

      {candidates && candidates.length > 0 && (
        <ul className="candidate-list">
          {candidates.map((candidate) => (
            <li key={candidate.studentId} className="candidate-card">
              {/* A parent may reach this panel before they belong to any school, so the card draws
                  its own initial rather than reaching for the school database through the repository. */}
              <span className="user-avatar" aria-hidden="true">{candidate.displayName.slice(0, 1)}</span>
              <div>
                <strong>{candidate.displayName}</strong>
                <span>{candidate.schoolName}</span>
                <span>{[candidate.className, candidate.maskedCode].filter(Boolean).join(' · ')}</span>
              </div>
              {candidate.alreadyLinked ? (
                <Badge tone="success">เชื่อมไว้แล้ว</Badge>
              ) : (
                <Button variant="primary" disabled={busy} onClick={() => void connect(candidate)}>เชื่อมบัญชี</Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {children.length === 0 ? (
        <EmptyState
          icon={<Icon name="children" size={28} />}
          title="ยังไม่ได้เพิ่มลูก"
          description="กด “เพิ่มลูก” แล้วกรอกชื่อโรงเรียนกับชื่อจริงของลูก · ระบบจะแสดงเฉพาะข้อมูลที่ใช้แยกแยะเด็กชื่อซ้ำเท่านั้น"
        />
      ) : (
        <ul className="child-link-list">
          {children.map((child) => (
            <li key={child.linkId}>
              <div className="child-link-main">
                <strong>{child.displayName}</strong>
                <span>{[child.schoolName, child.className, child.maskedCode].filter(Boolean).join(' · ')}</span>
                <span>{child.relationship}</span>
              </div>
              <Badge tone={child.status === 'linked' ? 'success' : child.status === 'pending' ? 'warning' : 'danger'}>
                {statusLabels[child.status] ?? child.status}
              </Badge>
              {child.status !== 'revoked' && (
                <Button variant="ghost" size="sm" disabled={busy} onClick={() => setUnlinking(child)}>
                  ยกเลิกการเชื่อม
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Undoing this is not a parent's to do: at a school that reviews requests, re-linking waits on
          a teacher. It used to happen on one press with nothing asked. */}
      {unlinking && (
        <ConfirmDialog
          title={`ยกเลิกการเชื่อมกับ ${unlinking.displayName}`}
          description="คุณจะไม่เห็นการเข้าเรียน คะแนน หรือประกาศของนักเรียนคนนี้อีก · เชื่อมใหม่ได้ แต่บางโรงเรียนต้องให้คุณครูอนุมัติอีกครั้ง"
          confirmLabel="ยกเลิกการเชื่อม"
          onCancel={() => setUnlinking(null)}
          onConfirm={() => void unlink(unlinking)}
        />
      )}
    </Card>
  );
}
