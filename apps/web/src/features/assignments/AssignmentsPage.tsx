import { useMemo, useState } from 'react';
import { useSession } from '../../app/SessionContext';
import { useRepository, useSchoolSnapshot } from '../../data/RepositoryContext';
import { activeClasses, activeSubjects, classIdOfStudent, rosterFor, subjectById } from '../../data/selectors';
import { subjectColor } from '../../data/subjectCatalog';
import { SubjectIcon } from '../subjects/SubjectIcon';
import { calendarItemsFor } from '../../academic/views';
import { timeRemainingLabel, workStateLabels, workStateTone } from '../../academic/workStatus';
import { Badge, Button, Card, EmptyState, Field, Modal, PageHeader, Segmented, Toolbar } from '../../ui/components';
import type { Assignment } from '../../domain/types';
import type { AssignmentInput } from '../../data/schoolRepository';
import { AttachmentPanel } from '../attachments/AttachmentPanel';
import { WorkDetailPanel } from './WorkDetailPanel';
import { WorkFormModal } from './WorkFormModal';

type Filter = 'all' | 'open' | 'draft' | 'closed';

const filterOptions: Array<{ value: Filter; label: string }> = [
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'open', label: 'กำลังดำเนินการ' },
  { value: 'draft', label: 'ฉบับร่าง' },
  { value: 'closed', label: 'ปิดแล้ว' }
];

