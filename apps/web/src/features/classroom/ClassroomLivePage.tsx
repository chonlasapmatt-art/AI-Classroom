import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from '../../app/SessionContext';
import { useRepository, useSchoolSnapshot } from '../../data/RepositoryContext';
import { activeClasses, rosterFor } from '../../data/selectors';
import { teacherOwnedSubjectIds } from '../../data/teacherResponsibilities';
import type { AchievementKey, Student } from '../../domain/types';
import { Icon } from '../../ui/Icon';
import { Badge, Button, Card, EmptyState, PageHeader } from '../../ui/components';
import { ProfileAvatar } from '../avatars/ProfileAvatar';
import { achievementCatalog } from '../achievements/achievementCatalog';
import { listBankQuestions, type BankQuestion } from '../questions/questionBank';
import {
  formatCountdown, pickNextIndex, pickNextStudent, splitIntoTeams, teamCountOptions, teamName, xpPresets
} from './classroomGames';

type Tool = 'pick' | 'teams' | 'question' | 'timer';

const toolLabels: Record<Tool, string> = {
  pick: 'สุ่มชื่อ', teams: 'สุ่มทีม', question: 'สุ่มคำถาม', timer: 'จับเวลา'
};

const timerPresets = [30, 60, 120, 300];

/** How long the celebration stays up. Long enough for a room to read it, short enough to teach past. */
const CELEBRATION_MS = 5000;

interface Celebration { title: string; detail: string; icon: string }

/**
 * The board a teacher runs the room from.
 *
 * Everything here is one tap away from the front of a classroom, because that is the only place it
 * is used: a teacher standing up, a class watching a screen, thirty seconds to keep the room with
 * them. So the tools are stateless between lessons — a pick order is not worth a database row — and
 * the one thing that is worth keeping, points and badges, is written through the same audited path
 * as any other award. Nothing on this screen writes a mark: XP from the board is participation, and
 * turning that into a subject grade stays a separate, deliberate act on the score screens.
 */
