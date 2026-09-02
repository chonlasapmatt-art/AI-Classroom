import { useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from '../../app/SessionContext';
import { useSchoolSnapshot } from '../../data/RepositoryContext';
import { activeClasses, activeSubjects, bonusTotalFor, classIdOfStudent, privacyPolicyFrom, recentScoreEvents, rosterFor } from '../../data/selectors';
import { buildGradebook, categoryWeightsFrom } from '../../academic/gradebook';
import { gradeSchemeFrom } from '../../academic/gradeScheme';
import { Badge, Card, EmptyState, Field, PageHeader, ProgressBar, Segmented, Toolbar } from '../../ui/components';
import { ProfileAvatar } from '../avatars/ProfileAvatar';
import type { AvatarAnimation, Student } from '../../domain/types';
import { QuickScorePanel } from './QuickScorePanel';

type Scope = 'overall' | 'progress' | 'board';

const medals = ['ทอง', 'เงิน', 'ทองแดง'];

function animationForRank(rank: number): AvatarAnimation {
  if (rank === 1) return 'celebrate';
  if (rank === 2) return 'wave';
  if (rank === 3) return 'blink';
  return 'idle';
}

/**
 * Leaderboard.
 *
 * The rows come from the same live snapshot every other screen reads, so a mark entered by a
 * teacher moves a student here without a refresh. Movement is shown as a gentle "ขึ้น/ลง" chip
 * rather than a flashing row, and the bottom of the table is never styled as a failure.
 */
export function LeaderboardPage() {
  const { membership } = useSession();
  const snapshot = useSchoolSnapshot();
  const classes = activeClasses(snapshot);
  const subjects = activeSubjects(snapshot);
  const scheme = gradeSchemeFrom(snapshot.settings);
  const privacy = privacyPolicyFrom(snapshot.settings);

  const [classId, setClassId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [scope, setScope] = useState<Scope>('overall');
  const [scoringStudent, setScoringStudent] = useState<Student | null>(null);

  const student = snapshot.students.find((item) => item.profileId === membership.profileId);
  const ownClassId = membership.role === 'student' ? classIdOfStudent(snapshot, student?.id ?? '') : null;
  const selectedClassId = ownClassId ?? classId ?? classes[0]?.id ?? '';
  const effectiveClassId = selectedClassId || classes[0]?.id || '';
  const roster = rosterFor(snapshot, effectiveClassId);

  const rows = useMemo(() => buildGradebook({
    students: roster,
    works: snapshot.assignments.filter((work) => work.classId === effectiveClassId),
    submissions: snapshot.submissions,
    tests: snapshot.tests.filter((test) => test.classId === effectiveClassId),
    testScores: snapshot.testScores,
    weights: categoryWeightsFrom(snapshot.settings),
    scheme,
    subjectId: subjectId || null
  }), [roster, snapshot, effectiveClassId, subjectId, scheme]);

  const ranked = useMemo(() => [...rows]
    .filter((row) => row.percentage !== null)
    .sort((a, b) => (b.percentage ?? 0) - (a.percentage ?? 0)
      || a.student.studentCode.localeCompare(b.student.studentCode))
    .map((row, index) => ({ ...row, rank: index + 1 })), [rows]);

  // Remember the previous order so a change of position can be shown as movement, not a jump.
  const previousRanks = useRef(new Map<string, number>());
  const [movements, setMovements] = useState(new Map<string, number>());
  const [lastChangeAt, setLastChangeAt] = useState<Date | null>(null);

  useEffect(() => {
    const next = new Map(ranked.map((row) => [row.student.id, row.rank]));
    const previous = previousRanks.current;
    if (previous.size > 0) {
      const changes = new Map<string, number>();
      let moved = false;
      for (const [studentId, rank] of next) {
        const before = previous.get(studentId);
        if (before !== undefined && before !== rank) { changes.set(studentId, before - rank); moved = true; }
      }
      if (moved) { setMovements(changes); setLastChangeAt(new Date()); }
    }
    previousRanks.current = next;
  }, [ranked]);

  // Only school staff may write a score, so only they are offered the board that writes them.
  const isStaff = membership.role === 'admin' || membership.role === 'teacher';
  const recentAwards = recentScoreEvents(snapshot, effectiveClassId, 6);
  const highlight = student?.id ?? null;
  const podium = ranked.slice(0, 3);
  const rest = ranked.slice(3);
  const topScore = ranked[0]?.percentage ?? 100;

  if (membership.role === 'student' && !privacy.showLeaderboardToStudents) {
    return (
      <>
        <PageHeader eyebrow="แรงบันดาลใจเชิงบวก" title="Leaderboard" />
        <Card><EmptyState title="โรงเรียนปิดการแสดง Leaderboard ให้นักเรียน" description="ดูความก้าวหน้าของตัวเองได้ที่สมุดเกรด" /></Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="แรงบันดาลใจเชิงบวก"
        title="Leaderboard"
        description="คิดจากคะแนนที่เผยแพร่แล้ว อัปเดตทันทีที่ครูบันทึกคะแนน"
        action={
          <span className="live-pill" title={lastChangeAt ? `อันดับเปลี่ยนล่าสุด ${lastChangeAt.toLocaleTimeString('th-TH')}` : undefined}>
            <span className="live-dot" aria-hidden="true" />
            อัปเดตสด
          </span>
        }
      />

      <Toolbar>
        {!ownClassId && (
          <Field label="ห้องเรียน">
            <select value={effectiveClassId} onChange={(event) => setClassId(event.target.value)}>
              {classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </Field>
        )}
        <Field label="รายวิชา">
          <select value={subjectId} onChange={(event) => setSubjectId(event.target.value)}>
            <option value="">ทุกวิชา</option>
            {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
          </select>
        </Field>
        <Segmented
          ariaLabel="มุมมองอันดับ"
          value={scope}
          onChange={setScope}
          options={isStaff
            ? [{ value: 'overall', label: 'คะแนนรวม' }, { value: 'progress', label: 'ความก้าวหน้า' }, { value: 'board', label: 'โหมดกระดาน' }]
            : [{ value: 'overall', label: 'คะแนนรวม' }, { value: 'progress', label: 'ความก้าวหน้า' }]}
        />
      </Toolbar>

      {scope === 'board' && isStaff ? (
        <>
          {recentAwards.length > 0 && (
            <div className="award-strip" aria-live="polite">
              {recentAwards.map((event) => {
                const person = roster.find((item) => item.id === event.studentId);
                return (
                  <span key={event.id} className={`award-chip ${event.points > 0 ? 'up' : 'down'}`}>
                    {event.points > 0 ? `+${event.points}` : event.points} · {person?.displayName ?? 'นักเรียน'}
                  </span>
                );
              })}
            </div>
          )}
          <section className="board-grid">
            {roster.map((person) => {
              const bonus = bonusTotalFor(snapshot, person.id, subjectId || null);
              const standing = ranked.find((row) => row.student.id === person.id);
              return (
                <button
                  key={person.id} type="button" className="board-card"
                  onClick={() => setScoringStudent(person)}
                >
                  <ProfileAvatar
                    displayName={person.displayName} avatarId={person.avatarId}
                    avatarIndex={person.avatarIndex} avatarConfig={person.avatarConfig} size={72}
                  />
                  <strong>{person.displayName}</strong>
                  <span className="board-score">{standing?.percentage != null ? `${standing.percentage.toFixed(0)}%` : '—'}</span>
                  {bonus !== 0 && <span className={`board-bonus ${bonus > 0 ? 'up' : 'down'}`}>{bonus > 0 ? `+${bonus}` : bonus}</span>}
                </button>
              );
            })}
          </section>
          {scoringStudent && (
            <QuickScorePanel
              student={scoringStudent}
              classId={effectiveClassId}
              subjectId={subjectId || null}
              actorProfileId={membership.profileId}
              actorRole={membership.role}
              onClose={() => setScoringStudent(null)}
            />
          )}
        </>
      ) : ranked.length === 0 ? (
        <Card>
          <EmptyState icon="♕" title="ยังไม่มีข้อมูลจัดอันดับ" description="คะแนนที่เผยแพร่แล้วจะถูกคำนวณอย่างคงที่" />
        </Card>
      ) : (
        <>
          <section className="podium">
            {podium.map((row) => (
              <article
                key={row.student.id}
                className={`podium-card rank-${row.rank} ${highlight === row.student.id ? 'is-me' : ''}`.trim()}
              >
                <span className="podium-rank">{row.rank}</span>
                <ProfileAvatar
                  displayName={row.student.displayName}
                  avatarId={row.student.avatarId}
                  avatarIndex={row.student.avatarIndex}
                  avatarConfig={row.student.avatarConfig}
                  size={row.rank === 1 ? 96 : 78}
                  animation={animationForRank(row.rank)}
                />
                <strong>{row.student.displayName}</strong>
                <span className="podium-medal">{medals[row.rank - 1]}</span>
                <div className="podium-score">
                  <strong>{row.percentage?.toFixed(1)}%</strong>
                  {row.grade && <Badge tone="success">{row.grade}</Badge>}
                </div>
                {movements.get(row.student.id) !== undefined && (
                  <span className={`movement ${movements.get(row.student.id)! > 0 ? 'up' : 'down'}`}>
                    {movements.get(row.student.id)! > 0 ? `ขึ้น ${movements.get(row.student.id)}` : `ลง ${Math.abs(movements.get(row.student.id)!)}`}
                  </span>
                )}
              </article>
            ))}
          </section>

          <Card padded={false} className="leaderboard-card">
            <ul className="leaderboard-list">
              {rest.map((row) => {
                const movement = movements.get(row.student.id);
                return (
                  <li
                    key={row.student.id}
                    className={highlight === row.student.id ? 'is-me' : undefined}
                  >
                    <span className="leaderboard-rank">{row.rank}</span>
                    <ProfileAvatar
                      displayName={row.student.displayName}
                      avatarId={row.student.avatarId}
                      avatarIndex={row.student.avatarIndex}
                      avatarConfig={row.student.avatarConfig}
                      size={40}
                    />
                    <div className="leaderboard-person">
                      <strong>{row.student.displayName}</strong>
                      <span>{row.student.studentCode}</span>
                    </div>
                    <div className="leaderboard-bar">
                      <ProgressBar
                        value={row.percentage ?? 0}
                        max={scope === 'progress' ? topScore : 100}
                        tone={row.rank <= Math.ceil(ranked.length / 2) ? 'brand' : 'info'}
                        label={`${row.percentage?.toFixed(1)}%`}
                      />
                    </div>
                    {movement !== undefined && (
                      <span className={`movement ${movement > 0 ? 'up' : 'down'}`}>
                        {movement > 0 ? `ขึ้น ${movement}` : `ลง ${Math.abs(movement)}`}
                      </span>
                    )}
                    {row.grade && <Badge tone={row.grade === scheme.belowGrade ? 'neutral' : 'success'}>{row.grade}</Badge>}
                  </li>
                );
              })}
            </ul>
          </Card>

          <p className="ui-field-hint">
            แสดง {ranked.length} คนที่มีคะแนนเผยแพร่แล้ว จากทั้งหมด {roster.length} คน ·
            อันดับคิดจากคะแนนรวมถ่วงน้ำหนักเดียวกับสมุดเกรด
          </p>
        </>
      )}
    </>
  );
}
