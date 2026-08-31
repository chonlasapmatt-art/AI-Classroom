import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from '../../app/SessionContext';
import { useSchoolSnapshot } from '../../data/RepositoryContext';
import { activeClasses } from '../../data/selectors';
import {
  Badge, Button, Card, CardHeader, DataTable, EmptyState, ErrorState, Field, PageHeader, ProgressBar,
  Segmented, Skeleton, Stat, Toolbar
} from '../../ui/components';
import {
  awardQuizBonus, controlQuiz, createQuizSession, quizBoard, quizResults, recentQuizSessions,
  QuizError, secondsRemaining, selectQuestions, suggestedBonus,
  type QuizBoard, type QuizResults, type QuizSessionSummary, type ScoringMode
} from './quizChallenge';
import {
  difficultyLabels, listBankQuestions, listQuestionCategories,
  type BankQuestion, type QuestionCategory
} from '../questions/questionBank';

const LENGTHS = [5, 10, 15, 20];
const TIMERS: { value: string; label: string }[] = [
  { value: '', label: 'ไม่จับเวลา' }, { value: '10', label: '10 วินาที' },
  { value: '15', label: '15 วินาที' }, { value: '20', label: '20 วินาที' },
  { value: '30', label: '30 วินาที' }, { value: '60', label: '60 วินาที' }
];

/**
 * Quiz Challenge, from the teacher's side.
 *
 * Three states share one screen because they are one activity: choosing what to ask, running the
 * round, and deciding afterwards whether any of it should count. Splitting them across routes would
 * mean a teacher standing in front of a class navigating between pages to see the board.
 */
