import { useMemo, useState } from 'react';
import { useSession } from '../../app/SessionContext';
import { useSchoolSnapshot } from '../../data/RepositoryContext';
import { activeClasses, subjectHandInsFor, subjectsAssessedIn } from '../../data/selectors';
import { teacherAdvisedClassIds } from '../../data/teacherResponsibilities';
import { Badge, Card, CardHeader, DataTable, EmptyState, Field, PageHeader, Segmented, Toolbar } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { SubjectIcon } from '../subjects/SubjectIcon';
import { ProfileAvatar } from '../avatars/ProfileAvatar';
import { GradebookPage } from './GradebookPage';
import type { HandInTiming, StudentHandIns } from '../../data/selectors';

type View = 'room' | 'subject';

/**
 * The room book: one form teacher, one room, every subject in it.
 *
 * ── Who this is for ──
 * The advisor of a room, and nobody else. Not the teacher who takes one subject in it — they mark
 * their own subject on the marks screen and that is the whole of their responsibility — and not the
 * advisor of some other room. A form teacher answers for twenty-eight children's whole reports: the
 * guardian rings them, the year head asks them, and the question is always about the child rather
 * than about a column of marks. That job needs every subject at once, which is exactly the thing a
 * subject teacher must not have.
 *
 * So the room list here is the rooms this teacher *advises*, which is a different and narrower
 * question than the rooms they teach in. An administrator sees every room, because that is what an
 * administrator is.
 *
 * ── What it does ──
 * Two levels, because there are two questions. The first is "how is this room doing", which is the
 * combined total per child across every subject. The second is "why", and the commonest why is not
 * in the marks at all — it is a child handing everything in a week late. So the detail level takes
 * one subject and lays the room out against it: what each child scored, and whether each piece of
 * work arrived early, on time, late, or not at all.
 *
 * Nothing here writes. Marking belongs to the subject's owner and happens on the marks screen; the
 * server refuses anything else, and this screen does not offer what the server would refuse.
 */
