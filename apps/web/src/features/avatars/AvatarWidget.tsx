import { useMemo, type CSSProperties } from 'react';
import { useSchoolSnapshot } from '../../data/RepositoryContext';
import { bonusTotalFor } from '../../data/selectors';
import type { Student } from '../../domain/types';
import { Badge, Card } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { levelFromPoints } from './avatarLevels';
import { avatarOutfits, outfitById } from './avatarOutfits';
import { pointsBalanceFor, unlockedOutfitsFor } from '../rewards/studentPoints';
import { ProfileAvatar } from './ProfileAvatar';

/**
 * One student, as they are: their avatar, what it is wearing, and what they have to spend.
 *
 * Everything on it is read from records the school already keeps — the avatar from the student row,
 * the points from the register and the score ledger — so nothing here is a second copy of anything,
 * and a child who has just started gets a widget that says nought rather than an empty box.
 */
export function AvatarWidget({ student }: {
  student: Pick<Student, 'id' | 'displayName' | 'studentCode' | 'avatarId' | 'avatarIndex' | 'avatarConfig' | 'avatarPhotoId'>;
}) {
  const snapshot = useSchoolSnapshot();
  const points = bonusTotalFor(snapshot, student.id);
  const outfit = outfitById(student.avatarConfig?.outfit);
  const progress = levelFromPoints(points);
  const balance = useMemo(() => pointsBalanceFor(snapshot, student.id), [snapshot, student.id]);
  const wardrobe = useMemo(() => {
    const owned = unlockedOutfitsFor(snapshot, student.id);
    const priced = avatarOutfits.filter((item) => (item.price ?? 0) > 0);
    const bought = priced.filter((item) => owned.has(item.id)).length;
    return { priced: priced.length, owned: bought, locked: priced.length - bought };
  }, [snapshot, student.id]);

  return (
    <Card className="avatar-widget">
      <div className="avatar-widget-head">
        <ProfileAvatar
          displayName={student.displayName}
          avatarId={student.avatarId}
          avatarPhotoId={student.avatarPhotoId}
          avatarIndex={student.avatarIndex}
          avatarConfig={student.avatarConfig}
          size={84}
          animation="wave"
        />
        <div className="avatar-widget-identity">
          <strong>{student.displayName}</strong>
          <span>เลขประจำตัว {student.studentCode}</span>
          <Badge tone="brand">
            <Icon name="profile" size={13} /> {outfit.name}
          </Badge>
        </div>
      </div>

      <div className="avatar-widget-level" role="group" aria-label="ระดับและคะแนนสะสม">
        <div className="avatar-widget-level-head">
          <strong>ระดับ {progress.level}</strong>
          <span>{points} คะแนนสะสม</span>
        </div>
        <div
          className="avatar-widget-bar"
          role="progressbar"
          aria-valuenow={progress.into}
          aria-valuemin={0}
          aria-valuemax={progress.needed}
          aria-label={`ความคืบหน้าไประดับ ${progress.level + 1}`}
        >
          {/* The fraction the bar is scaled to, rather than a width it is laid out at. */}
          <span style={{ '--fill': progress.into / progress.needed } as CSSProperties} />
        </div>
        <small>อีก {progress.needed - progress.into} คะแนนถึงระดับ {progress.level + 1}</small>
      </div>

      {/*
        * What a child has, where it came from, and what it is for.
        *
        * This was a shelf of medals -- something done *to* a child, with nothing to do about it.
        * Points are the other way round: they accumulate by turning up, they are added to by a
        * teacher who notices something, and they buy clothes the child chooses. So the panel says
        * the balance, breaks it into its two sources so the number is explainable, and names what
        * is currently being worn.
        */}
      <div className="avatar-widget-points" role="group" aria-label="แต้มสะสม">
        <div className="avatar-widget-points-head">
          <strong>{balance.balance} แต้มที่ใช้ได้</strong>
          {balance.spent > 0 && <span>ใช้ไปแล้ว {balance.spent} แต้ม</span>}
        </div>
        <ul className="avatar-widget-points-source">
          <li><span>จากการมาเรียน</span><strong>{balance.fromAttendance}</strong></li>
          <li><span>จากคะแนนจิตพิสัย</span><strong>{balance.fromTeachers}</strong></li>
        </ul>
        <small>
          {wardrobe.locked > 0
            ? `ปลดล็อกชุดแล้ว ${wardrobe.owned} จาก ${wardrobe.priced} ชุดพิเศษ · เก็บแต้มเพิ่มเพื่อปลดล็อกที่เหลือ`
            : "ปลดล็อกชุดพิเศษครบทุกชุดแล้ว"}
        </small>
      </div>
    </Card>
  );
}
