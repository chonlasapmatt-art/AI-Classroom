import { useCallback, useEffect, useState } from 'react';
import { useSession } from '../../app/SessionContext';
import { useSchoolSnapshot } from '../../data/RepositoryContext';
import {
  Badge, Button, Card, CardHeader, EmptyState, ErrorState, PageHeader, ProgressBar, Skeleton, Stat
} from '../../ui/components';
import { Icon } from '../../ui/Icon';
import {
  answeredCount, examAccess, examStateLabels, examStateTone, examTimeRemaining, listExams,
  startExamAttempt, submitExamAttempt, takeExam, ExamError,
  type ExamAccess, type ExamPaper, type ExamRow
} from './exams';

/**
 * Sitting an exam.
 *
 * Everything about time comes from the server. The countdown is measured from the reading the server
 * sent rather than from the device clock, and the attempt's expiry was written when it started — so
 * a refresh, a flat battery or a browser crash resumes the same countdown instead of granting a
 * fresh one. That is also why answers are saved as they are chosen: a paper that only exists in the
 * tab is a paper one crash away from being lost.
 */
export function StudentExamPage() {
  const { membership } = useSession();
  const snapshot = useSchoolSnapshot();
  const [exams, setExams] = useState<ExamRow[] | null>(null);
  const [access, setAccess] = useState<Record<string, ExamAccess>>({});
  const [sitting, setSitting] = useState<{ exam: ExamRow; paper: ExamPaper; receivedAt: number } | null>(null);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    setError(null);
    try {
      const rows = await listExams(membership.schoolId);
      setExams(rows);
      const pairs = await Promise.all(rows.map(async (exam) => {
        try { return [exam.id, await examAccess(exam.id)] as const; }
        catch { return null; }
      }));
      setAccess(Object.fromEntries(pairs.filter((pair): pair is [string, ExamAccess] => pair !== null)));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'โหลดรายการสอบไม่สำเร็จ');
    }
  }, [membership.schoolId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const remaining = sitting
    ? examTimeRemaining(sitting.paper.expiresAt, sitting.paper.serverTime, sitting.receivedAt, now)
    : null;

  // The server closes an expired attempt whatever the client believed, so when the countdown reaches
  // zero the honest thing is to send what is on screen and let it be recorded as a timeout.
  useEffect(() => {
    if (!sitting || !remaining || remaining.seconds > 0 || busy) return;
    void submit(true);
    // Submitting is what this effect does; re-running it on every dependency change would resubmit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining?.seconds === 0]);

  async function open(exam: ExamRow) {
    setBusy(true); setError(null);
    try {
      const started = await startExamAttempt(exam.id);
      const paper = await takeExam(started.attemptId);
      setSitting({ exam, paper, receivedAt: Date.now() });
      setAnswers(paper.answers ?? {});
      if (started.resumed) setMessage('กลับเข้าข้อสอบเดิม เวลาที่เหลือนับต่อจากเดิม ไม่ได้เริ่มใหม่');
    } catch (reason) {
      setError(reason instanceof ExamError ? reason.message : 'เข้าสอบไม่สำเร็จ');
    } finally { setBusy(false); }
  }

  async function save(next: Record<string, string[]>) {
    if (!sitting) return;
    setAnswers(next);
    try { await submitExamAttempt(sitting.paper.attemptId, next, false); }
    catch { /* the next save or the final submit carries it; nothing typed is lost on screen */ }
  }

  async function submit(automatic = false) {
    if (!sitting) return;
    if (!automatic) {
      const done = answeredCount(sitting.paper, answers);
      if (done < sitting.paper.questions.length && !window.confirm(
        `ยังไม่ได้ตอบ ${sitting.paper.questions.length - done} ข้อ\n\nส่งข้อสอบเลยหรือไม่? ส่งแล้วแก้ไม่ได้`
      )) return;
    }
    setBusy(true);
    try {
      const result = await submitExamAttempt(sitting.paper.attemptId, answers, true);
      setSitting(null);
      setMessage(result.reason === 'timeout'
        ? 'หมดเวลา ระบบส่งคำตอบที่ทำไว้ให้แล้ว'
        : 'ส่งข้อสอบเรียบร้อย');
      await load();
    } catch (reason) {
      setError(reason instanceof ExamError ? reason.message : 'ส่งข้อสอบไม่สำเร็จ');
    } finally { setBusy(false); }
  }

  if (sitting) {
    const done = answeredCount(sitting.paper, answers);
    return (
      <>
        <PageHeader
          eyebrow="กำลังสอบ" title={sitting.exam.title}
          description={`ตอบแล้ว ${done} จาก ${sitting.paper.questions.length} ข้อ`}
          action={
            <Button variant="primary" loading={busy} onClick={() => void submit()}>ส่งข้อสอบ</Button>
          }
        />
        <Card>
          <div className="stat-row">
            <Stat
              label="เวลาที่เหลือ" value={remaining?.label ?? 'ไม่จำกัดเวลา'}
              tone={remaining && remaining.seconds <= 300 ? 'danger' : 'neutral'}
            />
            <Stat label="ตอบแล้ว" value={`${done} / ${sitting.paper.questions.length}`} />
          </div>
          <ProgressBar value={done} max={sitting.paper.questions.length} label="ความคืบหน้า" />
          <p className="fine-print">
            คำตอบถูกบันทึกทุกครั้งที่เลือก · ถ้าหลุดออกไปแล้วเข้ามาใหม่ เวลาจะนับต่อจากเดิม ไม่ได้เริ่มใหม่
          </p>
        </Card>

        {sitting.paper.questions.map((question) => (
          <Card key={question.id} as="article">
            <div className="question-head">
              <Badge tone="neutral">ข้อ {question.position}</Badge>
              <span className="fine-print">{question.points} คะแนน</span>
            </div>
            <p className="quiz-prompt">{question.prompt}</p>
            {question.choices.length > 0 ? (
              <div className="quiz-answers">
                {question.choices.map((choice) => {
                  const selected = (answers[question.id] ?? []).includes(choice.id);
                  return (
                    <button
                      key={choice.id} type="button"
                      className={`quiz-answer ${selected ? 'chosen' : ''}`.trim()}
                      aria-pressed={selected}
                      onClick={() => {
                        const current = answers[question.id] ?? [];
                        const next = question.questionType === 'multiple_select'
                          ? (selected ? current.filter((id) => id !== choice.id) : [...current, choice.id])
                          : (selected ? [] : [choice.id]);
                        void save({ ...answers, [question.id]: next });
                      }}
                    >
                      <span className="choice-id">{choice.id.toUpperCase()}</span>
                      {choice.text}
                    </button>
                  );
                })}
              </div>
            ) : (
              <input
                className="quiz-short-answer" placeholder="พิมพ์คำตอบ"
                value={(answers[question.id] ?? [])[0] ?? ''}
                onChange={(event) => void save({ ...answers, [question.id]: [event.target.value] })}
              />
            )}
          </Card>
        ))}

        <Button variant="primary" size="lg" loading={busy} onClick={() => void submit()}>ส่งข้อสอบ</Button>
        {error && <div className="alert error" role="alert">{error}</div>}
      </>
    );
  }

  const openable = (exams ?? []).filter((exam) => access[exam.id]);

  return (
    <>
      <PageHeader eyebrow="การวัดผล" title="สอบ" description="ข้อสอบที่เปิดให้ทำ และผลของที่ทำไปแล้ว" />
      {message && <div className="alert success" role="status">{message}</div>}
      {error && <ErrorState message={error} onRetry={() => void load()} />}

      {!exams ? <Skeleton lines={4} /> : (openable.length > 0 ? (
        openable.map((exam) => {
          const info = access[exam.id]!;
          const subject = snapshot.subjects.find((item) => item.id === exam.subjectId);
          return (
            <Card key={exam.id} as="article">
              <CardHeader
                title={exam.title}
                description={`${subject?.name ?? 'ไม่ระบุรายวิชา'} · ${info.questionCount} ข้อ`}
                action={
                  info.canStart || info.activeAttemptId ? (
                    <Button variant="primary" loading={busy} onClick={() => void open(exam)}>
                      {info.activeAttemptId ? 'ทำต่อ' : 'เริ่มทำข้อสอบ'}
                    </Button>
                  ) : undefined
                }
              />
              <div className="question-head">
                <Badge tone={examStateTone[info.state]}>{examStateLabels[info.state]}</Badge>
                <span className="fine-print">
                  ใช้สิทธิ์ไปแล้ว {info.attemptsUsed} จาก {info.attemptLimit} ครั้ง
                  {info.durationMinutes ? ` · ทำได้ ${info.durationMinutes} นาที` : ''}
                </span>
              </div>
              {info.state === 'scheduled' && info.opensAt && (
                <p className="field-hint">เปิดสอบ {new Date(info.opensAt).toLocaleString('th-TH')}</p>
              )}
              {!info.canStart && !info.activeAttemptId && info.state === 'open' && (
                <p className="field-hint">ใช้สิทธิ์สอบครบแล้ว</p>
              )}
            </Card>
          );
        })
      ) : (
        <EmptyState icon={<Icon name="exams" size={28} />} title="ยังไม่มีข้อสอบที่เปิดให้ทำ" description="เมื่อครูเปิดสอบ ข้อสอบจะขึ้นที่หน้านี้" />
      ))}
    </>
  );
}