export function SubjectGradebookPage() {
  const { membership } = useSession();
  const snapshot = useSchoolSnapshot();
  const [view, setView] = useState<View>('room');
  const [classId, setClassId] = useState('');
  const [subjectId, setSubjectId] = useState('');

  const allClasses = activeClasses(snapshot);
  /*
   * The rooms this account answers for.
   *
   * An administrator answers for all of them. A teacher answers for the ones they advise — not the
   * ones they teach in, which is the distinction this screen exists to draw.
   */
  const rooms = useMemo(() => {
    if (membership.role === 'admin') return allClasses;
    if (membership.role !== 'teacher') return [];
    const advised = teacherAdvisedClassIds(snapshot, membership.profileId);
    return allClasses.filter((item) => advised.has(item.id));
  }, [allClasses, membership.profileId, membership.role, snapshot]);

  const selectedClassId = rooms.some((item) => item.id === classId) ? classId : rooms[0]?.id ?? '';
  const room = rooms.find((item) => item.id === selectedClassId) ?? null;

  const subjects = useMemo(
    () => subjectsAssessedIn(snapshot, selectedClassId),
    [selectedClassId, snapshot]
  );
  const selectedSubjectId = subjects.some((item) => item.id === subjectId) ? subjectId : subjects[0]?.id ?? '';
  const subject = subjects.find((item) => item.id === selectedSubjectId) ?? null;

  const handIns = useMemo(
    () => (selectedSubjectId ? subjectHandInsFor(snapshot, selectedClassId, selectedSubjectId) : []),
    [selectedClassId, selectedSubjectId, snapshot]
  );

  /*
   * A room book is not a screen a child or a guardian is refused politely — it is a screen they are
   * never given the address of. The menu grants the route and neither of them has this entry, so
   * this is the belt behind that brace rather than the gate itself.
   */
  if (membership.role !== 'admin' && membership.role !== 'teacher') {
    return (
      <>
        <PageHeader eyebrow="ผลการเรียน" title="สมุดรายวิชา" />
        <Card>
          <EmptyState
            icon={<Icon name="gradebook" size={28} />}
            title="หน้านี้เปิดให้ครูและผู้ดูแลระบบเท่านั้น"
            description="คะแนนของตัวเองดูได้ที่หน้าคะแนนและเกรด"
          />
        </Card>
      </>
    );
  }

  if (rooms.length === 0) {
    return (
      <>
        <PageHeader eyebrow="ผลการเรียน" title="สมุดรายวิชา" />
        <Card>
          <EmptyState
            icon={<Icon name="gradebook" size={28} />}
            title="ยังไม่ได้เป็นครูที่ปรึกษาของห้องใด"
            description="สมุดรายวิชาเปิดให้ครูที่ปรึกษาของห้องนั้นเท่านั้น เพื่อดูเกรดรวมของเด็กในห้องตัวเอง · การกรอกคะแนนรายวิชาที่สอนอยู่ที่หน้าแก้ไขคะแนน"
          />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="ผลการเรียน"
        title="สมุดรายวิชา"
        description={room
          ? `${room.name} · ห้องที่คุณเป็นครูที่ปรึกษา · ดูอย่างเดียว แก้ไขคะแนนที่หน้าแก้ไขคะแนน`
          : 'ห้องที่คุณเป็นครูที่ปรึกษา'}
        action={(
          <Segmented
            ariaLabel="มุมมองสมุดรายวิชา"
            value={view}
            onChange={setView}
            options={[
              { value: 'room' as const, label: 'เกรดรวมของห้อง' },
              { value: 'subject' as const, label: 'รายละเอียดรายวิชา' }
            ]}
          />
        )}
      />

      <Toolbar>
        <Field label="ห้องเรียน">
          <select
            value={selectedClassId}
            onChange={(event) => { setClassId(event.target.value); setSubjectId(''); }}
          >
            {rooms.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </Field>
        {view === 'subject' && subjects.length > 0 && (
          <Field label="รายวิชา">
            <select value={selectedSubjectId} onChange={(event) => setSubjectId(event.target.value)}>
              {subjects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </Field>
        )}
      </Toolbar>

      {view === 'room'
        ? <GradebookPage embedded classId={selectedClassId} />
        : <SubjectDetail subject={subject} handIns={handIns} />}
    </>
  );
}

const timingLabels: Record<HandInTiming, string> = {
  early: 'ส่งไว', onTime: 'ตรงเวลา', late: 'ส่งช้า', missing: 'ยังไม่ส่ง'
};

const timingTones: Record<HandInTiming, 'success' | 'info' | 'warning' | 'danger'> = {
  early: 'success', onTime: 'info', late: 'warning', missing: 'danger'
};

/**
 * One subject, the whole room.
 *
 * The four counts come before the average on purpose. A form teacher reading this is looking for the
 * child to ring home about, and the child who is quietly handing everything in three days late is
 * not visible in an average until the term is nearly over.
 */
function SubjectDetail({ subject, handIns }: { subject: { name: string; iconKey: string } | null; handIns: StudentHandIns[] }) {
  const [openStudentId, setOpenStudentId] = useState<string | null>(null);

  if (!subject) {
    return (
      <Card>
        <EmptyState
          icon={<Icon name="gradebook" size={28} />}
          title="ห้องนี้ยังไม่มีรายวิชาที่เก็บคะแนน"
          description="เมื่อครูประจำวิชาเผยแพร่งานหรือการสอบ รายวิชานั้นจะขึ้นมาให้เลือกที่นี่"
        />
      </Card>
    );
  }

  const workCount = handIns[0]?.rows.length ?? 0;
  const lateStudents = handIns.filter((row) => row.late > 0).length;
  const missingStudents = handIns.filter((row) => row.missing > 0).length;

  return (
    <Card padded={false}>
      <div className="gradebook-head">
        <CardHeader
          title={(
            <span className="editor-title">
              <span className="subject-tag"><SubjectIcon iconKey={subject.iconKey} size={14} />{subject.name}</span>
              ทั้งห้อง
            </span>
          )}
          description={workCount === 0
            ? 'ยังไม่มีงานที่เผยแพร่ในรายวิชานี้'
            : `งานที่เผยแพร่ ${workCount} ชิ้น · ส่งช้าอย่างน้อยหนึ่งชิ้น ${lateStudents} คน · ยังไม่ส่ง ${missingStudents} คน`}
        />
      </div>

      <DataTable
        caption={`การส่งงานรายวิชา ${subject.name}`}
        head={<tr><th>นักเรียน</th><th>ส่งไว</th><th>ตรงเวลา</th><th>ส่งช้า</th><th>ยังไม่ส่ง</th><th>คะแนนรวม</th><th>รายชิ้น</th></tr>}
      >
        {handIns.map((row) => (
          <>
            <tr key={row.student.id} className={row.missing > 0 || row.late > 0 ? 'row-attention' : undefined}>
              <td>
                <div className="cell-person">
                  <ProfileAvatar
                    displayName={row.student.displayName}
                    avatarId={row.student.avatarId}
                    avatarIndex={row.student.avatarIndex}
                    avatarConfig={row.student.avatarConfig}
                    size={34}
                  />
                  <div>
                    <strong>{row.student.displayName}</strong>
                    <span>{row.student.studentCode}</span>
                  </div>
                </div>
              </td>
              <td>{row.early || <span className="muted">—</span>}</td>
              <td>{row.onTime || <span className="muted">—</span>}</td>
              <td>{row.late > 0 ? <Badge tone="warning">{row.late}</Badge> : <span className="muted">—</span>}</td>
              <td>{row.missing > 0 ? <Badge tone="danger">{row.missing}</Badge> : <span className="muted">—</span>}</td>
              <td>{row.percentage === null ? <span className="muted">ยังไม่มีคะแนน</span> : `${row.percentage}%`}</td>
              <td>
                <button
                  type="button"
                  className="text-button"
                  aria-expanded={openStudentId === row.student.id}
                  onClick={() => setOpenStudentId((current) => current === row.student.id ? null : row.student.id)}
                >
                  {openStudentId === row.student.id ? 'ซ่อน' : 'ดูรายชิ้น'}
                </button>
              </td>
            </tr>
            {openStudentId === row.student.id && (
              <tr key={`${row.student.id}-detail`} className="row-detail">
                <td colSpan={7}>
                  {/* Each piece of work, so "ส่งช้า 3" can be answered with which three. A count that
                      cannot be opened is a number a teacher has to go and check somewhere else. */}
                  <ul className="handin-list">
                    {row.rows.map((item) => (
                      <li key={item.assignmentId}>
                        <Badge tone={timingTones[item.timing]}>{timingLabels[item.timing]}</Badge>
                        <strong>{item.title}</strong>
                        <span className="muted">
                          {item.score === null ? 'ยังไม่ตรวจ' : `${item.score}/${item.maxScore} คะแนน`}
                        </span>
                      </li>
                    ))}
                    {row.rows.length === 0 && <li className="muted">ยังไม่มีงานที่เผยแพร่ในรายวิชานี้</li>}
                  </ul>
                </td>
              </tr>
            )}
          </>
        ))}
      </DataTable>
    </Card>
  );
}