export function QuizChallengePage() {
  const { membership, mode } = useSession();
  const snapshot = useSchoolSnapshot();
  const schoolId = membership.schoolId;
  const isStaff = membership.role === 'admin' || membership.role === 'teacher';

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [board, setBoard] = useState<QuizBoard | null>(null);
  const [boardReceivedAt, setBoardReceivedAt] = useState(Date.now());
  const [results, setResults] = useState<QuizResults | null>(null);
  const [history, setHistory] = useState<QuizSessionSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refreshHistory = useCallback(async () => {
    if (mode !== 'cloud' || !isStaff) return;
    try { setHistory(await recentQuizSessions(schoolId, 10)); } catch { /* history is a convenience */ }
  }, [isStaff, mode, schoolId]);

  useEffect(() => { void refreshHistory(); }, [refreshHistory]);

  // While a round is on the board the server is the only thing that knows how many have answered,
  // so the board asks again rather than guessing between ticks.
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const next = await quizBoard(sessionId);
        if (cancelled) return;
        setBoard(next); setBoardReceivedAt(Date.now());
        if (next.status === 'ended') setResults(await quizResults(sessionId));
      } catch (reason) {
        if (!cancelled) setError(reason instanceof QuizError ? reason.message : 'โหลดกระดานไม่สำเร็จ');
      }
    };
    void tick();
    const timer = window.setInterval(() => void tick(), 2000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [sessionId]);

  async function command(next: 'start' | 'next' | 'pause' | 'resume' | 'end') {
    if (!sessionId) return;
    setBusy(true); setError(null);
    try { await controlQuiz(sessionId, next); }
    catch (reason) { setError(reason instanceof QuizError ? reason.message : 'สั่งงานไม่สำเร็จ'); }
    finally { setBusy(false); }
  }

  if (mode !== 'cloud') {
    return (
      <Card>
        <CardHeader title="Quiz Challenge" description="ใช้ได้เฉพาะเมื่อเชื่อมต่อระบบจริง" />
        <EmptyState title="โหมดตัวอย่างเล่นกิจกรรมไม่ได้" description="กิจกรรมนี้ต้องมีนักเรียนเข้าร่วมจากเครื่องของตัวเอง" />
      </Card>
    );
  }
  if (!isStaff) {
    return (
      <Card>
        <CardHeader title="Quiz Challenge" />
        <EmptyState title="ครูเป็นผู้เปิดกิจกรรม" description="เมื่อครูเริ่มกิจกรรม ปุ่มเข้าร่วมจะขึ้นที่หน้าภาพรวมของนักเรียนเอง" />
      </Card>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="กิจกรรมในห้องเรียน"
        title="Quiz Challenge"
        description="ทบทวนบทเรียนแบบแข่งกันสั้น ๆ · คะแนนในเกมยังไม่ใช่คะแนนเก็บ จนกว่าครูจะเลือกให้เป็น"
        action={sessionId && (
          <Button onClick={() => { setSessionId(null); setBoard(null); setResults(null); void refreshHistory(); }}>
            กลับไปตั้งค่ากิจกรรมใหม่
          </Button>
        )}
      />

      {message && <div className="alert success" role="status">{message}</div>}
      {error && <ErrorState message={error} onRetry={() => setError(null)} />}

      {!sessionId ? (
        <QuizSetup
          schoolId={schoolId}
          onStarted={(id) => { setSessionId(id); setResults(null); setMessage(null); }}
          onError={setError}
          history={history}
          onOpen={(id) => { setSessionId(id); setResults(null); }}
        />
      ) : (
        <>
          {!board ? <Skeleton lines={6} /> : (
            <TeacherBoard board={board} receivedAt={boardReceivedAt} busy={busy} onCommand={(next) => void command(next)} />
          )}
          {results && (
            <QuizResultsPanel
              results={results}
              onAwarded={(text) => { setMessage(text); void quizResults(results.sessionId).then(setResults); }}
              onError={setError}
            />
          )}
        </>
      )}

      {!sessionId && snapshot.classes.length === 0 && (
        <EmptyState title="ยังไม่มีห้องเรียน" description="สร้างห้องเรียนก่อน แล้วจึงเปิดกิจกรรมให้นักเรียนเข้าร่วม" />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------

function QuizSetup({ schoolId, onStarted, onError, history, onOpen }: {
  schoolId: string;
  onStarted(sessionId: string): void;
  onError(message: string): void;
  history: QuizSessionSummary[];
  onOpen(sessionId: string): void;
}) {
  const snapshot = useSchoolSnapshot();
  const classes = activeClasses(snapshot);
  const subjects = useMemo(
    () => snapshot.subjects.filter((subject) => subject.status === 'active'),
    [snapshot.subjects]
  );

  const [classId, setClassId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [count, setCount] = useState(10);
  const [method, setMethod] = useState<'manual' | 'random' | 'balanced'>('random');
  const [timer, setTimer] = useState('20');
  const [scoringMode, setScoringMode] = useState<ScoringMode>('accuracy');
  const [leaderboardVisible, setLeaderboardVisible] = useState(true);
  const [pool, setPool] = useState<BankQuestion[] | null>(null);
  const [categories, setCategories] = useState<QuestionCategory[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!classId && classes.length > 0) setClassId(classes[0]!.id);
  }, [classId, classes]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      listBankQuestions(schoolId, {
        subjectId: subjectId || null, categoryId: categoryId || null, status: 'active'
      }, 300),
      listQuestionCategories(schoolId)
    ]).then(([questions, groups]) => {
      if (cancelled) return;
      setPool(questions);
      setCategories(groups.filter((group) => group.status === 'active'));
    }).catch(() => { if (!cancelled) setPool([]); });
    return () => { cancelled = true; };
  }, [categoryId, schoolId, subjectId]);

  const preview = useMemo(
    () => pool ? selectQuestions(pool, count, method) : [],
    [count, method, pool]
  );

  async function start() {
    setBusy(true);
    try {
      const created = await createQuizSession({
        schoolId, classId, subjectId: subjectId || null,
        title: subjects.find((subject) => subject.id === subjectId)?.name ?? 'Quiz Challenge',
        questionIds: preview.map((question) => question.id),
        timerSeconds: timer === '' ? null : Number(timer),
        scoringMode, leaderboardVisible
      });
      onStarted(created.sessionId);
    } catch (reason) {
      onError(reason instanceof QuizError ? reason.message : 'เปิดกิจกรรมไม่สำเร็จ');
    } finally { setBusy(false); }
  }

  return (
    <>
      <Card>
        <CardHeader title="ตั้งค่ากิจกรรม" description="เลือกห้อง วิชา และจำนวนข้อ แล้วเริ่มได้เลย ไม่ต้องตั้งค่าแบบข้อสอบจริง" />
        <Toolbar>
          <Field label="ห้องเรียน">
            <select value={classId} onChange={(event) => setClassId(event.target.value)}>
              {classes.map((classroom) => (
                <option key={classroom.id} value={classroom.id}>{classroom.name}</option>
              ))}
            </select>
          </Field>
          <Field label="รายวิชา">
            <select value={subjectId} onChange={(event) => { setSubjectId(event.target.value); setCategoryId(''); }}>
              <option value="">ทุกรายวิชา</option>
              {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
            </select>
          </Field>
          <Field label="หมวดหมู่">
            <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
              <option value="">ทุกหมวดหมู่</option>
              {categories
                .filter((category) => !subjectId || category.subjectId === null || category.subjectId === subjectId)
                .map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </Field>
          <Field label="เวลาต่อข้อ">
            <select value={timer} onChange={(event) => setTimer(event.target.value)}>
              {TIMERS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </Field>
        </Toolbar>

        <Field label="จำนวนข้อ">
          <Segmented
            options={LENGTHS.map((value) => ({ value: String(value), label: `${value} ข้อ` }))}
            value={String(count)} onChange={(value) => setCount(Number(value))} ariaLabel="จำนวนข้อ"
          />
        </Field>

        <Field label="วิธีเลือกข้อ">
          <Segmented
            options={[
              { value: 'manual', label: 'เรียงตามคลัง' },
              { value: 'random', label: 'สุ่มจากคลัง' },
              { value: 'balanced', label: 'สุ่มสมดุลตามความยาก' }
            ]}
            value={method} onChange={setMethod} ariaLabel="วิธีเลือกข้อ"
          />
        </Field>

        <Field label="วิธีให้คะแนน" hint="โหมดเร็วบวกได้มากสุดหนึ่งในสี่ของคะแนนข้อนั้น ตอบเร็วแต่ผิดจึงไม่มีทางชนะตอบช้าแต่ถูก">
          <Segmented
            options={[
              { value: 'accuracy', label: 'ถูกต้องอย่างเดียว' },
              { value: 'speed', label: 'ถูกต้อง + ความเร็ว' }
            ]}
            value={scoringMode} onChange={setScoringMode} ariaLabel="วิธีให้คะแนน"
          />
        </Field>

        <label className="checkbox-field">
          <input
            type="checkbox" checked={leaderboardVisible}
            onChange={(event) => setLeaderboardVisible(event.target.checked)}
          />
          แสดงกระดานคะแนนให้นักเรียนเห็น
        </label>

        {pool === null ? <Skeleton lines={3} /> : (
          <div className="stat-row">
            <Stat label="คำถามในคลังที่ตรงเงื่อนไข" value={pool.length} />
            <Stat
              label="จะใช้ในรอบนี้" value={preview.length}
              tone={preview.length < count ? 'warning' : 'success'}
              hint={preview.length < count ? 'คลังมีไม่พอตามจำนวนที่เลือก' : undefined}
            />
          </div>
        )}

        {preview.length > 0 && (
          <details className="access-code-options">
            <summary>ดูข้อที่จะใช้ ({preview.length} ข้อ)</summary>
            <ol className="changelog compact">
              {preview.map((question) => (
                <li key={question.id}>
                  <div className="changelog-head">
                    <Badge tone="neutral">{difficultyLabels[question.difficulty]}</Badge>
                    <span>{question.prompt}</span>
                  </div>
                </li>
              ))}
            </ol>
          </details>
        )}

        <Button
          variant="primary" loading={busy}
          disabled={!classId || preview.length === 0}
          onClick={() => void start()}
        >
          เปิดกิจกรรมและขึ้นกระดาน
        </Button>
        {pool !== null && pool.length === 0 && (
          <p className="field-hint">คลังข้อสอบยังไม่มีคำถามที่ตรงเงื่อนไขนี้ · เพิ่มคำถามที่เมนู “คลังข้อสอบ” ก่อน</p>
        )}
      </Card>

      {history.length > 0 && (
        <Card>
          <CardHeader title="กิจกรรมล่าสุด" description="เปิดดูผลย้อนหลัง หรือให้คะแนนพิเศษที่ยังไม่ได้ให้" />
          <DataTable head={<tr><th>ชื่อ</th><th>สถานะ</th><th>ข้อ</th><th>ผู้เข้าร่วม</th><th>เมื่อ</th><th /></tr>}>
            {history.map((session) => (
              <tr key={session.sessionId}>
                <td>{session.title}</td>
                <td><Badge tone={session.status === 'ended' ? 'neutral' : 'success'}>{session.status}</Badge></td>
                <td>{session.questionCount}</td>
                <td>{session.participants}</td>
                <td>{new Date(session.createdAt).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                <td><Button size="sm" onClick={() => onOpen(session.sessionId)}>เปิดดู</Button></td>
              </tr>
            ))}
          </DataTable>
        </Card>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------

function TeacherBoard({ board, receivedAt, busy, onCommand }: {
  board: QuizBoard; receivedAt: number; busy: boolean;
  onCommand(command: 'start' | 'next' | 'pause' | 'resume' | 'end'): void;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, []);

  const remaining = secondsRemaining(board.deadline, board.serverTime, receivedAt, now);
  const lastQuestion = board.currentPosition >= board.questionCount;

  return (
    <Card>
      <CardHeader
        title={board.title}
        description={`ข้อ ${board.currentPosition || 0} จาก ${board.questionCount}`}
        action={
          <>
            {board.status === 'lobby' && (
              <Button variant="primary" loading={busy} onClick={() => onCommand('start')}>เริ่มกิจกรรม</Button>
            )}
            {board.status === 'running' && (
              <>
                <Button loading={busy} onClick={() => onCommand('pause')}>พัก</Button>
                <Button variant="primary" loading={busy} onClick={() => onCommand('next')}>
                  {lastQuestion ? 'จบกิจกรรม' : 'ข้อถัดไป'}
                </Button>
              </>
            )}
            {board.status === 'paused' && (
              <Button variant="primary" loading={busy} onClick={() => onCommand('resume')}>เล่นต่อ</Button>
            )}
            {board.status !== 'ended' && (
              <Button variant="danger" loading={busy} onClick={() => onCommand('end')}>จบกิจกรรม</Button>
            )}
          </>
        }
      />

      <div className="stat-row">
        <Stat label="ผู้เข้าร่วม" value={board.participants} />
        <Stat label="ตอบแล้วในข้อนี้" value={board.answered} tone={board.answered >= board.participants && board.participants > 0 ? 'success' : 'brand'} />
        <Stat label="ตอบถูก" value={board.correct} tone="success" />
        <Stat
          label="เวลาที่เหลือ"
          value={remaining === null ? 'ไม่จับเวลา' : `${remaining} วินาที`}
          tone={remaining !== null && remaining <= 5 ? 'danger' : 'neutral'}
        />
      </div>

      {board.participants > 0 && (
        <ProgressBar
          value={board.answered} max={board.participants}
          label={`ตอบแล้ว ${board.answered} จาก ${board.participants} คน`}
        />
      )}

      {board.status === 'lobby' && (
        <EmptyState
          icon="◷"
          title="รอนักเรียนเข้าร่วม"
          description="นักเรียนในห้องนี้จะเห็นปุ่ม “เข้าร่วม” ที่หน้าภาพรวมของตัวเอง ไม่ต้องกรอกรหัสอะไร"
        />
      )}

      {board.question && board.status !== 'lobby' && (
        <div className="quiz-board-question">
          <p className="quiz-prompt">{board.question.prompt}</p>
          <ol className="question-choices">
            {board.question.choices.map((choice) => (
              <li key={choice.id} className={board.question!.answerKey.includes(choice.id) ? 'correct' : ''}>
                <span className="choice-id">{choice.id.toUpperCase()}</span>
                {choice.text}
              </li>
            ))}
          </ol>
          <p className="fine-print">
            เฉลยแสดงเฉพาะบนหน้าจอครู และแสดงเฉพาะข้อที่กำลังเล่นอยู่
          </p>
        </div>
      )}

      {board.leaderboard.length > 0 && (
        <DataTable
          caption={board.leaderboardVisible ? 'กระดานคะแนน' : 'กระดานคะแนน (ซ่อนจากนักเรียน)'}
          head={<tr><th>อันดับ</th><th>ชื่อ</th><th>คะแนน</th><th>ถูก</th><th>ตอบแล้ว</th></tr>}
        >
          {board.leaderboard.slice(0, 10).map((row, index) => (
            <tr key={row.participantId}>
              <td>{index + 1}</td>
              <td>{row.displayName}</td>
              <td>{row.score}</td>
              <td>{row.correct}</td>
              <td>{row.answered}</td>
            </tr>
          ))}
        </DataTable>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------

function QuizResultsPanel({ results, onAwarded, onError }: {
  results: QuizResults; onAwarded(message: string): void; onError(message: string): void;
}) {
  const [awards, setAwards] = useState<Record<string, number>>(() =>
    Object.fromEntries(results.participants.map((row) => [row.studentId ?? row.participantId, suggestedBonus(row.accuracy ?? 0)]))
  );
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const total = Object.values(awards).reduce((sum, points) => sum + points, 0);

  async function award() {
    setBusy(true);
    try {
      const payload = results.participants
        .map((row) => ({ studentId: row.studentId ?? '', points: awards[row.studentId ?? row.participantId] ?? 0 }))
        .filter((entry) => entry.studentId && entry.points !== 0);
      const written = await awardQuizBonus(results.sessionId, payload, reason);
      onAwarded(`ให้คะแนนพิเศษแล้ว ${written.awarded} คน · เข้าสมุดคะแนนตามปกติและตรวจสอบย้อนหลังได้`);
    } catch (reason2) {
      onError(reason2 instanceof QuizError ? reason2.message : 'ให้คะแนนพิเศษไม่สำเร็จ');
    } finally { setBusy(false); }
  }

  return (
    <Card>
      <CardHeader
        title="ผลกิจกรรม"
        description="คะแนนในเกมยังไม่ใช่คะแนนเก็บ · เลือกให้คะแนนพิเศษได้ที่นี่ครั้งเดียว"
      />

      <DataTable
        caption="คำถามที่ตอบถูกน้อยที่สุดควรเอาไปทบทวนต่อ"
        head={<tr><th>ข้อ</th><th>คำถาม</th><th>ตอบ</th><th>ถูก</th><th>อัตราถูก</th></tr>}
      >
        {[...results.questions].sort((a, b) => (a.answered === 0 ? 1 : a.correct / a.answered) - (b.answered === 0 ? 1 : b.correct / b.answered)).map((question) => (
          <tr key={question.position}>
            <td>{question.position}</td>
            <td>{question.prompt}</td>
            <td>{question.answered}</td>
            <td>{question.correct}</td>
            <td>{question.answered === 0 ? '—' : `${Math.round((question.correct / question.answered) * 100)}%`}</td>
          </tr>
        ))}
      </DataTable>

      {results.bonusAwarded ? (
        <div className="alert success" role="status">
          ให้คะแนนพิเศษของกิจกรรมนี้ไปแล้ว ดูได้ที่หน้าคะแนน
        </div>
      ) : (
        <>
          <DataTable
            caption="คะแนนพิเศษที่จะให้ · แก้ตัวเลขได้ทุกคน"
            head={<tr><th>ชื่อ</th><th>คะแนนในเกม</th><th>ตอบถูก</th><th>คะแนนพิเศษ</th></tr>}
          >
            {results.participants.map((row) => {
              const key = row.studentId ?? row.participantId;
              return (
                <tr key={row.participantId}>
                  <td>{row.displayName}</td>
                  <td>{row.score}</td>
                  <td>{row.correct} / {results.questionCount}</td>
                  <td>
                    <input
                      type="number" min={0} max={10} step={1} value={awards[key] ?? 0}
                      onChange={(event) => setAwards((value) => ({ ...value, [key]: Number(event.target.value) }))}
                      aria-label={`คะแนนพิเศษของ ${row.displayName}`}
                    />
                  </td>
                </tr>
              );
            })}
          </DataTable>

          <Field label="เหตุผล" hint="บันทึกไว้ในประวัติคะแนนของนักเรียน">
            <input
              value={reason} placeholder={`คะแนนพิเศษจาก ${results.title}`}
              onChange={(event) => setReason(event.target.value)}
            />
          </Field>

          <Button variant="primary" loading={busy} disabled={total === 0} onClick={() => void award()}>
            ให้คะแนนพิเศษรวม {total} คะแนน
          </Button>
          <p className="fine-print">
            ให้ได้ครั้งเดียวต่อกิจกรรม · คะแนนเข้าสมุดคะแนนผ่านทางเดียวกับการให้คะแนนปกติ พร้อมเหตุผลและผู้ให้
          </p>
        </>
      )}
    </Card>
  );
}
