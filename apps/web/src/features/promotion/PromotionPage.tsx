import { useMemo, useState, type FormEvent } from 'react';
import { useSession } from '../../app/SessionContext';
import { useRepository, useSchoolSnapshot } from '../../data/RepositoryContext';
import type { PromotionMove } from '../../data/schoolRepository';

/** What happens to one source class when the year turns over. */
type ClassPlan = { kind: 'move'; toClassId: string } | { kind: 'graduate' } | { kind: 'skip' };

const termStatusLabels: Record<'draft' | 'active' | 'closed', string> = {
  draft: 'ร่าง', active: 'ใช้งานอยู่', closed: 'ปิดแล้ว'
};

export function PromotionPage() {
  const { membership } = useSession();
  const repository = useRepository();
  const snapshot = useSchoolSnapshot();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fromTermId, setFromTermId] = useState('');
  const [toTermId, setToTermId] = useState('');
  const [plans, setPlans] = useState<Record<string, ClassPlan>>({});

  const canOperate = (membership.role === 'admin' || membership.role === 'teacher') && repository.canManageStructure;
  const activeTerm = snapshot.terms.find((term) => term.status === 'active') ?? snapshot.terms[0] ?? null;
  const sourceTermId = fromTermId || activeTerm?.id || '';
  const sourceClasses = snapshot.classes.filter((row) => row.academicTermId === sourceTermId && row.status === 'active');
  const targetClasses = snapshot.classes.filter((row) => row.academicTermId === toTermId && row.status === 'active');

  const rosterOf = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const enrollment of snapshot.enrollments) {
      if (enrollment.status !== 'active' || enrollment.academicTermId !== sourceTermId) continue;
      map.set(enrollment.classId, [...(map.get(enrollment.classId) ?? []), enrollment.studentId]);
    }
    return map;
  }, [snapshot.enrollments, sourceTermId]);

  const planned = sourceClasses.reduce((total, classroom) => {
    const plan = plans[classroom.id] ?? { kind: 'skip' as const };
    if (plan.kind === 'skip') return total;
    return total + (rosterOf.get(classroom.id)?.length ?? 0);
  }, 0);

  async function createTerm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setBusy(true);
    try {
      await repository.saveAcademicTerm({
        academicYear: String(values.get('academicYear') ?? ''),
        term: String(values.get('term') ?? ''),
        startsOn: String(values.get('startsOn') ?? ''),
        endsOn: String(values.get('endsOn') ?? ''),
        status: String(values.get('status') ?? 'draft') as 'draft' | 'active' | 'closed'
      });
      form.reset();
      setMessage('บันทึกปีการศึกษาแล้ว');
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'บันทึกปีการศึกษาไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  }

  async function runPromotion() {
    if (!sourceTermId || !toTermId) { setMessage('เลือกปีการศึกษาต้นทางและปลายทางก่อน'); return; }
    const moves: PromotionMove[] = [];
    for (const classroom of sourceClasses) {
      const plan = plans[classroom.id] ?? { kind: 'skip' as const };
      if (plan.kind === 'skip') continue;
      for (const studentId of rosterOf.get(classroom.id) ?? []) {
        moves.push({ studentId, toClassId: plan.kind === 'move' ? plan.toClassId : null });
      }
    }
    if (moves.length === 0) { setMessage('ยังไม่ได้เลือกห้องปลายทางให้ห้องใด'); return; }
    const confirmed = window.confirm(
      `จะย้ายนักเรียน ${moves.length} คนไปยังปีการศึกษาใหม่\n` +
      'ประวัติเดิม (การเช็กชื่อ คะแนน งาน) จะยังอยู่ครบ การลงทะเบียนเดิมจะถูกปิดเป็น "เลื่อนชั้น" หรือ "จบการศึกษา"\n\nยืนยันดำเนินการ?'
    );
    if (!confirmed) return;
    setBusy(true);
    try {
      const result = await repository.promoteStudents({
        fromTermId: sourceTermId, toTermId, moves, actorProfileId: membership.profileId
      });
      setMessage(`เลื่อนชั้น ${result.promoted} คน · จบการศึกษา ${result.graduated} คน · ข้าม ${result.skipped} คน`);
      setPlans({});
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'เลื่อนชั้นไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="page-heading">
        <div>
          <span className="eyebrow">สิ้นปีการศึกษา</span>
          <h1>ปีการศึกษาและการเลื่อนชั้น</h1>
          <p>{snapshot.terms.length} ปีการศึกษาในระบบ · เลือกได้ทีละห้องว่าจะเลื่อนไปห้องใดหรือจบการศึกษา</p>
        </div>
      </section>

      <section className="panel data-panel">
        <div className="panel-heading"><h2>ปีการศึกษา</h2></div>
        <ul className="record-list">
          {snapshot.terms.map((term) => (
            <li key={term.id}>
              <div className="record-main">
                <div>
                  <strong>ปีการศึกษา {term.academicYear} · ภาคเรียนที่ {term.term}</strong>
                  <span>{term.startsOn} ถึง {term.endsOn}</span>
                </div>
                <span className={`status-chip ${term.status === 'active' ? 'success' : ''}`.trim()}>
                  {termStatusLabels[term.status]}
                </span>
              </div>
              {canOperate && term.status !== 'active' && (
                <div className="record-actions">
                  <button
                    className="text-button"
                    onClick={() => void repository.saveAcademicTerm({
                      id: term.id, academicYear: term.academicYear, term: term.term,
                      startsOn: term.startsOn, endsOn: term.endsOn, status: 'active'
                    }).then(() => setMessage('เปลี่ยนปีการศึกษาที่ใช้งานแล้ว'))
                      .catch((reason: unknown) => setMessage(reason instanceof Error ? reason.message : 'เปลี่ยนไม่สำเร็จ'))}
                  >
                    ตั้งเป็นปีที่ใช้งาน
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
        {snapshot.terms.length === 0 && <p className="hint">ยังไม่มีปีการศึกษา สร้างปีแรกด้านล่าง</p>}
      </section>

      {canOperate && (
        <form className="panel inline-form" onSubmit={(event) => void createTerm(event)}>
          <div className="panel-heading"><h2>เปิดปีการศึกษา / ภาคเรียนใหม่</h2></div>
          <div className="form-grid">
            <label>ปีการศึกษา<input name="academicYear" required placeholder="2569" /></label>
            <label>ภาคเรียน<input name="term" required placeholder="1" /></label>
            <label>วันเริ่ม<input name="startsOn" type="date" required /></label>
            <label>วันสิ้นสุด<input name="endsOn" type="date" required /></label>
            <label>
              สถานะ
              <select name="status" defaultValue="draft">
                <option value="draft">ร่าง (เตรียมไว้ก่อน)</option>
                <option value="active">ใช้งานทันที</option>
              </select>
            </label>
          </div>
          <button className="primary-button" disabled={busy}>{busy ? 'กำลังบันทึก...' : 'บันทึกปีการศึกษา'}</button>
          <p className="hint">ตั้งเป็น “ใช้งานทันที” จะปิดปีการศึกษาเดิมโดยอัตโนมัติ ข้อมูลเดิมไม่ถูกลบ</p>
        </form>
      )}

      {canOperate && (
        <section className="panel data-panel">
          <div className="panel-heading"><h2>แผนการเลื่อนชั้น</h2></div>
          <div className="form-grid">
            <label>
              จากปีการศึกษา
              <select value={sourceTermId} onChange={(event) => { setFromTermId(event.target.value); setPlans({}); }}>
                {snapshot.terms.map((term) => (
                  <option key={term.id} value={term.id}>{term.academicYear}/{term.term}</option>
                ))}
              </select>
            </label>
            <label>
              ไปยังปีการศึกษา
              <select value={toTermId} onChange={(event) => { setToTermId(event.target.value); setPlans({}); }}>
                <option value="">เลือกปีปลายทาง</option>
                {snapshot.terms.filter((term) => term.id !== sourceTermId).map((term) => (
                  <option key={term.id} value={term.id}>{term.academicYear}/{term.term}</option>
                ))}
              </select>
            </label>
          </div>

          {toTermId && targetClasses.length === 0 && (
            <p className="hint">ปีปลายทางยังไม่มีห้องเรียน สร้างห้องของปีใหม่ที่หน้า “ห้องเรียน” ก่อน</p>
          )}

          <ul className="record-list">
            {sourceClasses.map((classroom) => {
              const roster = rosterOf.get(classroom.id) ?? [];
              const plan = plans[classroom.id] ?? { kind: 'skip' as const };
              const value = plan.kind === 'move' ? plan.toClassId : plan.kind;
              return (
                <li key={classroom.id}>
                  <div className="record-main">
                    <div>
                      <strong>{classroom.name}</strong>
                      <span>{classroom.gradeLevel} · {roster.length} คน</span>
                    </div>
                    <label className="inline-select">
                      ปลายทาง
                      <select
                        value={value}
                        onChange={(event) => {
                          const next = event.target.value;
                          setPlans((current) => ({
                            ...current,
                            [classroom.id]: next === 'skip' ? { kind: 'skip' }
                              : next === 'graduate' ? { kind: 'graduate' }
                                : { kind: 'move', toClassId: next }
                          }));
                        }}
                      >
                        <option value="skip">ยังไม่ย้าย</option>
                        <option value="graduate">จบการศึกษา</option>
                        {targetClasses.map((target) => (
                          <option key={target.id} value={target.id}>ย้ายไป {target.name}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                </li>
              );
            })}
          </ul>
          {sourceClasses.length === 0 && <p className="hint">ปีต้นทางยังไม่มีห้องเรียนที่ใช้งานอยู่</p>}

          <button className="primary-button" onClick={() => void runPromotion()} disabled={busy || planned === 0}>
            {busy ? 'กำลังดำเนินการ...' : `ดำเนินการเลื่อนชั้น ${planned} คน`}
          </button>
          <p className="hint">การลงทะเบียนเดิมจะถูกปิดเป็น “เลื่อนชั้น” หรือ “จบการศึกษา” ไม่มีการแก้ไขประวัติย้อนหลัง</p>
        </section>
      )}

      {message && <div className="toast" role="status" onClick={() => setMessage(null)}>{message}</div>}
    </>
  );
}
