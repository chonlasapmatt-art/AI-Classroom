// "ลูกของฉัน" — the whole of a parent's account management, in one panel.
//
// The screen asks a parent for the child's school and real name. Everything that keeps that safe
// is on the server — the search is school-scoped and returns identity cards, never academic data.
// A valid match is linked immediately; legacy pending rows are still rendered safely.

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { requireSupabase } from '../../services/supabase';
import { linkChild, searchChildren, type ChildCandidate } from '../auth/memberAccess';
import { searchSchools, type SchoolChoice } from '../auth/studentAccess';

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
    <section className="panel data-panel child-panel">
      <div className="panel-heading">
        <h2>ลูกของฉัน</h2>
        <button type="button" className="secondary-button" onClick={() => { setAdding((value) => !value); setCandidates(null); setMessage(null); }}>
          {adding ? 'ปิด' : '+ เพิ่มลูก'}
        </button>
      </div>

      {adding && (
        <form className="inline-form child-search" onSubmit={(event) => void search(event)}>
          <label>
            โรงเรียนของลูก
            <input
              name="school" value={schoolQuery} autoComplete="off"
              onChange={(event) => {
                setSchoolQuery(event.target.value); setSchoolId('');
                void searchSchools(event.target.value).then(setSchools);
              }}
              placeholder="พิมพ์ชื่อโรงเรียน" required minLength={2}
            />
          </label>
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
          <label>
            ชื่อจริงของลูก
            <input
              name="childName" value={childName} autoComplete="off"
              onChange={(event) => { setChildName(event.target.value); setCandidates(null); }}
              placeholder="เช่น ธนกร หรือ ธนกร ศรีสุข" aria-describedby="child-name-hint"
              required minLength={2}
            />
          </label>
          <p className="field-hint" id="child-name-hint">ใส่ชื่อจริงอย่างเดียวก็ได้ ถ้ามีเด็กชื่อซ้ำจะขึ้นให้เลือกหลายการ์ด</p>
          <button className="primary-button" disabled={busy || !schoolId || childName.trim().length < 2}>
            {busy ? 'กำลังค้นหา...' : 'ค้นหา'}
          </button>
          <p className="hint">กรอกแค่ชื่อ ระบบจะแสดงเฉพาะข้อมูลที่ใช้แยกแยะเด็กชื่อซ้ำเท่านั้น</p>
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
                <span className="status-chip">เชื่อมไว้แล้ว</span>
              ) : (
                <button type="button" className="primary-button" disabled={busy} onClick={() => void connect(candidate)}>
                  เชื่อมบัญชี
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {children.length === 0 ? (
        <div className="empty-state"><span>♧</span><h3>ยังไม่ได้เพิ่มลูก</h3><p>กด “+ เพิ่มลูก” แล้วกรอกชื่อจริงของลูก</p></div>
      ) : (
        <ul className="record-list">
          {children.map((child) => (
            <li key={child.linkId}>
              <div className="record-main">
                <div>
                  <strong>{child.displayName}</strong>
                  <span>{[child.schoolName, child.className, child.maskedCode].filter(Boolean).join(' · ')}</span>
                  <span>{child.relationship}</span>
                </div>
                <span className={`status-chip ${child.status === 'linked' ? 'success' : child.status === 'pending' ? 'warning' : 'danger'}`}>
                  {statusLabels[child.status] ?? child.status}
                </span>
              </div>
              {child.status !== 'revoked' && (
                <div className="record-actions">
                  <button type="button" className="text-button" disabled={busy} onClick={() => void unlink(child)}>
                    ยกเลิกการเชื่อม
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {message && <div className="alert" role="status">{message}</div>}
    </section>
  );
}