export function ClassroomLivePage() {
  const { membership } = useSession();
  const repository = useRepository();
  const snapshot = useSchoolSnapshot();
  const classes = activeClasses(snapshot);
  const isStaff = membership.role === 'admin' || membership.role === 'teacher';

  const [tool, setTool] = useState<Tool>('pick');
  const [classId, setClassId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [points, setPoints] = useState<number>(2);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [celebration, setCelebration] = useState<Celebration | null>(null);

  const selectedClassId = classId || classes[0]?.id || '';
  const roster = useMemo(() => rosterFor(snapshot, selectedClassId), [snapshot, selectedClassId]);
  const subjects = useMemo(() => {
    if (membership.role !== 'teacher') return snapshot.subjects.filter((item) => item.status === 'active');
    const owned = teacherOwnedSubjectIds(snapshot, membership.profileId, selectedClassId);
    return snapshot.subjects.filter((item) => item.status === 'active' && owned.has(item.id));
  }, [membership.profileId, membership.role, selectedClassId, snapshot]);

  // Picker state. Deliberately not persisted: a pick order that outlives the lesson is a promise the
  // product cannot keep once a student is absent, and a class can see for itself whose turn it was.
  const [picked, setPicked] = useState<string[]>([]);
  const [current, setCurrent] = useState<Student | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [teams, setTeams] = useState<string[][]>([]);
  const [teamCount, setTeamCount] = useState(3);

  const [questions, setQuestions] = useState<BankQuestion[] | null>(null);
  const [questionError, setQuestionError] = useState<string | null>(null);
  const [usedQuestions, setUsedQuestions] = useState<number[]>([]);
  const [questionIndex, setQuestionIndex] = useState<number | null>(null);
  const [answerShown, setAnswerShown] = useState(false);

  const [seconds, setSeconds] = useState(60);
  const [remaining, setRemaining] = useState(60);
  const [running, setRunning] = useState(false);

  const studentsById = useMemo(() => new Map(roster.map((student) => [student.id, student])), [roster]);

  // A different room is a different round; carrying picks or teams across would put a name on the
  // board that is not in front of the teacher any more.
  useEffect(() => { setPicked([]); setCurrent(null); setTeams([]); }, [selectedClassId]);

  useEffect(() => {
    if (!celebration) return;
    const timer = window.setTimeout(() => setCelebration(null), CELEBRATION_MS);
    return () => window.clearTimeout(timer);
  }, [celebration]);

  useEffect(() => {
    if (!running) return;
    const tick = window.setInterval(() => {
      setRemaining((value) => {
        if (value <= 1) { setRunning(false); return 0; }
        return value - 1;
      });
    }, 1000);
    return () => window.clearInterval(tick);
  }, [running]);

  const loadQuestions = useCallback(async () => {
    setQuestionError(null);
    try {
      const rows = await listBankQuestions(membership.schoolId, {
        status: 'active', ...(subjectId ? { subjectId } : {})
      }, 100);
      setQuestions(rows);
      setQuestionIndex(null);
      setUsedQuestions([]);
      setAnswerShown(false);
    } catch (reason) {
      setQuestions([]);
      setQuestionError(reason instanceof Error ? reason.message : 'โหลดคลังข้อสอบไม่สำเร็จ');
    }
  }, [membership.schoolId, subjectId]);

  useEffect(() => { if (tool === 'question') void loadQuestions(); }, [loadQuestions, tool]);

  function spin() {
    if (roster.length === 0 || spinning) return;
    setSpinning(true);
    // The wheel is 700ms of names moving, not a result appearing out of nothing: a class that cannot
    // see the draw happen does not believe it happened.
    const shuffleTimer = window.setInterval(() => {
      const preview = roster[Math.floor(Math.random() * roster.length)] ?? null;
      setCurrent(preview);
    }, 70);
    window.setTimeout(() => {
      window.clearInterval(shuffleTimer);
      const result = pickNextStudent(roster.map((student) => student.id), picked);
      setPicked(result.picked);
      setCurrent(result.studentId ? studentsById.get(result.studentId) ?? null : null);
      setSpinning(false);
      if (result.roundRestarted) setMessage('ครบทุกคนแล้ว เริ่มรอบใหม่');
    }, 700);
  }

  async function award(studentIds: string[], reason: string) {
    if (!isStaff || studentIds.length === 0 || busy) return;
    setBusy(true);
    try {
      for (const studentId of studentIds) {
        await repository.awardScoreEvent({
          studentId, classId: selectedClassId, subjectId: subjectId || null,
          category: 'participation', points, reason, sourceType: 'board',
          awardedBy: membership.profileId
        });
      }
      setMessage(`ให้ ${points} XP · ${studentIds.length} คน · ${reason}`);
      setCelebration({
        title: `+${points} XP`,
        detail: studentIds.length === 1
          ? `${studentsById.get(studentIds[0]!)?.displayName ?? 'นักเรียน'} · ${reason}`
          : `${studentIds.length} คน · ${reason}`,
        icon: '⚡'
      });
    } catch (reason_) {
      setMessage(reason_ instanceof Error ? reason_.message : 'ให้คะแนนไม่สำเร็จ');
    } finally { setBusy(false); }
  }

  async function awardBadge(studentId: string, key: AchievementKey) {
    const badge = achievementCatalog.find((item) => item.key === key);
    if (!badge || !isStaff || busy) return;
    setBusy(true);
    try {
      await repository.awardAchievement({
        studentId, achievementKey: badge.key, note: `มอบจากกิจกรรมหน้าชั้น · ${toolLabels[tool]}`,
        awardedBy: membership.profileId
      });
      setCelebration({
        title: badge.label,
        detail: `${studentsById.get(studentId)?.displayName ?? 'นักเรียน'} · ${badge.description}`,
        icon: badge.icon
      });
      setMessage(`มอบเหรียญ "${badge.label}" แล้ว`);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'มอบเหรียญไม่สำเร็จ');
    } finally { setBusy(false); }
  }

  const today = new Date().toISOString().slice(0, 10);
  const boardAwards = useMemo(() => snapshot.scoreEvents
    .filter((event) => event.sourceType === 'board' && event.occurredAt.slice(0, 10) === today)
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
    .slice(0, 8), [snapshot.scoreEvents, today]);

  if (!isStaff) {
    return (
      <EmptyState icon={<Icon name="achievements" size={28} />} title="กิจกรรมหน้าชั้นเปิดให้ครูและผู้ดูแล"
        description="นักเรียนเข้าร่วมกิจกรรมได้จากหน้าคะแนนและเหรียญรางวัลของตนเอง" />
    );
  }

  const question = questionIndex === null ? null : questions?.[questionIndex] ?? null;

  return (
    <>
      <PageHeader eyebrow="ห้องเรียนสด" title="กิจกรรมหน้าชั้น"
        description="สุ่มชื่อ แบ่งทีม สุ่มคำถาม และให้คะแนนหน้าชั้นเรียน · คะแนนที่ให้จากหน้านี้เป็นคะแนนการมีส่วนร่วม ไม่ใช่คะแนนเก็บของวิชา" />

      <div className="toolbar classroom-toolbar">
        <label>ห้องเรียน
          <select value={selectedClassId} onChange={(event) => setClassId(event.target.value)}>
            {classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label>วิชา
          <select value={subjectId} onChange={(event) => setSubjectId(event.target.value)}>
            <option value="">ไม่ระบุวิชา</option>
            {subjects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <fieldset className="classroom-xp">
          <legend>แต้มต่อครั้ง</legend>
          <div className="segmented">
            {xpPresets.map((value) => (
              <button key={value} type="button" className={points === value ? 'active' : ''}
                aria-pressed={points === value} onClick={() => setPoints(value)}>+{value} XP</button>
            ))}
          </div>
        </fieldset>
        <div className="sync-pill online"><span />{roster.length} คนในห้อง</div>
      </div>

      <div className="ui-tabs classroom-tabs" role="tablist" aria-label="เครื่องมือหน้าชั้น">
        {(Object.keys(toolLabels) as Tool[]).map((key) => (
          <button key={key} role="tab" type="button" aria-selected={tool === key}
            className={tool === key ? 'active' : ''} onClick={() => setTool(key)}>{toolLabels[key]}</button>
        ))}
      </div>

      {roster.length === 0 ? (
        <EmptyState icon={<Icon name="students" size={28} />} title="ยังไม่มีนักเรียนในห้องนี้"
          description="เพิ่มนักเรียนหรือย้ายเข้าห้องก่อนเริ่มกิจกรรม" />
      ) : tool === 'pick' ? (
        <Card className="classroom-stage">
          <div className={`classroom-spotlight ${spinning ? 'spinning' : ''}`} aria-live="polite">
            {current ? (
              <>
                <ProfileAvatar displayName={current.displayName} avatarId={current.avatarId}
                  avatarPhotoId={current.avatarPhotoId} avatarIndex={current.avatarIndex}
                  avatarConfig={current.avatarConfig} size={112} animation={spinning ? 'idle' : 'wave'} />
                <strong>{current.displayName}</strong>
                <span>{current.studentCode}</span>
              </>
            ) : (
              <>
                <div className="classroom-spotlight-empty" aria-hidden="true">?</div>
                <strong>กดสุ่มเพื่อเริ่ม</strong>
                <span>ทุกคนจะได้ถูกเรียกก่อนที่ใครจะถูกเรียกซ้ำ</span>
              </>
            )}
          </div>
          <div className="classroom-actions">
            <Button variant="primary" size="lg" onClick={spin} disabled={spinning}>
              {spinning ? 'กำลังสุ่ม...' : 'สุ่มชื่อ'}
            </Button>
            <Button onClick={() => void award(current ? [current.id] : [], 'ตอบคำถามหน้าชั้น')}
              disabled={!current || spinning || busy}>ให้ {points} XP</Button>
            <Button onClick={() => { setPicked([]); setMessage('เริ่มรอบใหม่แล้ว'); }}
              disabled={picked.length === 0}>เริ่มรอบใหม่</Button>
          </div>
          <p className="field-hint">เรียกแล้ว {picked.length}/{roster.length} คนในรอบนี้</p>
          {current && (
            <div className="classroom-badges">
              <span className="ui-eyebrow">มอบเหรียญให้ {current.displayName}</span>
              <div className="classroom-badge-row">
                {achievementCatalog.slice(0, 5).map((badge) => (
                  <button key={badge.key} type="button" className="classroom-badge"
                    disabled={busy} onClick={() => void awardBadge(current.id, badge.key)}>
                    <span aria-hidden="true">{badge.icon}</span>{badge.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </Card>
      ) : tool === 'teams' ? (
        <Card className="classroom-stage">
          <div className="classroom-actions">
            <label>จำนวนทีม
              <select value={teamCount} onChange={(event) => setTeamCount(Number(event.target.value))}>
                {teamCountOptions.map((value) => <option key={value} value={value}>{value} ทีม</option>)}
              </select>
            </label>
            <Button variant="primary" onClick={() => setTeams(splitIntoTeams(roster.map((item) => item.id), teamCount))}>
              แบ่งทีมใหม่
            </Button>
          </div>
          {teams.length === 0 ? (
            <EmptyState icon={<Icon name="students" size={28} />} title="ยังไม่ได้แบ่งทีม"
              description="ระบบจะสับรายชื่อก่อนแบ่ง จำนวนคนในแต่ละทีมจะต่างกันไม่เกินหนึ่งคน" />
          ) : (
            <div className="classroom-team-grid">
              {teams.map((team, index) => (
                <article key={teamName(index)} className="classroom-team">
                  <header><h3>{teamName(index)}</h3><Badge tone="brand">{team.length} คน</Badge></header>
                  <ul>{team.map((id) => <li key={id}>{studentsById.get(id)?.displayName ?? id}</li>)}</ul>
                  <Button size="sm" disabled={busy}
                    onClick={() => void award(team, `${teamName(index)} ชนะกิจกรรม`)}>ให้ทั้งทีม {points} XP</Button>
                </article>
              ))}
            </div>
          )}
        </Card>
      ) : tool === 'question' ? (
        <Card className="classroom-stage">
          <div className="classroom-actions">
            <Button variant="primary" disabled={!questions || questions.length === 0}
              onClick={() => {
                const next = pickNextIndex(questions?.length ?? 0, usedQuestions);
                setQuestionIndex(next.index);
                setUsedQuestions(next.used);
                setAnswerShown(false);
              }}>สุ่มคำถาม</Button>
            <Button onClick={() => void loadQuestions()}>โหลดคลังใหม่</Button>
            {question && <Button onClick={() => setAnswerShown((value) => !value)}>
              {answerShown ? 'ซ่อนเฉลย' : 'ดูเฉลย'}
            </Button>}
          </div>
          {questionError && <div className="alert error" role="alert">{questionError}</div>}
          {questions === null ? <p className="field-hint">กำลังโหลดคลังข้อสอบ...</p>
            : questions.length === 0 ? (
              <EmptyState icon={<Icon name="question-bank" size={28} />} title="คลังข้อสอบยังว่าง"
                description="เพิ่มคำถามในคลังข้อสอบก่อน แล้วกลับมาสุ่มถามหน้าชั้นได้ทันที" />
            ) : question ? (
              <div className="classroom-question" aria-live="polite">
                <span className="ui-eyebrow">{question.topic || 'คำถาม'} · {question.difficulty}</span>
                <h2>{question.prompt}</h2>
                <ol className="classroom-choices">
                  {question.choices.map((choice) => (
                    <li key={choice.id} className={answerShown && question.answerKey.includes(choice.id) ? 'correct' : ''}>
                      {choice.text}{answerShown && question.answerKey.includes(choice.id) ? ' ✓' : ''}
                    </li>
                  ))}
                </ol>
                {answerShown && question.explanation && <p className="field-hint">{question.explanation}</p>}
                <p className="field-hint">ถามแล้ว {usedQuestions.length}/{questions.length} ข้อ</p>
              </div>
            ) : (
              <EmptyState icon={<Icon name="quiz" size={28} />} title="พร้อมสุ่มคำถาม"
                description={`คลังนี้มี ${questions.length} คำถามที่ใช้ได้`} />
            )}
        </Card>
      ) : (
        <Card className="classroom-stage">
          <div className="classroom-timer" aria-live="off">
            <strong>{formatCountdown(remaining)}</strong>
            <span>{running ? 'กำลังนับถอยหลัง' : remaining === 0 ? 'หมดเวลา' : 'พร้อมเริ่ม'}</span>
          </div>
          <div className="classroom-actions">
            {timerPresets.map((value) => (
              <Button key={value} onClick={() => { setSeconds(value); setRemaining(value); setRunning(false); }}
                variant={seconds === value ? 'primary' : 'secondary'}>{formatCountdown(value)}</Button>
            ))}
          </div>
          <div className="classroom-actions">
            <Button variant="primary" size="lg" onClick={() => setRunning((value) => !value)}
              disabled={remaining === 0}>{running ? 'หยุดชั่วคราว' : 'เริ่มจับเวลา'}</Button>
            <Button onClick={() => { setRemaining(seconds); setRunning(false); }}>ตั้งใหม่</Button>
          </div>
        </Card>
      )}

      <Card>
        <div className="panel-heading"><div><h2>แต้มที่ให้วันนี้</h2>
          <p>ทุกครั้งที่ให้แต้มจากหน้านี้จะบันทึกผู้ให้ เหตุผล และเวลาไว้ในประวัติคะแนน</p></div></div>
        {boardAwards.length === 0 ? (
          <p className="field-hint">ยังไม่มีการให้แต้มจากหน้าชั้นในวันนี้</p>
        ) : (
          <ul className="health-list">
            {boardAwards.map((event) => (
              <li key={event.id}>
                <span className="health-dot ok" />
                {snapshot.students.find((student) => student.id === event.studentId)?.displayName ?? 'นักเรียน'}
                <strong>+{event.points} XP · {event.reason || 'กิจกรรมหน้าชั้น'}</strong>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {celebration && (
        <div className="classroom-celebration" role="status">
          <div>
            <span aria-hidden="true">{celebration.icon}</span>
            <strong>{celebration.title}</strong>
            <p>{celebration.detail}</p>
          </div>
        </div>
      )}
      {message && <div className="toast" role="status" onClick={() => setMessage(null)}>{message}</div>}
    </>
  );
}
