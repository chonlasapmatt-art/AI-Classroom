import { useState } from 'react';
import type { Student } from '../../domain/types';
import { Badge, Button, EmptyState } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { splitIntoTeams, teamCountOptions, teamName } from '../classroom/classroomGames';
import styles from './classroomTools.module.css';

/**
 * Splitting the room into groups, in front of the room.
 *
 * The dealing rule is the board's — shuffle, then deal one at a time — so group sizes differ by at
 * most one and the roster's own order, which is alphabetical and therefore the same every week,
 * decides nothing. What this adds is the part a teacher actually needs at the front of a class: the
 * result big enough to read from the back, and a redraw that takes one press when a group lands
 * wrong.
 */
export function GroupDrawTool({ roster, className }: { roster: Student[]; className: string }) {
  const [teamCount, setTeamCount] = useState(3);
  const [teams, setTeams] = useState<string[][]>([]);

  const nameOf = (id: string) => roster.find((student) => student.id === id)?.displayName ?? id;

  if (roster.length === 0) {
    return (
      <EmptyState
        icon={<Icon name="students" size={28} />}
        title="ห้องนี้ยังไม่มีรายชื่อนักเรียน"
        description="เลือกห้องที่มีนักเรียนอยู่ก่อนจึงจะแบ่งกลุ่มได้"
      />
    );
  }

  return (
    <div className={className}>
      <div className={styles.toolbar}>
        {teamCountOptions.map((count) => (
          <Button
            key={count}
            variant={teamCount === count ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setTeamCount(count)}
          >
            {count} กลุ่ม
          </Button>
        ))}
        <Button
          variant="primary"
          onClick={() => setTeams(splitIntoTeams(roster.map((student) => student.id), teamCount))}
        >
          {teams.length > 0 ? 'สุ่มใหม่' : 'สุ่มแบ่งกลุ่ม'}
        </Button>
        <Badge tone="info">{roster.length} คนในห้อง</Badge>
      </div>

      {teams.length === 0 ? (
        <EmptyState
          icon={<Icon name="groups" size={28} />}
          title="ยังไม่ได้แบ่งกลุ่ม"
          description={`เลือกจำนวนกลุ่มแล้วกดสุ่ม ระบบจะแบ่งให้จำนวนคนต่างกันไม่เกินหนึ่งคน`}
        />
      ) : (
        <div className={styles.groupGrid}>
          {teams.map((team, index) => (
            <div key={teamName(index)} className={styles.groupCard}>
              <h4>{teamName(index)} · {team.length} คน</h4>
              <ol>
                {team.map((id) => <li key={id}>{nameOf(id)}</li>)}
              </ol>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
