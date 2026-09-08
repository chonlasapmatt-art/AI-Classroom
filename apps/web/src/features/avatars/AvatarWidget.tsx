import { useMemo } from 'react';
import { useSchoolSnapshot } from '../../data/RepositoryContext';
import { bonusTotalFor } from '../../data/selectors';
import type { Student } from '../../domain/types';
import { Badge, Card, EmptyState, LinkButton } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { honourTally, honoursFor, honourTierLabels, type HonourItem } from '../achievements/honours';
import { levelFromPoints } from './avatarLevels';
import { outfitById } from './avatarOutfits';
import { ProfileAvatar } from './ProfileAvatar';

function HonourChip({ honour }: { honour: HonourItem }) {
  const when = new Date(honour.awardedAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
  return (
    <li className="honour-chip" data-tier={honour.tier}>
      <span className="honour-chip-medal" aria-hidden="true"><Icon name={honour.icon} size={16} /></span>
      <span className="honour-chip-copy">
        <strong>{honour.name}</strong>
        <small>{honourTierLabels[honour.tier]} · ได้รับ {when}</small>
      </span>
    </li>
  );
}

/**
 * One student, as they are: their avatar, what it is wearing, what they have been given and how far
 * their points have taken them.
 *
 * Everything on it is read from records the school already keeps — the avatar from the student row,
 * the medals from the awards table, the points from the score events — so nothing here is a second
 * copy of anything, and a school that has awarded nothing yet gets a widget that says so rather than
 * an empty box.
 */
export function AvatarWidget({ student, showHonourLink = true, limit = 4 }: {
  student: Pick<Student, 'id' | 'displayName' | 'studentCode' | 'avatarId' | 'avatarIndex' | 'avatarConfig' | 'avatarPhotoId'>;
  /** The medals list is a screen of its own; a teacher on the roster does not always want the link. */
  showHonourLink?: boolean;
  limit?: number;
}) {
  const snapshot = useSchoolSnapshot();
  const honours = useMemo(() => honoursFor(snapshot, student.id), [snapshot, student.id]);
  const points = bonusTotalFor(snapshot, student.id);
  const tally = honourTally(honours);
  const outfit = outfitById(student.avatarConfig?.outfit);
  const progress = levelFromPoints(points);

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
          <span style={{ width: `${Math.round((progress.into / progress.needed) * 100)}%` }} />
        </div>
        <small>อีก {progress.needed - progress.into} คะแนนถึงระดับ {progress.level + 1}</small>
      </div>

      <div className="avatar-widget-honours">
        <div className="avatar-widget-honours-head">
          <strong>เหรียญเกียรติยศ {honours.length} เหรียญ</strong>
          {honours.length > 0 && (
            <span className="honour-tally">
              {(['gold', 'silver', 'bronze'] as const)
                .filter((tier) => tally[tier] > 0)
                .map((tier) => (
                  <span key={tier} className="honour-tally-item" data-tier={tier}>
                    {honourTierLabels[tier]} {tally[tier]}
                  </span>
                ))}
            </span>
          )}
        </div>
        {honours.length === 0 ? (
          <EmptyState
            icon={<Icon name="achievements" size={24} />}
            title="ยังไม่มีเหรียญ"
            description="เหรียญจะปรากฏที่นี่เมื่อครูมอบให้จากหน้าเหรียญรางวัลหรือกิจกรรมหน้าชั้น"
          />
        ) : (
          <>
            <ul className="honour-chip-list">
              {honours.slice(0, limit).map((honour) => <HonourChip key={honour.id} honour={honour} />)}
            </ul>
            {honours.length > limit && (
              <small className="avatar-widget-more">และอีก {honours.length - limit} เหรียญ</small>
            )}
          </>
        )}
        {showHonourLink && (
          <LinkButton to={`/achievements?student=${student.id}`} variant="secondary" size="sm">
            ดูเหรียญทั้งหมดของคนนี้
          </LinkButton>
        )}
      </div>
    </Card>
  );
}
