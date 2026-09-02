import { useCallback, useEffect, useState } from 'react';
import { useSession } from '../../app/SessionContext';
import { Badge, Button, Card, CardHeader, EmptyState, ProgressBar, Stat } from '../../ui/components';
import {
  joinQuiz, quizView, quizWaitingForMe, secondsRemaining, submitQuizAnswer, QuizError,
  type StudentQuizView
} from './quizChallenge';

/**
 * The student's side of a live round.
 *
 * It appears by itself when a round is running in a class the student is enrolled in — no code to
 * type, no second sign-in. The enrolment already says they belong in the room; asking them to prove
 * it again with a number on the board is a way to lose the two students who mistype it.
 *
 * Once an answer is sent it stays sent. The server records one answer per question and returns the
 * first one on a repeat, so a tap that arrives twice on classroom wifi cannot become two answers,
 * and a refresh shows what they chose rather than an empty question.
 */
export function StudentQuizPanel() {
  const { membership } = useSession();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);
  const [view, setView] = useState<StudentQuizView | null>(null);
  const [receivedAt, setReceivedAt] = useState(Date.now());
  const [pending, setPending] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<{ correct: boolean; awarded: number; explanation?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());

  // Preview uses the same screen with an in-memory round so the complete teacher → student flow
  // can be tested by switching the role selector in one tab.
  const active = membership.role === 'student';

  const poll = useCallback(async () => {
    if (!active) return;
    try {
      const waiting = await quizWaitingForMe();
      if (!waiting.waiting || !waiting.sessionId) {
        setSessionId(null); setJoined(false); setView(null);
        return;
      }
      setSessionId(waiting.sessionId);
      setJoined(waiting.joined === true);
      if (waiting.joined) {
        setView(await quizView(waiting.sessionId));
        // Stamped when the payload lands, so the countdown is measured from the server's reading
        // rather than from whatever this device believes the time is.
        setReceivedAt(Date.now());
      }
    } catch {
      // A round nobody is running is the ordinary case, not an error worth showing.
      setSessionId(null);
    }
  }, [active]);

  useEffect(() => {
    if (!active) return;
    void poll();
    const timer = window.setInterval(() => void poll(), 2000);
    return () => window.clearInterval(timer);
  }, [active, poll]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, []);

  // A new question clears what was on screen for the old one.
  useEffect(() => { setPending([]); setFeedback(null); }, [view?.question?.id]);

  if (!active || !sessionId) return null;

  async function join() {
    if (!sessionId) return;
    setBusy(true); setError(null);
    try {
      await joinQuiz(sessionId);
      setJoined(true);
      setView(await quizView(sessionId)); setReceivedAt(Date.now());
    } catch (reason) {
      setError(reason instanceof QuizError ? reason.message : 'เข้าร่วมไม่สำเร็จ');
    } finally { setBusy(false); }
  }

  async function answer() {
    if (!view?.question || !sessionId) return;
    setBusy(true); setError(null);
    try {
      const result = await submitQuizAnswer(sessionId, view.question.id, pending);
      setFeedback({ correct: result.isCorrect, awarded: result.awarded, ...(result.explanation ? { explanation: result.explanation } : {}) });
      setView(await quizView(sessionId)); setReceivedAt(Date.now());
    } catch (reason) {
      setError(reason instanceof QuizError ? reason.message : 'ส่งคำตอบไม่สำเร็จ');
    } finally { setBusy(false); }
  }

  if (!joined) {
    return (
      <Card className="quiz-invite">
        <CardHeader title="กิจกรรมกำลังเริ่ม" description="ครูเปิดกิจกรรมทบทวนในห้องของเรา" />
        <Button variant="primary" size="lg" loading={busy} onClick={() => void join()}>เข้าร่วม</Button>
        {error && <div className="alert error" role="alert">{error}</div>}
      </Card>
    );
  }

  if (!view) return null;

  const remaining = secondsRemaining(view.deadline, view.serverTime, receivedAt, now);
  const answered = view.myAnswer !== null;
  const multiple = view.question?.questionType === 'multiple_select';

  function toggle(choiceId: string) {
    setPending((value) => {
      if (multiple) {
        return value.includes(choiceId) ? value.filter((id) => id !== choiceId) : [...value, choiceId];
      }
      return value.includes(choiceId) ? [] : [choiceId];
    });
  }

  return (
    <Card className="quiz-invite">
      <CardHeader
        title={view.title}
        description={view.question ? `ข้อ ${view.currentPosition} จาก ${view.questionCount}` : 'รอครูเริ่มข้อถัดไป'}
      />

      <div className="stat-row">
        <Stat label="คะแนนของฉัน" value={view.me.score} tone="brand" />
        <Stat label="ตอบถูก" value={view.me.correct} tone="success" />
        {remaining !== null && (
          <Stat label="เวลาที่เหลือ" value={`${remaining} วินาที`} tone={remaining <= 5 ? 'danger' : 'neutral'} />
        )}
      </div>

      {view.status === 'paused' && <div className="alert warning" role="status">ครูพักกิจกรรมชั่วคราว</div>}
      {view.status === 'ended' && (
        <EmptyState icon="✦" title="จบกิจกรรมแล้ว" description={`ได้ ${view.me.correct} จาก ${view.questionCount} ข้อ`} />
      )}

      {view.question && view.status !== 'ended' && (
        <>
          <p className="quiz-prompt">{view.question.prompt}</p>
          {view.question.choices.length > 0 ? (
            <div className="quiz-answers">
              {view.question.choices.map((choice) => {
                const chosen = answered
                  ? view.myAnswer!.selected.includes(choice.id)
                  : pending.includes(choice.id);
                return (
                  <button
                    key={choice.id} type="button"
                    className={`quiz-answer ${chosen ? 'chosen' : ''}`.trim()}
                    onClick={() => toggle(choice.id)}
                    disabled={answered || busy || view.status !== 'running'}
                    aria-pressed={chosen}
                  >
                    <span className="choice-id">{choice.id.toUpperCase()}</span>
                    {choice.text}
                  </button>
                );
              })}
            </div>
          ) : (
            <input
              className="quiz-short-answer"
              placeholder="พิมพ์คำตอบ" disabled={answered || busy}
              value={pending[0] ?? ''}
              onChange={(event) => setPending([event.target.value])}
            />
          )}

          {!answered ? (
            <Button
              variant="primary" size="lg" loading={busy}
              disabled={pending.length === 0 || view.status !== 'running'}
              onClick={() => void answer()}
            >
              {multiple ? `ส่งคำตอบ (${pending.length} ข้อ)` : 'ส่งคำตอบ'}
            </Button>
          ) : (
            <div className={`alert ${view.myAnswer!.isCorrect ? 'success' : 'warning'}`} role="status">
              {view.myAnswer!.isCorrect
                ? `ถูกต้อง · ได้ ${view.myAnswer!.awarded} คะแนน`
                : 'ยังไม่ถูก · รอครูเฉลยแล้วไปข้อต่อไปกัน'}
              {feedback?.explanation && <p className="fine-print">{feedback.explanation}</p>}
            </div>
          )}

          {view.questionCount > 0 && (
            <ProgressBar
              value={view.currentPosition} max={view.questionCount}
              label={`ข้อ ${view.currentPosition} จาก ${view.questionCount}`}
            />
          )}
        </>
      )}

      {view.leaderboardVisible && view.status !== 'lobby' && (
        <p className="fine-print">
          <Badge tone="brand">กระดานคะแนน</Badge> ครูแสดงอันดับบนจอหน้าห้อง
        </p>
      )}
      {error && <div className="alert error" role="alert">{error}</div>}
    </Card>
  );
}
