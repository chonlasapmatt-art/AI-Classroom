import { useMemo, useState, type FormEvent } from 'react';
import { useSession } from '../../app/SessionContext';
import { useRepository, useSchoolSnapshot } from '../../data/RepositoryContext';
import type { PromotionMove } from '../../data/schoolRepository';
import type { AcademicTerm } from '../../domain/types';
import {
  Badge, Button, Card, CardHeader, ConfirmDialog, EmptyState, Field, FieldGroup, PageHeader, Stat
} from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { useToast } from '../../ui/toastContext';

/** What happens to one source class when the year turns over. */
type ClassPlan = { kind: 'move'; toClassId: string } | { kind: 'graduate' } | { kind: 'skip' };

const termStatusLabels: Record<'draft' | 'active' | 'closed', string> = {
  draft: 'ร่าง', active: 'ใช้งานอยู่', closed: 'ปิดแล้ว'
};

const termStatusTones: Record<'draft' | 'active' | 'closed', 'neutral' | 'success' | 'info'> = {
  draft: 'neutral', active: 'success', closed: 'info'
};

export function PromotionPage() {
  const { membership } = useSession();
  const repository = useRepository();
  const snapshot = useSchoolSnapshot();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [fromTermId, setFromTermId] = useState('');
  const [toTermId, setToTermId] = useState('');
  const [plans, setPlans] = useState<Record<string, ClassPlan>>({});
  const [confirmRun, setConfirmRun] = useState(false);
  const [confirmActivate, setConfirmActivate] = useState<AcademicTerm | null>(null);

  const canOperate = (membership.role === 'admin' || membership.role === 'teacher') && repository.canManageStructure;
  const activeTerm = snapshot.terms.find((term) => term.status === 'active') ?? snapshot.terms[0] ?? null;
  const sourceTermId = fromTermId || activeTerm?.id || '';
  const sourceClasses = snapshot.classes.filter((row) => row.academicTermId === sourceTermId && row.status === 'active');
  const targetClasses = snapshot.classes.filter((row) => row.academicTermId === toTermId && row.status === 'active');
  const termLabel = (id: string) => {
    const term = snapshot.terms.find((item) => item.id === id);
    return term ? `${term.academicYear}/${term.term}` : '—';
  };

  const rosterOf = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const enrollment of snapshot.enrollments) {
      if (enrollment.status !== 'active' || enrollment.academicTermId !== sourceTermId) continue;
      map.set(enrollment.classId, [...(map.get(enrollment.classId) ?? []), enrollment.studentId]);
    }
    return map;
  }, [snapshot.enrollments, sourceTermId]);

  /*
    Broken out per outcome rather than one total, because "ย้าย 180 คน" and "จบการศึกษา 180 คน" are
    very different things to be about to press, and the button said the same number for both.
  */
  const summary = sourceClasses.reduce((totals, classroom) => {
    const plan = plans[classroom.id] ?? { kind: 'skip' as const };
    const size = rosterOf.get(classroom.id)?.length ?? 0;
    if (plan.kind === 'move') return { ...totals, moving: totals.moving + size };
    if (plan.kind === 'graduate') return { ...totals, graduating: totals.graduating + size };
    return { ...totals, staying: totals.staying + size };
  }, { moving: 0, graduating: 0, staying: 0 });
  const planned = summary.moving + summary.graduating;

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
      toast('บันทึกปีการศึกษาแล้ว');
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : 'บันทึกปีการศึกษาไม่สำเร็จ', { tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function activateTerm(term: AcademicTerm) {
    setConfirmActivate(null);
    try {
      await repository.saveAcademicTerm({
        id: term.id, academicYear: term.academicYear, term: term.term,
        startsOn: term.startsOn, endsOn: term.endsOn, status: 'active'
      });
      toast('เปลี่ยนปีการศึกษาที่ใช้งานแล้ว');
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : 'เปลี่ยนไม่สำเร็จ', { tone: 'error' });
    }
  }

  async function runPromotion() {
    setConfirmRun(false);
    if (!sourceTermId || !toTermId) { toast('เลือกปีการศึกษาต้นทางและปลายทางก่อน'); return; }
    const moves: PromotionMove[] = [];
    for (const classroom of sourceClasses) {
      const plan = plans[classroom.id] ?? { kind: 'skip' as const };
      if (plan.kind === 'skip') continue;
      for (const studentId of rosterOf.get(classroom.id) ?? []) {
        moves.push({ studentId, toClassId: plan.kind === 'move' ? plan.toClassId : null });
      }
    }
    if (moves.length === 0) { toast('ยังไม่ได้เลือกห้องปลายทางให้ห้องใด'); return; }
    setBusy(true);
    try {
      const result = await repository.promoteStudents({
        fromTermId: sourceTermId, toTermId, moves, actorProfileId: membership.profileId
      });
      toast(`เลื่อนชั้น ${result.promoted} คน · จบการศึกษา ${result.graduated} คน · ข้าม ${result.skipped} คน`);
      setPlans({});
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : 'เลื่อนชั้นไม่สำเร็จ', { tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="สิ้นปีการศึกษา"
        title="ปีการศึกษาและการเลื่อนชั้น"
        description="เลือกได้ทีละห้องว่าจะเลื่อนไปห้องใด จบการศึกษา หรือยังไม่ย้าย ประวัติเดิมไม่ถูกแก้ไขย้อนหลัง"
      />

      <div className="ui-stat-grid">
        <Stat label="ปีการศึกษาในระบบ" value={snapshot.terms.length} hint={activeTerm ? `ใช้งานอยู่ ${activeTerm.academicYear}/${activeTerm.term}` : 'ยังไม่มีปีที่ใช้งาน'} tone="brand" icon={<Icon name="calendar" size={18} />} />
        <Stat label="ห้องในปีต้นทาง" value={sourceClasses.length} hint={termLabel(sourceTermId)} tone="info" icon={<Icon name="classes" size={18} />} />
        <Stat label="จะเลื่อนชั้น" value={summary.moving} hint="คนที่มีห้องปลายทางแล้ว" tone={summary.moving > 0 ? 'success' : 'neutral'} icon={<Icon name="promotion" size={18} />} />
        <Stat label="จะจบการศึกษา" value={summary.graduating} hint="ไม่มีห้องในปีถัดไป" tone={summary.graduating > 0 ? 'warning' : 'neutral'} icon={<Icon name="achievements" size={18} />} />
      </div>

      <Card>
        <CardHeader
          title="ปีการศึกษา"
          description="มีปีที่ใช้งานได้ครั้งละหนึ่งปีเท่านั้น การตั้งปีใหม่จะปิดปีเดิมให้เอง"
          action={<Badge tone="neutral">{snapshot.terms.length} รายการ</Badge>}
        />
        {snapshot.terms.length === 0 ? (
          <EmptyState
            icon={<Icon name="calendar" size={28} />}
            title="ยังไม่มีปีการศึกษา"
            description="สร้างปีแรกในการ์ดด้านล่าง แล้วค่อยสร้างห้องเรียนของปีนั้น"
          />
        ) : (
          <ul className="term-list">
            {snapshot.terms.map((term) => (
              <li key={term.id}>
                <div className="term-list-main">
                  <strong>ปีการศึกษา {term.academicYear} · ภาคเรียนที่ {term.term}</strong>
                  <span>{term.startsOn} ถึง {term.endsOn}</span>
                </div>
                <div className="term-list-side">
                  <Badge tone={termStatusTones[term.status]}>{termStatusLabels[term.status]}</Badge>
                  {canOperate && term.status !== 'active' && (
                    <Button variant="secondary" onClick={() => setConfirmActivate(term)}>ตั้งเป็นปีที่ใช้งาน</Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {canOperate && (
        <Card>
          <CardHeader
            title="เปิดปีการศึกษา / ภาคเรียนใหม่"
            description="บันทึกเป็นร่างไว้ก่อนได้ ปีที่เป็นร่างยังไม่กระทบห้องเรียนหรือคะแนนใด ๆ"
          />
          <form onSubmit={(event) => void createTerm(event)}>
            <FieldGroup columns={3}>
              <Field label="ปีการศึกษา"><input name="academicYear" required placeholder="2569" /></Field>
              <Field label="ภาคเรียน"><input name="term" required placeholder="1" /></Field>
              <Field label="สถานะเริ่มต้น" hint="“ใช้งานทันที” จะปิดปีเดิมให้เอง">
                <select name="status" defaultValue="draft">
                  <option value="draft">ร่าง (เตรียมไว้ก่อน)</option>
                  <option value="active">ใช้งานทันที</option>
                </select>
              </Field>
              <Field label="วันเริ่ม"><input name="startsOn" type="date" required /></Field>
              <Field label="วันสิ้นสุด"><input name="endsOn" type="date" required /></Field>
            </FieldGroup>
            <div className="ui-form-actions">
              <Button variant="primary" loading={busy} icon={<Icon name="plus" size={16} />}>บันทึกปีการศึกษา</Button>
            </div>
          </form>
        </Card>
      )}

      {canOperate && (
        <Card>
          <CardHeader
            title="แผนการเลื่อนชั้น"
            description="ตั้งปลายทางให้ทีละห้อง ตรวจสรุปด้านล่าง แล้วจึงดำเนินการครั้งเดียว"
          />
          <FieldGroup columns={2}>
            <Field label="จากปีการศึกษา">
              <select value={sourceTermId} onChange={(event) => { setFromTermId(event.target.value); setPlans({}); }}>
                {snapshot.terms.map((term) => (
                  <option key={term.id} value={term.id}>{term.academicYear}/{term.term}</option>
                ))}
              </select>
            </Field>
            <Field label="ไปยังปีการศึกษา">
              <select value={toTermId} onChange={(event) => { setToTermId(event.target.value); setPlans({}); }}>
                <option value="">เลือกปีปลายทาง</option>
                {snapshot.terms.filter((term) => term.id !== sourceTermId).map((term) => (
                  <option key={term.id} value={term.id}>{term.academicYear}/{term.term}</option>
                ))}
              </select>
            </Field>
          </FieldGroup>

          {toTermId && targetClasses.length === 0 && (
            <EmptyState
              icon={<Icon name="warning" size={28} />}
              title="ปีปลายทางยังไม่มีห้องเรียน"
              description="สร้างห้องของปีใหม่ที่หน้า “ห้องเรียน” ก่อน แล้วกลับมาที่นี่ · ถ้าไม่สร้าง จะเลือกได้เฉพาะ “จบการศึกษา”"
            />
          )}

          {sourceClasses.length === 0 ? (
            <EmptyState
              icon={<Icon name="classes" size={28} />}
              title="ปีต้นทางยังไม่มีห้องเรียนที่ใช้งานอยู่"
              description="เลือกปีต้นทางอื่น หรือเปิดห้องเรียนของปีนั้นก่อน"
            />
          ) : (
            <ul className="promotion-plan-list">
              {sourceClasses.map((classroom) => {
                const roster = rosterOf.get(classroom.id) ?? [];
                const plan = plans[classroom.id] ?? { kind: 'skip' as const };
                const value = plan.kind === 'move' ? plan.toClassId : plan.kind;
                const destination = plan.kind === 'move'
                  ? targetClasses.find((item) => item.id === plan.toClassId)?.name ?? 'ห้องที่เลือก'
                  : null;
                return (
                  <li key={classroom.id}>
                    <div className="promotion-plan-main">
                      <strong>{classroom.name}</strong>
                      <span>{classroom.gradeLevel} · {roster.length} คน</span>
                    </div>
                    <Badge tone={plan.kind === 'move' ? 'success' : plan.kind === 'graduate' ? 'warning' : 'neutral'}>
                      {plan.kind === 'move' ? `ย้ายไป ${destination}` : plan.kind === 'graduate' ? 'จบการศึกษา' : 'ยังไม่ย้าย'}
                    </Badge>
                    <Field label={`ปลายทางของ ${classroom.name}`}>
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
                    </Field>
                  </li>
                );
              })}
            </ul>
          )}

          {sourceClasses.length > 0 && (
            <div className="promotion-summary">
              <p>
                <Icon name="info" size={16} />
                จะเลื่อนชั้น <strong>{summary.moving}</strong> คน · จบการศึกษา <strong>{summary.graduating}</strong> คน ·
                ยังไม่ย้าย <strong>{summary.staying}</strong> คน
              </p>
              <Button
                variant="primary"
                size="lg"
                loading={busy}
                disabled={planned === 0 || !toTermId}
                icon={<Icon name="promotion" size={18} />}
                onClick={() => setConfirmRun(true)}
              >
                ดำเนินการเลื่อนชั้น {planned} คน
              </Button>
            </div>
          )}
        </Card>
      )}

      {/*
        This was window.confirm — the browser's own box, on the largest irreversible write in the
        product, with the consequences squeezed into a string with "\n" in it. It is the shared
        dialog now: focus is trapped, Escape cancels, and the numbers are laid out.
      */}
      {confirmRun && (
        <ConfirmDialog
          title={`เลื่อนชั้นนักเรียน ${planned} คน`}
          description={
            `จาก ${termLabel(sourceTermId)} ไปยัง ${termLabel(toTermId)} · `
            + `เลื่อนชั้น ${summary.moving} คน จบการศึกษา ${summary.graduating} คน ยังไม่ย้าย ${summary.staying} คน · `
            + 'ประวัติเดิม (การเช็กชื่อ คะแนน งาน) จะยังอยู่ครบ การลงทะเบียนเดิมจะถูกปิดเป็น “เลื่อนชั้น” หรือ “จบการศึกษา” '
            + 'และย้อนกลับเป็นชุดเดียวไม่ได้'
          }
          confirmLabel={`ยืนยันเลื่อนชั้น ${planned} คน`}
          tone="warning"
          onCancel={() => setConfirmRun(false)}
          onConfirm={() => void runPromotion()}
        />
      )}

      {confirmActivate && (
        <ConfirmDialog
          title={`ใช้ปีการศึกษา ${confirmActivate.academicYear}/${confirmActivate.term}`}
          description={
            (activeTerm && activeTerm.id !== confirmActivate.id
              ? `ปี ${activeTerm.academicYear}/${activeTerm.term} ที่ใช้งานอยู่จะถูกปิดโดยอัตโนมัติ · `
              : '')
            + 'ทุกหน้าจะเริ่มอ้างถึงปีนี้แทน ข้อมูลของปีเดิมไม่ถูกลบและยังเปิดดูได้'
          }
          confirmLabel="ตั้งเป็นปีที่ใช้งาน"
          tone="brand"
          onCancel={() => setConfirmActivate(null)}
          onConfirm={() => void activateTerm(confirmActivate)}
        />
      )}
    </>
  );
}
