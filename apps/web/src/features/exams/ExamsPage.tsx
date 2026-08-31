import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSession } from '../../app/SessionContext';
import { useRepository, useSchoolSnapshot } from '../../data/RepositoryContext';
import { activeClasses } from '../../data/selectors';
import {
  Badge, Button, Card, CardHeader, DataTable, EmptyState, ErrorState, Field, PageHeader, Skeleton,
  Stat, Toolbar
} from '../../ui/components';
import {
  composeExam, examQuestionCount, examStateLabels, examStateTone, listExamAttempts, listExams,
  scheduleExam, ExamError,
  type ExamAttemptRow, type ExamRow, type ExamState
} from './exams';
import {
  difficultyLabels, listBankQuestions, listQuestionCategories,
  type BankQuestion, type QuestionCategory
} from '../questions/questionBank';

/**
 * Derived the same way the server derives it, so the list does not claim an exam is open an hour
 * after it closed. The server is still the authority — this only decides what the row looks like.
 */
function stateOf(exam: ExamRow, now = Date.now()): ExamState {
  if (exam.status === 'draft') return 'draft';
  if (exam.status === 'closed') return 'closed';
  if (exam.opensAt && now < Date.parse(exam.opensAt)) return 'scheduled';
  if (exam.closesAt && now > Date.parse(exam.closesAt)) return 'grading';
  return 'open';
}

