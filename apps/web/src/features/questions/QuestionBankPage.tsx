import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from '../../app/SessionContext';
import { useSchoolSnapshot } from '../../data/RepositoryContext';
import {
  Badge, Button, Card, CardHeader, EmptyState, ErrorState, Field, PageHeader, Skeleton, Stat, Toolbar
} from '../../ui/components';
import { QuestionEditor } from './QuestionEditor';
import { teacherOwnedSubjectIds } from '../../data/teacherResponsibilities';
import {
  archiveBankQuestion, difficultyLabels, difficultyTone, duplicateDraft, emptyDraft,
  listBankQuestions, listQuestionCategories, questionTypeLabels, reorderQuestionCategories,
  saveBankQuestion, saveQuestionCategory, setQuestionCategoryStatus, toDraft,
  type BankQuestion, type Difficulty, type QuestionCategory, type QuestionDraft, type QuestionFilter,
  type QuestionType
} from './questionBank';

/**
 * The question bank.
 *
 * Two things share the screen because they are used together: the questions, and the categories they
 * are filed under. A teacher who cannot find last term's questions is usually looking at a category
 * somebody named differently, and sending them to a separate screen to fix that is how a bank ends
 * up with four spellings of one topic.
 */
export function QuestionBankPage() {
  const { membership } = useSession();
  const snapshot = useSchoolSnapshot();
  const schoolId = membership.schoolId;
  const isStaff = membership.role === 'admin' || membership.role === 'teacher';

  const [questions, setQuestions] = useState<BankQuestion[] | null>(null);
  const [categories, setCategories] = useState<QuestionCategory[]>([]);
  const [filter, setFilter] = useState<QuestionFilter>({ status: 'active' });
  const [keyword, setKeyword] = useState('');
  const [draft, setDraft] = useState<QuestionDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showCategories, setShowCategories] = useState(false);

  const subjects = useMemo(
    () => [...snapshot.subjects].filter((subject) => subject.status === 'active')
      .sort((a, b) => a.sortOrder - b.sortOrder),
    [snapshot.subjects]
  );
  const ownedSubjectIds = teacherOwnedSubjectIds(snapshot, membership.profileId);
  const editableSubjects = membership.role === 'teacher'
    ? subjects.filter((subject) => ownedSubjectIds.has(subject.id))
    : subjects;
  const canEditBank = membership.role === 'admin' || editableSubjects.length > 0;

  const load = useCallback(async () => {
    if (!isStaff) return;
    setError(null);
    try {
      const [rows, groups] = await Promise.all([
        listBankQuestions(schoolId, { ...filter, keyword }),
        listQuestionCategories(schoolId)
      ]);
      setQuestions(rows);
      setCategories(groups);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'โหลดคลังข้อสอบไม่สำเร็จ');
    }
  }, [filter, isStaff, keyword, schoolId]);

  useEffect(() => {
    // Typing in the search box should not fire a query per keystroke.
    const timer = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function save() {
    if (!draft) return;
    if (membership.role === 'teacher' && (!draft.subjectId || !ownedSubjectIds.has(draft.subjectId))) {
      // The server remains authoritative; this message prevents a confusing round trip in preview.
      setEditorError('เลือกได้เฉพาะรายวิชาที่คุณเป็นครูเจ้าของวิชา');
      return;
    }
    setBusy(true); setEditorError(null);
    try {
      await saveBankQuestion(schoolId, draft);
      setMessage(draft.id ? 'บันทึกการแก้ไขแล้ว' : 'เพิ่มคำถามใหม่แล้ว');
      setDraft(null);
      await load();
    } catch (reason) {
      setEditorError(reason instanceof Error ? reason.message : 'บันทึกคำถามไม่สำเร็จ');
    } finally { setBusy(false); }
  }

  async function archive(question: BankQuestion) {
    if (!window.confirm(
      `เก็บคำถามนี้เข้าคลังเก่า\n\n${question.prompt}\n\n` +
      'ข้อสอบและกิจกรรมที่ใช้คำถามนี้ไปแล้วไม่กระทบ · เลือกดู “เก็บแล้ว” เพื่อเรียกกลับมาได้'
    )) return;
    try {
      await archiveBankQuestion(question.id);
      setMessage('เก็บคำถามเข้าคลังเก่าแล้ว');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'เก็บคำถามไม่สำเร็จ');
    }
  }

  if (!isStaff) {
    return (
      <Card>
        <CardHeader title="คลังข้อสอบ" />
        <EmptyState
          title="หน้านี้สำหรับครูและผู้ดูแลโรงเรียน"
          description="คลังข้อสอบเก็บเฉลยไว้ด้วย จึงเปิดให้เฉพาะบุคลากรของโรงเรียน"
        />
      </Card>
    );
  }

  const counts = {
    total: questions?.length ?? 0,
    easy: questions?.filter((question) => question.difficulty === 'easy').length ?? 0,
    medium: questions?.filter((question) => question.difficulty === 'medium').length ?? 0,
    hard: questions?.filter((question) => question.difficulty === 'hard').length ?? 0
  };

  return (
    <>
      <PageHeader
        eyebrow="คลังข้อสอบ"
        title="คลังข้อสอบ"
        description="เก็บคำถามไว้ใช้ซ้ำ ทั้งกิจกรรมทบทวนและข้อสอบจริง"
        action={
          <>
            {canEditBank && <Button onClick={() => setShowCategories((value) => !value)}>
              {showCategories ? 'ซ่อนหมวดหมู่' : 'จัดการหมวดหมู่'}
            </Button>}
            {canEditBank && <Button variant="primary" onClick={() => { setEditorError(null); setDraft(emptyDraft(filter.subjectId ?? editableSubjects[0]?.id ?? null)); }}>
              เพิ่มคำถาม
            </Button>}
          </>
        }
      />

      {message && <div className="alert success" role="status">{message}</div>}
      {error && <ErrorState message={error} onRetry={() => void load()} />}

      {showCategories && (
        <CategoryManager
          schoolId={schoolId}
          categories={categories}
          subjects={editableSubjects}
          onChanged={() => void load()}
          onMessage={setMessage}
        />
      )}

      <Card>
        <CardHeader title="ค้นหาและจัดหมวด" description="กรองและเก็บคำถามตามลำดับ ชั้นปี → รายวิชา → Topic ย่อย พร้อมบันทึกลงคลังของโรงเรียน" />
        <Toolbar>
          <Field label="คำค้น">
            <input
              value={keyword} placeholder="คำในโจทย์ เรื่อง หรือหน่วยการเรียน"
              onChange={(event) => setKeyword(event.target.value)}
            />
          </Field>
          <Field label="รายวิชา">
            <select
              value={filter.subjectId ?? ''}
              onChange={(event) => setFilter((value) => ({
                ...value, subjectId: event.target.value || null, categoryId: null
              }))}
            >
              <option value="">ทุกรายวิชา</option>
              {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
            </select>
          </Field>
          <Field label="ชั้นปี">
            <input
              list="question-grade-levels"
              value={filter.gradeLevel ?? ''}
              placeholder="เช่น ป.4 หรือ ม.1"
              onChange={(event) => setFilter((value) => ({ ...value, gradeLevel: event.target.value || null }))}
            />
            <datalist id="question-grade-levels">
              {[...new Set([
                ...snapshot.classes.map((classroom) => classroom.gradeLevel),
                ...(questions ?? []).map((question) => question.gradeLevel)
              ].filter(Boolean))].sort().map((grade) => <option key={grade} value={grade} />)}
            </datalist>
          </Field>
          <Field label="Topic ย่อย">
            <input
              value={filter.topic ?? ''}
              placeholder="เช่น เศษส่วน หรือ เซลล์"
              onChange={(event) => setFilter((value) => ({ ...value, topic: event.target.value || null }))}
            />
          </Field>
          <Field label="หมวดหมู่">
            <select
              value={filter.categoryId ?? ''}
              onChange={(event) => setFilter((value) => ({ ...value, categoryId: event.target.value || null }))}
            >
              <option value="">ทุกหมวดหมู่</option>
              {categories
                .filter((category) => !filter.subjectId || category.subjectId === null || category.subjectId === filter.subjectId)
                .map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}{category.status === 'archived' ? ' (เก็บแล้ว)' : ''}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="ความยาก">
            <select
              value={filter.difficulty ?? ''}
              onChange={(event) => setFilter((value) => ({
                ...value, difficulty: (event.target.value || null) as Difficulty | null
              }))}
            >
              <option value="">ทุกระดับ</option>
              {Object.entries(difficultyLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </Field>
          <Field label="ชนิดคำถาม">
            <select
              value={filter.questionType ?? ''}
              onChange={(event) => setFilter((value) => ({
                ...value, questionType: (event.target.value || null) as QuestionType | null
              }))}
            >
              <option value="">ทุกชนิด</option>
              {Object.entries(questionTypeLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </Field>
          <Field label="สถานะ">
            <select
              value={filter.status ?? 'active'}
              onChange={(event) => setFilter((value) => ({
                ...value, status: event.target.value as 'active' | 'archived'
              }))}
            >
              <option value="active">ใช้งานอยู่</option>
              <option value="archived">เก็บแล้ว</option>
            </select>
          </Field>
        </Toolbar>

        <div className="stat-row">
          <Stat label="คำถามที่ตรงเงื่อนไข" value={counts.total} />
          <Stat label="ง่าย" value={counts.easy} tone="success" />
          <Stat label="ปานกลาง" value={counts.medium} tone="warning" />
          <Stat label="ยาก" value={counts.hard} tone="danger" />
        </div>
      </Card>

      {!questions ? <Skeleton lines={6} /> : (questions.length > 0 ? (
        <div className="question-list">
          {questions.map((question) => {
            const subject = subjects.find((item) => item.id === question.subjectId);
            const category = categories.find((item) => item.id === question.categoryId);
            const canEditQuestion = membership.role === 'admin' || (membership.role === 'teacher' && Boolean(question.subjectId && ownedSubjectIds.has(question.subjectId)));
            return (
              <Card key={question.id} as="article">
                <div className="question-head">
                  <Badge tone={difficultyTone[question.difficulty]}>{difficultyLabels[question.difficulty]}</Badge>
                  <Badge tone="neutral">{questionTypeLabels[question.questionType]}</Badge>
                  {subject && <Badge tone="info">{subject.name}</Badge>}
                  {category && <Badge tone="brand">{category.name}</Badge>}
                  {question.gradeLevel && <Badge tone="neutral">ชั้นปี: {question.gradeLevel}</Badge>}
                  {question.topic && <Badge tone="neutral">Topic: {question.topic}</Badge>}
                  <span className="fine-print">{question.points} คะแนน</span>
                </div>
                <p className="question-prompt">{question.prompt}</p>
                {(question.unit || question.topic) && (
                  <p className="fine-print">เส้นทางคลัง: {question.gradeLevel || 'ไม่ระบุชั้นปี'} · {subject?.name || 'ไม่ระบุวิชา'} · {question.unit ? `${question.unit} · ` : ''}{question.topic || 'ไม่ระบุ Topic'}</p>
                )}
                {question.choices.length > 0 && (
                  <ol className="question-choices">
                    {question.choices.map((choice) => (
                      <li key={choice.id} className={question.answerKey.includes(choice.id) ? 'correct' : ''}>
                        <span className="choice-id">{choice.id.toUpperCase()}</span>
                        {choice.text}
                      </li>
                    ))}
                  </ol>
                )}
                {question.questionType === 'short_answer' && (
                  <p className="fine-print">คำตอบที่ยอมรับ: {question.answerKey.join(' · ') || '—'}</p>
                )}
                {question.tags.length > 0 && (
                  <p className="fine-print">ป้ายกำกับ: {question.tags.join(' · ')}</p>
                )}
                <div className="record-actions">
                  {canEditQuestion && <Button size="sm" onClick={() => { setEditorError(null); setDraft(toDraft(question)); }}>แก้ไข</Button>}
                  {canEditQuestion && <Button size="sm" onClick={() => { setEditorError(null); setDraft(duplicateDraft(question)); }}>ทำสำเนา</Button>}
                  {canEditQuestion && question.status === 'active' && (
                    <Button size="sm" variant="ghost" onClick={() => void archive(question)}>เก็บเข้าคลังเก่า</Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon="✎"
          title={filter.status === 'archived' ? 'ไม่มีคำถามที่เก็บไว้' : 'ยังไม่มีคำถามที่ตรงเงื่อนไข'}
          description="ลองล้างตัวกรอง หรือกด “เพิ่มคำถาม” เพื่อเริ่มสร้างคลังของโรงเรียน"
          action={canEditBank && <Button variant="primary" onClick={() => setDraft(emptyDraft(filter.subjectId ?? editableSubjects[0]?.id ?? null))}>เพิ่มคำถาม</Button>}
        />
      ))}

      {draft && (
        <QuestionEditor
          draft={draft} subjects={editableSubjects} categories={categories}
          onChange={setDraft} onSave={() => void save()} onClose={() => setDraft(null)}
          busy={busy} error={editorError}
        />
      )}
    </>
  );
}

/**
 * Categories, managed where they are used.
 *
 * Reordering is by moving one step at a time rather than by dragging: this screen is used on a
 * classroom tablet as often as on a laptop, and a drag target that works with a mouse is a coin toss
 * with a finger.
 */
function CategoryManager({ schoolId, categories, subjects, onChanged, onMessage }: {
  schoolId: string;
  categories: QuestionCategory[];
  subjects: { id: string; name: string }[];
  onChanged(): void;
  onMessage(message: string): void;
}) {
  const [name, setName] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ordered = [...categories].sort((a, b) => a.position - b.position);

  async function run(work: () => Promise<void>, success: string) {
    setBusy(true); setError(null);
    try { await work(); onMessage(success); onChanged(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'ดำเนินการไม่สำเร็จ'); }
    finally { setBusy(false); }
  }

  async function move(category: QuestionCategory, direction: -1 | 1) {
    const index = ordered.findIndex((item) => item.id === category.id);
    const swapWith = index + direction;
    if (swapWith < 0 || swapWith >= ordered.length) return;
    const next = [...ordered];
    [next[index], next[swapWith]] = [next[swapWith]!, next[index]!];
    await run(
      () => reorderQuestionCategories(schoolId, next.map((item) => item.id)),
      'จัดลำดับหมวดหมู่แล้ว'
    );
  }

  return (
    <Card>
      <CardHeader
        title="หมวดหมู่ในคลัง"
        description="เปลี่ยนชื่อที่นี่แล้วเปลี่ยนทุกที่ที่ใช้ · เก็บหมวดหมู่ได้โดยคำถามเดิมไม่หาย"
      />
      {error && <div className="alert error" role="alert">{error}</div>}
      <Toolbar>
        <Field label="ชื่อหมวดหมู่ใหม่">
          <input value={name} placeholder="เช่น ระบบสุริยะ" onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field label="รายวิชา" hint="เว้นว่างไว้ = ใช้ได้ทุกรายวิชา">
          <select value={subjectId} onChange={(event) => setSubjectId(event.target.value)}>
            <option value="">ทุกรายวิชา</option>
            {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
          </select>
        </Field>
        <Button
          variant="primary" loading={busy} disabled={name.trim().length < 1}
          onClick={() => void run(async () => {
            await saveQuestionCategory({ schoolId, subjectId: subjectId || null, name });
            setName('');
          }, 'เพิ่มหมวดหมู่แล้ว')}
        >
          เพิ่มหมวดหมู่
        </Button>
      </Toolbar>

      {ordered.length === 0 ? (
        <EmptyState
          title="ยังไม่มีหมวดหมู่"
          description="เช่น คณิตศาสตร์: จำนวน · การบวก · เศษส่วน · เรขาคณิต — สร้างได้ไม่จำกัดจำนวน"
        />
      ) : (
        <ul className="category-list">
          {ordered.map((category, index) => (
            <li key={category.id} className={category.status === 'archived' ? 'archived' : ''}>
              <div className="category-main">
                <strong>{category.name}</strong>
                <span className="fine-print">
                  {category.subjectId
                    ? subjects.find((subject) => subject.id === category.subjectId)?.name ?? 'รายวิชาที่ถูกลบ'
                    : 'ทุกรายวิชา'}
                  {category.status === 'archived' && ' · เก็บแล้ว'}
                </span>
              </div>
              <div className="category-actions">
                <Button size="sm" variant="ghost" disabled={busy || index === 0} onClick={() => void move(category, -1)} aria-label="เลื่อนขึ้น">↑</Button>
                <Button size="sm" variant="ghost" disabled={busy || index === ordered.length - 1} onClick={() => void move(category, 1)} aria-label="เลื่อนลง">↓</Button>
                <Button
                  size="sm" disabled={busy}
                  onClick={() => {
                    const next = window.prompt('เปลี่ยนชื่อหมวดหมู่', category.name);
                    if (next === null || next.trim() === '') return;
                    void run(
                      async () => {
                        await saveQuestionCategory({
                          schoolId, categoryId: category.id, subjectId: category.subjectId, name: next
                        });
                      },
                      'เปลี่ยนชื่อหมวดหมู่แล้ว'
                    );
                  }}
                >
                  เปลี่ยนชื่อ
                </Button>
                <Button
                  size="sm" variant="ghost" disabled={busy}
                  onClick={() => void run(
                    () => setQuestionCategoryStatus(category.id, category.status === 'active' ? 'archived' : 'active'),
                    category.status === 'active' ? 'เก็บหมวดหมู่แล้ว' : 'เรียกหมวดหมู่กลับมาแล้ว'
                  )}
                >
                  {category.status === 'active' ? 'เก็บ' : 'เรียกกลับ'}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
