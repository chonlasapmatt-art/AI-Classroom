import { useEffect, useMemo, useState } from 'react';
import { useRepository, useSchoolSnapshot } from '../../data/RepositoryContext';
import { useSession } from '../../app/SessionContext';
import { teacherOwnedSubjectIds } from '../../data/teacherResponsibilities';
import type { Student } from '../../domain/types';
import { Badge, Button, EmptyState, Field } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { useToast } from '../../ui/toastContext';
import { ProfileAvatar } from '../avatars/ProfileAvatar';
import { levelFromPoints } from '../avatars/avatarLevels';
import { pointsBalanceFor } from '../rewards/studentPoints';
import {
  BASELINE_XP, STAR_CAP, STAR_CATEGORY, STAR_REASON, STAR_XP, starsFor, starsRemainingFor
} from './classroomStars';
import styles from './classroomTools.module.css';

/**
 * Stars, handed out one at a time while the lesson is still going on.
 *
 * ── What a star is worth, and why it is not a number to type ──
 * Four XP: double a register mark and double a marked piece of work, which is the intent — a child
 * who stands up and joins in should move faster than one who hands work in quietly. The teacher
 * chooses *who*, never *how much*, because a number typed in front of a class is a decision to
 * defend and the same decision made differently by the teacher next door.
 *
 * It is written through `awardScoreEvent`, the same audited ledger as every other award, so a star
 * counts towards the level that unlocks avatar pieces without a second scheme that could disagree
 * with the first. Its category is what marks it as a star, and what the ceiling is counted against —
 * on the server as well as here, so the ceiling is a rule rather than a disabled button.
 *
 * ── The ceiling ──
 * Twenty each. A child at the ceiling keeps their stars and stops being offered more, and the row
 * says so rather than failing when pressed.
 */
export function StarBoardTool({ roster, classId, className }: {
  roster: Student[]; classId: string; className: string;
}) {
  const snapshot = useSchoolSnapshot();
  const repository = useRepository();
  const { membership } = useSession();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  /*
   * The subject the star is filed under, which is not decoration.
   *
   * Points are written through the same gate as every other award, and that gate asks a teacher
   * which of their own subjects this belongs to — a teacher may add to the ledger of a subject they
   * own and to no other. Without the question the award is simply refused, which is how this first
   * behaved: a full roster of buttons, every one of them failing with a permissions message.
   *
   * An administrator has no subject of their own to name, and does not need one.
   */
  const subjects = useMemo(() => {
    if (membership.role !== 'teacher') return snapshot.subjects.filter((item) => item.status === 'active');
    const owned = teacherOwnedSubjectIds(snapshot, membership.profileId, classId);
    return snapshot.subjects.filter((item) => item.status === 'active' && owned.has(item.id));
  }, [classId, membership.profileId, membership.role, snapshot]);
  const [subjectId, setSubjectId] = useState('');

  // The room changes under the picker when a teacher switches class, so a subject that belonged to
  // the old room is dropped rather than sent and refused.
  useEffect(() => {
    setSubjectId((current) => (subjects.some((item) => item.id === current) ? current : subjects[0]?.id ?? ''));
  }, [subjects]);

  const blocked = membership.role === 'teacher' && !subjectId;

  async function giveStar(student: Student) {
    if (busy || blocked || starsRemainingFor(snapshot, student.id) <= 0) return;
    setBusy(student.id);
    try {
      await repository.awardScoreEvent({
        studentId: student.id,
        classId: classId || null,
        subjectId: subjectId || null,
        category: STAR_CATEGORY,
        points: STAR_XP,
        reason: STAR_REASON,
        sourceType: 'board',
        sourceId: null,
        awardedBy: membership.profileId
      });
      toast(`⭐ ${student.displayName} · +${STAR_XP} XP`);
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : 'ให้ดาวไม่สำเร็จ');
    } finally {
      setBusy(null);
    }
  }

  if (roster.length === 0) {
    return (
      <EmptyState
        icon={<Icon name="students" size={28} />}
        title="ห้องนี้ยังไม่มีรายชื่อนักเรียน"
        description="เลือกห้องที่มีนักเรียนอยู่ก่อนจึงจะให้ดาวได้"
      />
    );
  }

  return (
    <div className={className}>
      <div className={styles.toolbar}>
        <Field label="วิชา" hint="ดาวจะถูกบันทึกไว้ในวิชานี้ เหมือนคะแนนอื่นทุกรายการ">
          <select value={subjectId} onChange={(event) => setSubjectId(event.target.value)}>
            {membership.role !== 'teacher' && <option value="">ไม่ระบุวิชา</option>}
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>{subject.name}</option>
            ))}
          </select>
        </Field>
        <Badge tone="warning">1 ดาว = {STAR_XP} XP · เป็นสองเท่าของงานหนึ่งชิ้น ({BASELINE_XP} XP)</Badge>
        <Badge tone="info">ให้ได้คนละไม่เกิน {STAR_CAP} ดาว</Badge>
      </div>

      {blocked && (
        <p className={styles.starFull}>
          ห้องนี้ยังไม่มีวิชาที่คุณเป็นครูเจ้าของ · ให้ดาวได้เฉพาะวิชาที่ตัวเองรับผิดชอบ
        </p>
      )}

      <div className={styles.starList}>
        {roster.map((student) => {
          const stars = starsFor(snapshot, student.id);
          const left = STAR_CAP - stars;
          const level = levelFromPoints(pointsBalanceFor(snapshot, student.id).earned);
          return (
            <div key={student.id} className={styles.starRow}>
              <ProfileAvatar
                displayName={student.displayName}
                avatarId={student.avatarId}
                avatarPhotoId={student.avatarPhotoId}
                avatarIndex={student.avatarIndex}
                avatarConfig={student.avatarConfig}
                size={36}
              />
              <span className={styles.starName}>{student.displayName}</span>
              <span className={styles.starCount}>
                <Icon name="star" size={16} />{stars}
              </span>
              <span className={styles.starFull}>ระดับ {level.level}</span>
              {left > 0 ? (
                <Button
                  variant="primary"
                  size="sm"
                  disabled={blocked}
                  loading={busy === student.id}
                  onClick={() => void giveStar(student)}
                >
                  ให้ดาว
                </Button>
              ) : (
                <span className={styles.starFull}>ครบ {STAR_CAP} ดาวแล้ว</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