function forInput(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Exams, from the teacher's side.
 *
 * An exam is built in three steps that are deliberately separate: make it, put questions on it, then
 * open it. Composing refuses once anybody has started, so the paper cannot change under somebody
 * sitting it — which is why scheduling is the last step rather than something set at creation.
 */
export function ExamsPage() {
  const { membership, mode } = useSession();
  const repository = useRepository();
  const snapshot = useSchoolSnapshot();
  const schoolId = membership.schoolId;
  const isStaff = membership.role === 'admin' || membership.role === 'teacher';

  const [exams, setExams] = useState<ExamRow[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<ExamRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const classes = activeClasses(snapshot);
  const subjects = useMemo(
    () => snapshot.subjects.filter((subject) => subject.status === 'active'),
    [snapshot.subjects]
  );

  const load = useCallback(async () => {
    if (mode !== 'cloud' || !isStaff) return;
    setError(null);
    try {
      const rows = await listExams(schoolId);
      setExams(rows);
      const pairs = await Promise.all(rows.map(async (exam) => [exam.id, await examQuestionCount(exam.id)] as const));
      setCounts(Object.fromEntries(pairs));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'โหลดรายการข้อสอบไม่สำเร็จ');
    }
  }, [isStaff, mode, schoolId]);

  useEffect(() => { void load(); }, [load]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await repository.saveTest({
        classId: String(data.get('classId') ?? ''),
        subjectId: String(data.get('subjectId') ?? '') || null,
        title: String(data.get('title') ?? '').trim(),
        testDate: String(data.get('testDate') ?? ''),
        maxScore: Number(data.get('maxScore') ?? 100),
        status: 'draft'
      });
      form.reset();
      setMessage('สร้างข้อสอบเป็นฉบับร่างแล้ว · ขั้นต่อไปคือใส่ข้อสอบจากคลัง');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'สร้างข้อสอบไม่สำเร็จ');
    }
  }

  if (mode !== 'cloud') {
    return (
      <Card>
        <CardHeader title="ข้อสอบ" description="ใช้ได้เฉพาะเมื่อเชื่อมต่อระบบจริง" />
        <EmptyState title="โหมดตัวอย่างไม่มีข้อสอบจริง" description="เวลาเปิด-ปิดข้อสอบใช้นาฬิกาของเซิร์ฟเวอร์" />
      </Card>
    );
  }
  if (!isStaff) {
    return (
      <Card>
        <CardHeader title="ข้อสอบ" />
        <EmptyState title="หน้านี้สำหรับครูและผู้ดูแลโรงเรียน" description="นักเรียนเข้าสอบได้ที่เมนู “สอบ”" />
      </Card>
    );
  }

  if (selected) {
    return (
      <ExamDetail
        exam={selected} schoolId={schoolId}
        questionCount={counts[selected.id] ?? 0}
        onBack={() => { setSelected(null); void load(); }}
        onMessage={setMessage}
      />
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="การวัดผล"
        title="ข้อสอบ"
        description="เปิด-ปิดตามนาฬิกาของเซิร์ฟเวอร์ · ชุดข้อสอบเก็บเป็นสำเนา แก้คลังทีหลังไม่กระทบกระดาษที่สอบไปแล้ว"
      />

      {message && <div className="alert success" role="status">{message}</div>}
      {error && <ErrorState message={error} onRetry={() => void load()} />}

      <Card>
        <CardHeader title="สร้างข้อสอบใหม่" description="สร้างเป็นฉบับร่างก่อน แล้วค่อยใส่ข้อและตั้งเวลา" />
        <form onSubmit={(event) => void create(event)}>
          <Toolbar>
            <Field label="ชื่อข้อสอบ"><input name="title" placeholder="เช่น สอบกลางภาค วิทยาศาสตร์" required /></Field>
            <Field label="ห้องเรียน">
              <select name="classId" required>
                {classes.map((classroom) => <option key={classroom.id} value={classroom.id}>{classroom.name}</option>)}
              </select>
            </Field>
            <Field label="รายวิชา">
              <select name="subjectId">
                <option value="">ไม่ระบุ</option>
                {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
              </select>
            </Field>
            <Field label="วันสอบ">
              <input name="testDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required />
            </Field>
            <Field label="คะแนนเต็ม"><input name="maxScore" type="number" min={1} defaultValue={100} required /></Field>
          </Toolbar>
          <Button variant="primary" disabled={classes.length === 0}>สร้างฉบับร่าง</Button>
          {classes.length === 0 && <p className="field-hint">ยังไม่มีห้องเรียน สร้างห้องเรียนก่อน</p>}
        </form>
      </Card>

      {!exams ? <Skeleton lines={5} /> : (exams.length > 0 ? (
        <Card>
          <CardHeader title="ข้อสอบทั้งหมด" />
          <DataTable head={<tr><th>ชื่อ</th><th>ห้อง</th><th>สถานะ</th><th>จำนวนข้อ</th><th>เปิด</th><th>ปิด</th><th /></tr>}>
            {exams.map((exam) => {
              const state = stateOf(exam);
              const classroom = classes.find((item) => item.id === exam.classId);
              return (
                <tr key={exam.id}>
                  <td>{exam.title}</td>
                  <td>{classroom?.name ?? '—'}</td>
                  <td><Badge tone={examStateTone[state]}>{examStateLabels[state]}</Badge></td>
                  <td>{counts[exam.id] ?? 0}</td>
                  <td>{exam.opensAt ? new Date(exam.opensAt).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                  <td>{exam.closesAt ? new Date(exam.closesAt).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                  <td><Button size="sm" onClick={() => setSelected(exam)}>จัดการ</Button></td>
                </tr>
              );
            })}
          </DataTable>
        </Card>
      ) : <EmptyState title="ยังไม่มีข้อสอบ" description="สร้างฉบับร่างด้านบนเพื่อเริ่ม" />)}
    </>
  );
}

// ---------------------------------------------------------------------------

function ExamDetail({ exam, schoolId, questionCount, onBack, onMessage }: {
  exam: ExamRow; schoolId: string; questionCount: number;
  onBack(): void; onMessage(message: string): void;
}) {
  const [count, setCount] = useState(questionCount);
  const [attempts, setAttempts] = useState<ExamAttemptRow[]>([]);
  const [pool, setPool] = useState<BankQuestion[] | null>(null);
  const [categories, setCategories] = useState<QuestionCategory[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [schedule, setSchedule] = useState({
    opensAt: forInput(exam.opensAt), closesAt: forInput(exam.closesAt),
    durationMinutes: exam.durationMinutes ?? 60, attemptLimit: exam.attemptLimit,
    status: (exam.status === 'closed' ? 'closed' : exam.status === 'draft' ? 'draft' : 'published') as
      'draft' | 'published' | 'closed'
  });

  const refresh = useCallback(async () => {
    try {
      const [rows, total] = await Promise.all([listExamAttempts(exam.id), examQuestionCount(exam.id)]);
      setAttempts(rows);
      setCount(total);
    } catch { /* an exam nobody has sat has no attempts, which is not an error */ }
  }, [exam.id]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      listBankQuestions(schoolId, {
        subjectId: exam.subjectId, categoryId: categoryId || null, status: 'active'
      }, 300),
      listQuestionCategories(schoolId)
    ]).then(([questions, groups]) => {
      if (cancelled) return;
      setPool(questions);
      setCategories(groups.filter((group) => group.status === 'active'));
    }).catch(() => { if (!cancelled) setPool([]); });
    return () => { cancelled = true; };
  }, [categoryId, exam.subjectId, schoolId]);

  const started = attempts.length > 0;

  async function addQuestions() {
    setBusy(true); setError(null);
    try {
      const added = await composeExam(exam.id, chosen);
      setChosen([]);
      onMessage(`ใส่ข้อสอบแล้ว ${added} ข้อ`);
      await refresh();
    } catch (reason) {
      setError(reason instanceof ExamError ? reason.message : 'ใส่ข้อสอบไม่สำเร็จ');
    } finally { setBusy(false); }
  }

  async function applySchedule() {
    setBusy(true); setError(null);
    try {
      const result = await scheduleExam({
        testId: exam.id,
        opensAt: schedule.opensAt ? new Date(schedule.opensAt).toISOString() : null,
        closesAt: schedule.closesAt ? new Date(schedule.closesAt).toISOString() : null,
        durationMinutes: schedule.durationMinutes || null,
        attemptLimit: schedule.attemptLimit,
        status: schedule.status
      });
      onMessage(`บันทึกเวลาสอบแล้ว · สถานะตอนนี้: ${examStateLabels[result.state]}`);
    } catch (reason) {
      setError(reason instanceof ExamError ? reason.message : 'ตั้งเวลาไม่สำเร็จ');
    } finally { setBusy(false); }
  }

  return (
    <>
      <PageHeader
        eyebrow="ข้อสอบ" title={exam.title}
        description={`คะแนนเต็ม ${exam.maxScore} · วันสอบ ${exam.testDate}`}
        action={<Button onClick={onBack}>ย้อนกลับ</Button>}
      />
      {error && <div className="alert error" role="alert">{error}</div>}

      <Card>
        <CardHeader title="ภาพรวม" />
        <div className="stat-row">
          <Stat label="จำนวนข้อ" value={count} tone={count === 0 ? 'warning' : 'brand'} />
          <Stat label="ผู้เข้าสอบ" value={attempts.length} />
          <Stat label="ส่งแล้ว" value={attempts.filter((attempt) => attempt.submittedAt).length} tone="success" />
          <Stat label="สิทธิ์สอบต่อคน" value={exam.attemptLimit} />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="ใส่ข้อสอบจากคลัง"
          description="ระบบจะคัดลอกข้อที่เลือกเก็บไว้กับข้อสอบนี้ แก้คลังทีหลังไม่กระทบ"
        />
        {started ? (
          <div className="alert warning" role="status">
            มีนักเรียนเริ่มสอบไปแล้ว จึงแก้ชุดข้อสอบไม่ได้ — การเปลี่ยนกระดาษระหว่างสอบทำให้ผลของคนที่ทำไปแล้วใช้ไม่ได้
          </div>
        ) : (
          <>
            <Toolbar>
              <Field label="หมวดหมู่">
                <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
                  <option value="">ทุกหมวดหมู่</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>{category.name}</option>
                  ))}
                </select>
              </Field>
              <Button variant="primary" loading={busy} disabled={chosen.length === 0} onClick={() => void addQuestions()}>
                ใส่ {chosen.length} ข้อที่เลือก
              </Button>
            </Toolbar>

            {!pool ? <Skeleton lines={4} /> : (pool.length > 0 ? (
              <ul className="category-list">
                {pool.map((question) => (
                  <li key={question.id}>
                    <label className="checkbox-field">
                      <input
                        type="checkbox" checked={chosen.includes(question.id)}
                        onChange={(event) => setChosen((value) => event.target.checked
                          ? [...value, question.id]
                          : value.filter((id) => id !== question.id))}
                      />
                      <span className="category-main">
                        <strong>{question.prompt}</strong>
                        <span className="fine-print">
                          {difficultyLabels[question.difficulty]} · {question.points} คะแนน
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                title="คลังยังไม่มีข้อที่ตรงกับรายวิชานี้"
                description="เพิ่มคำถามที่เมนู “คลังข้อสอบ” ก่อน"
              />
            ))}
          </>
        )}
      </Card>

      <Card>
        <CardHeader
          title="เวลาสอบ"
          description="เวลาเปิด-ปิดตัดสินที่นาฬิกาของเซิร์ฟเวอร์ ไม่ใช่นาฬิกาเครื่องนักเรียน"
        />
        <Toolbar>
          <Field label="เปิดสอบ">
            <input
              type="datetime-local" value={schedule.opensAt}
              onChange={(event) => setSchedule((value) => ({ ...value, opensAt: event.target.value }))}
            />
          </Field>
          <Field label="ปิดสอบ">
            <input
              type="datetime-local" value={schedule.closesAt}
              onChange={(event) => setSchedule((value) => ({ ...value, closesAt: event.target.value }))}
            />
          </Field>
          <Field label="เวลาทำ (นาที)" hint="เว้นว่าง = ทำได้จนถึงเวลาปิด">
            <input
              type="number" min={1} max={600} value={schedule.durationMinutes}
              onChange={(event) => setSchedule((value) => ({ ...value, durationMinutes: Number(event.target.value) }))}
            />
          </Field>
          <Field label="สอบได้กี่ครั้ง">
            <input
              type="number" min={1} max={20} value={schedule.attemptLimit}
              onChange={(event) => setSchedule((value) => ({ ...value, attemptLimit: Number(event.target.value) }))}
            />
          </Field>
          <Field label="สถานะ">
            <select
              value={schedule.status}
              onChange={(event) => setSchedule((value) => ({
                ...value, status: event.target.value as 'draft' | 'published' | 'closed'
              }))}
            >
              <option value="draft">ฉบับร่าง</option>
              <option value="published">เปิดให้สอบ</option>
              <option value="closed">ปิด</option>
            </select>
          </Field>
        </Toolbar>
        <Button
          variant="primary" loading={busy}
          disabled={count === 0 && schedule.status === 'published'}
          onClick={() => void applySchedule()}
        >
          บันทึกเวลาสอบ
        </Button>
        {count === 0 && schedule.status === 'published' && (
          <p className="field-hint">ยังไม่มีข้อในข้อสอบนี้ ใส่ข้อก่อนจึงจะเปิดให้สอบได้</p>
        )}
      </Card>

      {attempts.length > 0 && (
        <Card>
          <CardHeader title="การเข้าสอบ" description="คะแนนอัตโนมัติมาจากข้อปรนัย ครูตรวจข้ออัตนัยเพิ่มได้ที่หน้าคะแนน" />
          <DataTable head={<tr><th>ครั้งที่</th><th>เริ่ม</th><th>ส่ง</th><th>เหตุที่ปิด</th><th>คะแนนอัตโนมัติ</th></tr>}>
            {attempts.map((attempt) => (
              <tr key={attempt.id}>
                <td>{attempt.attemptNumber}</td>
                <td>{new Date(attempt.startedAt).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                <td>{attempt.submittedAt ? new Date(attempt.submittedAt).toLocaleString('th-TH', { hour: '2-digit', minute: '2-digit' }) : 'ยังไม่ส่ง'}</td>
                <td>{attempt.submittedReason === 'timeout' ? 'หมดเวลา' : attempt.submittedReason === 'student' ? 'นักเรียนส่งเอง' : '—'}</td>
                <td>{attempt.autoScore ?? '—'}</td>
              </tr>
            ))}
          </DataTable>
        </Card>
      )}
    </>
  );
}