export function AssignmentsPage() {
  const { membership } = useSession();
  const repository = useRepository();
  const snapshot = useSchoolSnapshot();
  const classes = activeClasses(snapshot);
  const subjects = activeSubjects(snapshot);

  const isTeacher = membership.role === 'admin' || membership.role === 'teacher';
  const ownStudent = snapshot.students.find((item) => item.profileId === membership.profileId);
  const ownClassId = membership.role === 'student' ? classIdOfStudent(snapshot, ownStudent?.id ?? '') : null;

  const [classId, setClassId] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Assignment | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<Assignment | null>(null);
  const [turnInNote, setTurnInNote] = useState('');
  const [announcing, setAnnouncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const selectedClassId = ownClassId ?? classId ?? '';
  const effectiveClassId = selectedClassId || classes[0]?.id || '';
  const classroom = classes.find((item) => item.id === effectiveClassId);
  const roster = rosterFor(snapshot, effectiveClassId);

  const items = useMemo(() => calendarItemsFor(snapshot, {
    classIds: [effectiveClassId],
    studentId: ownStudent?.id ?? null,
    subjectId: subjectFilter || null,
    includeDrafts: isTeacher
  }), [snapshot, effectiveClassId, ownStudent?.id, subjectFilter, isTeacher]);

  const visible = items.filter((item) => {
    if (filter === 'draft') return item.work.status === 'draft';
    if (filter === 'open') return item.work.status === 'published';
    if (filter === 'closed') return item.work.status === 'closed' || item.work.status === 'cancelled';
    return true;
  });

  async function saveWork(input: AssignmentInput, publish: boolean) {
    // Saving always writes a draft first; publishing is the separate step that notifies students.
    await repository.saveAssignment({ ...input, status: publish ? 'draft' : input.status });
    if (publish && input.id) {
      await repository.publishAssignment(input.id, roster.map((student) => student.id));
    }
    setMessage(publish ? 'เผยแพร่งานให้นักเรียนแล้ว' : 'บันทึกฉบับร่างแล้ว');
  }

  async function turnIn(work: Assignment) {
    if (!ownStudent) return;
    await repository.submitWork(work.id, ownStudent.id, turnInNote, false);
    setTurnInNote('');
    setMessage('ส่งงานเรียบร้อยแล้ว');
  }

  return (
    <>
      <PageHeader
        eyebrow={classroom ? `${classroom.name} · ${classroom.gradeLevel}` : 'งานและโปรเจกต์'}
        title="งานและโปรเจกต์"
        description={isTeacher
          ? 'สร้าง มอบหมาย ติดตามการส่ง และให้คะแนนงานของห้องเรียน'
          : 'งานทั้งหมดของฉัน พร้อมสถานะและกำหนดส่ง'}
        action={isTeacher && (
          <>
            <Button variant="secondary" onClick={() => setAnnouncing(true)}>ประกาศถึงห้องเรียน</Button>
            <Button variant="primary" onClick={() => { setEditing(null); setFormOpen(true); }}>+ สร้างงานใหม่</Button>
          </>
        )}
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
          <select value={subjectFilter} onChange={(event) => setSubjectFilter(event.target.value)}>
            <option value="">ทุกวิชา</option>
            {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
          </select>
        </Field>
        <Segmented ariaLabel="กรองสถานะงาน" value={filter} onChange={setFilter} options={filterOptions} />
      </Toolbar>

      {visible.length === 0 ? (
        <Card>
          <EmptyState
            icon="🎉"
            title={filter === 'all' ? 'ยังไม่มีงานในห้องนี้' : 'ไม่มีงานในหมวดนี้'}
            description={isTeacher ? 'สร้างงานแรกแล้วเผยแพร่ให้นักเรียนทั้งห้อง' : 'ทุกงานเรียบร้อยแล้ว'}
            {...(isTeacher ? { action: <Button variant="primary" onClick={() => setFormOpen(true)}>+ สร้างงาน</Button> } : {})}
          />
        </Card>
      ) : (
        <div className="work-list">
          {visible.map(({ work, dueAt, state, submission }) => {
            const subject = subjectById(snapshot, work.subjectId);
            const color = subject ? subjectColor(subject.colorIndex) : null;
            const open = expanded === work.id;
            return (
              <Card key={work.id} as="article" className="work-card">
                <div className="work-card-head">
                  <div className="work-card-title">
                    {subject && color && (
                      <span className="subject-tag" style={{ background: color.soft, color: color.solid }}>
                        <SubjectIcon iconKey={subject.iconKey} size={14} />{subject.name}
                      </span>
                    )}
                    <h3>{work.title}</h3>
                    <div className="work-card-meta">
                      <Badge tone={workStateTone[state]}>{workStateLabels[state]}</Badge>
                      <span>{work.workType === 'project' ? 'โครงงาน' : work.workType === 'homework' ? 'การบ้าน' : work.workType === 'activity' ? 'กิจกรรม' : 'งานที่มอบหมาย'}</span>
                      <span>เต็ม {work.maxScore} คะแนน</span>
                      {dueAt && <span>{new Date(dueAt).toLocaleString('th-TH')} · {timeRemainingLabel(dueAt)}</span>}
                    </div>
                  </div>
                  <div className="work-card-actions">
                    {isTeacher && work.status === 'draft' && (
                      <Button
                        variant="primary" size="sm"
                        onClick={() => void repository.publishAssignment(work.id, roster.map((student) => student.id))
                          .then(() => setMessage('เผยแพร่งานแล้ว'))}
                      >
                        เผยแพร่
                      </Button>
                    )}
                    {isTeacher && work.status === 'published' && (
                      <>
                        <Button size="sm" variant="secondary" onClick={() => { setEditing(work); setFormOpen(true); }}>แก้ไข</Button>
                        <Button size="sm" variant="ghost" onClick={() => setCancelling(work)}>ยกเลิกงาน</Button>
                      </>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => {
                      setExpanded(open ? null : work.id);
                      if (!open && ownStudent) void repository.markWorkOpened(work.id, ownStudent.id);
                    }}>
                      {open ? 'ซ่อน' : isTeacher ? 'ดูการส่งงาน' : 'เปิดงาน'}
                    </Button>
                  </div>
                </div>

                {work.instructions && <p className="work-card-instructions">{work.instructions}</p>}

                {open && isTeacher && (
                  <WorkDetailPanel
                    work={work}
                    roster={roster}
                    actorProfileId={membership.profileId}
                    onMessage={setMessage}
                  />
                )}

                {open && !isTeacher && ownStudent && (
                  <div className="turn-in">
                    <AttachmentPanel
                      ownerType="assignment" ownerId={work.id} uploadedBy={membership.profileId}
                      canUpload={false} title="เอกสารประกอบจากครู"
                    />
                    <AttachmentPanel
                      ownerType="submission" ownerId={`${work.id}:${ownStudent.id}`} uploadedBy={membership.profileId}
                      canUpload title="ไฟล์งานของฉัน"
                    />
                    {submission?.teacherNote && <p className="teacher-note">ความเห็นครู: {submission.teacherNote}</p>}
                    <div className="turn-in-actions">
                      {!submission?.acknowledgedAt && (
                        <Button
                          variant="secondary"
                          onClick={() => void repository.acknowledgeWork(work.id, ownStudent.id).then(() => setMessage('รับทราบงานแล้ว'))}
                        >
                          รับทราบงานแล้ว
                        </Button>
                      )}
                      {['upcoming', 'soon', 'urgent', 'overdue', 'revision_requested'].includes(state) && (
                        <>
                          <Field label="บันทึกถึงครู (ไม่บังคับ)">
                            <textarea rows={2} value={turnInNote} onChange={(event) => setTurnInNote(event.target.value)} />
                          </Field>
                          <Button variant="primary" onClick={() => void turnIn(work)}>
                            {state === 'revision_requested' ? 'ส่งงานที่แก้ไขแล้ว' : 'ส่งงาน'}
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {formOpen && (
        <WorkFormModal
          classId={effectiveClassId}
          className={classroom?.name ?? ''}
          subjects={subjects}
          rubrics={snapshot.rubrics}
          works={snapshot.assignments}
          editing={editing}
          onClose={() => { setFormOpen(false); setEditing(null); }}
          onSave={saveWork}
        />
      )}

      {cancelling && (
        <Modal
          title={`ยกเลิก ${cancelling.title}?`}
          description="นักเรียนจะได้รับแจ้งเตือนหนึ่งครั้ง และการเตือนที่ตั้งไว้ทั้งหมดจะถูกยกเลิก"
          onClose={() => setCancelling(null)}
          actions={
            <>
              <Button variant="ghost" onClick={() => setCancelling(null)}>ไม่ยกเลิก</Button>
              <Button
                variant="danger"
                onClick={() => {
                  const reason = (document.getElementById('cancel-reason') as HTMLInputElement | null)?.value ?? '';
                  void repository.cancelAssignment(cancelling.id, reason, membership.profileId)
                    .then(() => { setMessage('ยกเลิกงานแล้ว'); setCancelling(null); });
                }}
              >
                ยืนยันยกเลิกงาน
              </Button>
            </>
          }
        >
          <Field label="เหตุผลที่แจ้งนักเรียน">
            <input id="cancel-reason" placeholder="เลื่อนไปเป็นกิจกรรมในคาบเรียนแทน" />
          </Field>
        </Modal>
      )}

      {announcing && (
        <Modal
          title="ประกาศถึงห้องเรียน"
          description={`ส่งถึงนักเรียน ${roster.length} คนในห้องนี้ · นักเรียนส่งประกาศเองไม่ได้`}
          onClose={() => setAnnouncing(false)}
          actions={
            <>
              <Button variant="ghost" onClick={() => setAnnouncing(false)}>ยกเลิก</Button>
              <Button
                variant="primary"
                onClick={() => {
                  const title = (document.getElementById('announcement-title') as HTMLInputElement | null)?.value ?? '';
                  const body = (document.getElementById('announcement-body') as HTMLTextAreaElement | null)?.value ?? '';
                  if (!title.trim()) { setMessage('ใส่หัวข้อประกาศก่อน'); return; }
                  void repository.saveAnnouncement({ classId: effectiveClassId, subjectId: subjectFilter || null, title, body })
                    .then(() => { setAnnouncing(false); setMessage('ส่งประกาศให้นักเรียนแล้ว'); });
                }}
              >
                ส่งประกาศ
              </Button>
            </>
          }
        >
          <Field label="หัวข้อ">
            <input id="announcement-title" placeholder="เตรียมอุปกรณ์วาดรูป" />
          </Field>
          <Field label="รายละเอียด">
            <textarea id="announcement-body" rows={3} placeholder="พรุ่งนี้ให้นักเรียนนำอุปกรณ์วาดรูปมาด้วย" />
          </Field>
        </Modal>
      )}

      {message && <div className="toast" role="status" onClick={() => setMessage(null)}>{message}</div>}
    </>
  );
}
