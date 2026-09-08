import { useState } from 'react';
import { useSession } from '../../app/SessionContext';
import { PageHeader, Segmented } from '../../ui/components';
import { ScoresPage } from '../scores/ScoresPage';
import { GradebookPage } from './GradebookPage';

type View = 'marks' | 'summary';

/**
 * The teacher's marks, in one place.
 *
 * "คะแนนและเกรด" and "สมุดเกรด" were two menu entries over the same rows, differing in how they
 * added them up: one is where marks are entered and read per item, the other weights the categories
 * into a grade. Teachers were choosing between them by guessing which one held the number they
 * wanted, and a teacher who guessed wrong concluded the mark had not saved.
 *
 * So they are one screen with two views, and the switch says what each view is for. Nothing about
 * either view changed; what changed is that there is one place to go.
 *
 * Who may open it is decided inside each view, from the class staff list: a subject teacher reads
 * their own subject, an advisor reads their room's totals, and a teacher on neither is not offered
 * the room at all. A student or a guardian never reaches this screen — the menu does not grant
 * them the address — and a student opening their own marks gets the student view of the same data.
 */
export function SubjectGradebookPage() {
  const { membership } = useSession();
  const [view, setView] = useState<View>('marks');

  if (membership.role !== 'teacher' && membership.role !== 'admin') {
    return <GradebookPage />;
  }

  return (
    <>
      <PageHeader
        eyebrow="ผลการเรียน"
        title="สมุดเกรดรายวิชา"
        description="กรอกคะแนนรายวิชาและดูเกรดรวมของห้องในหน้าเดียว เห็นเฉพาะห้องและรายวิชาที่ได้รับมอบหมาย"
        action={(
          <Segmented
            ariaLabel="มุมมองสมุดเกรด"
            value={view}
            onChange={setView}
            options={[
              { value: 'marks' as const, label: 'คะแนนรายวิชา' },
              { value: 'summary' as const, label: 'เกรดรวมของห้อง' }
            ]}
          />
        )}
      />
      {view === 'marks' ? <ScoresPage embedded /> : <GradebookPage embedded />}
    </>
  );
}
