import { useMemo, useState } from 'react';
import { useSession } from '../../app/SessionContext';
import { useRepository, useSchoolSnapshot } from '../../data/RepositoryContext';
import { activeClasses, activeSubjects, classIdOfStudent, rosterFor, subjectById } from '../../data/selectors';
import { subjectColor } from '../../data/subjectCatalog';
import { SubjectIcon } from '../subjects/SubjectIcon';
import { calendarItemsFor, rosterRowsFor, studentTrackingFor } from '../../academic/views';
import { timeRemainingLabel, workStateLabels, workStateTone } from '../../academic/workStatus';
import { Badge, Button, Card, CardHeader, EmptyState, Field, LinkButton, Modal, PageHeader, ProgressBar, Segmented, Stat, Toolbar } from '../../ui/components';
import type { Assignment } from '../../domain/types';
import { normalizeGoogleDriveUrl } from '../../domain/driveLinks';
import type { AssignmentInput } from '../../data/schoolRepository';
import { AttachmentPanel } from '../attachments/AttachmentPanel';
import { ProfileAvatar } from '../avatars/ProfileAvatar';
import { WorkDetailPanel } from './WorkDetailPanel';
import { WorkFormModal } from './WorkFormModal';
import { canManageAcademicItem, teacherOwnedSubjectIds } from '../../data/teacherResponsibilities';

type Filter = 'all' | 'open' | 'draft' | 'closed';
type TrackingFilter = 'all' | 'attention' | 'late' | 'waiting' | 'complete';

const filterOptions: Array<{ value: Filter; label: string }> = [
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'open', label: 'กำลังดำเนินการ' },
  { value: 'draft', label: 'ฉบับร่าง' },
  { value: 'closed', label: 'ปิดแล้ว' }
];

const trackingFilterOptions: Array<{ value: TrackingFilter; label: string }> = [
  { value: 'all', label: 'ทุกคน' },
  { value: 'attention', label: 'ต้องตาม' },
  { value: 'late', label: 'ส่งช้า' },
  { value: 'waiting', label: 'ยังไม่ส่ง' },
  { value: 'complete', label: 'ครบแล้ว' }
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
  const [trackingFilter, setTrackingFilter] = useState<TrackingFilter>('all');
  const [trackingQuery, setTrackingQuery] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Assignment | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [selectedTrackingWorkId, setSelectedTrackingWorkId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<Assignment | null>(null);
  const [turnInNote, setTurnInNote] = useState('');
  const [turnInDriveUrls, setTurnInDriveUrls] = useState<Record<string, string>>({});
  const [announcing, setAnnouncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const selectedClassId = ownClassId ?? classId ?? '';
  const effectiveClassId = selectedClassId || classes[0]?.id || '';
  const classroom = classes.find((item) => item.id === effectiveClassId);
  const roster = rosterFor(snapshot, effectiveClassId);
  const manageableSubjects = useMemo(() => {
    if (membership.role === 'admin') return subjects;
    const ownedIds = teacherOwnedSubjectIds(snapshot, membership.profileId, effectiveClassId);
    return subjects.filter((subject) => ownedIds.has(subject.id));
  }, [effectiveClassId, membership.profileId, membership.role, snapshot, subjects]);
  const canCreateWork = canManageAcademicItem(
    snapshot, membership.role, membership.profileId, effectiveClassId,
    subjectFilter || manageableSubjects[0]?.id || null
  );

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

  const publishedItems = useMemo(
    () => items.filter((item) => item.work.status === 'published' || item.work.status === 'closed'),
    [items]
  );
  const selectedTrackingWork = publishedItems.find((item) => item.work.id === selectedTrackingWorkId) ?? publishedItems[0] ?? null;
  const selectedWorkRows = useMemo(
    () => selectedTrackingWork ? rosterRowsFor(snapshot, selectedTrackingWork.work, roster) : [],
    [roster, selectedTrackingWork, snapshot]
  );
  const selectedWorkSummary = useMemo(() => ({
    total: selectedWorkRows.length,
    submitted: selectedWorkRows.filter((row) => ['submitted', 'late', 'graded'].includes(row.state)).length,
    late: selectedWorkRows.filter((row) => row.state === 'late').length,
    waiting: selectedWorkRows.filter((row) => ['overdue', 'urgent', 'soon', 'upcoming', 'revision_requested'].includes(row.state)).length
  }), [selectedWorkRows]);

  const trackingRows = useMemo(() => studentTrackingFor(snapshot, effectiveClassId, new Date(), subjectFilter || null), [snapshot, effectiveClassId, subjectFilter]);
  const trackingSummary = useMemo(() => ({
    students: trackingRows.length,
    submitted: trackingRows.reduce((sum, row) => sum + row.submitted, 0),
    late: trackingRows.reduce((sum, row) => sum + row.late, 0),
    waiting: trackingRows.reduce((sum, row) => sum + row.waiting, 0),
    attention: trackingRows.filter((row) => row.bucket === 'attention').length
  }), [trackingRows]);
  const visibleTrackingRows = trackingRows.filter((row) => {
    const query = trackingQuery.trim().toLocaleLowerCase('th-TH');
    const matchesQuery = !query || `${row.student.displayName} ${row.student.studentCode}`.toLocaleLowerCase('th-TH').includes(query);
    const matchesFilter = trackingFilter === 'all' || trackingFilter === 'late'
      ? trackingFilter === 'all' || row.late > 0
      : trackingFilter === 'waiting'
        ? row.waiting > 0
        : trackingFilter === 'complete'
          ? row.bucket === 'complete'
          : row.bucket === 'attention';
    return matchesQuery && matchesFilter;
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
    const driveUrl = normalizeGoogleDriveUrl(turnInDriveUrls[work.id]);
    if (!driveUrl) {
      setMessage('กรุณาวางลิงก์ Google Drive ที่เป็น HTTPS ก่อนส่งงาน');
      return;
    }
    await repository.submitWork(work.id, ownStudent.id, turnInNote, false, driveUrl);
    setTurnInDriveUrls((current) => ({ ...current, [work.id]: driveUrl }));
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
        action={canCreateWork && (
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
            {(isTeacher && membership.role !== 'admin' ? manageableSubjects : subjects)
              .map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
          </select>
        </Field>
        <Segmented ariaLabel="กรองสถานะงาน" value={filter} onChange={setFilter} options={filterOptions} />
      </Toolbar>

      <section className="assignment-section" aria-labelledby="assignment-list-title">
        <CardHeader
          title={<span id="assignment-list-title">1 · งานที่มอบหมาย</span>}
          description={isTeacher ? 'สร้างงาน เผยแพร่ให้นักเรียน และแก้ไขงานของวิชาที่คุณรับผิดชอบ' : 'งานจากครูในห้องของคุณ เรียงตามกำหนดส่ง'}
          action={<Badge tone="info">อัปเดตทันทีเมื่อมีการเปลี่ยนแปลง</Badge>}
        />

      {visible.length === 0 ? (
        <Card>
          <EmptyState
            icon="🎉"
            title={filter === 'all' ? 'ยังไม่มีงานในห้องนี้' : 'ไม่มีงานในหมวดนี้'}
            description={isTeacher ? 'สร้างงานแรกแล้วเผยแพร่ให้นักเรียนทั้งห้อง' : 'ทุกงานเรียบร้อยแล้ว'}
            {...(canCreateWork ? { action: <Button variant="primary" onClick={() => setFormOpen(true)}>+ สร้างงาน</Button> } : {})}
          />
        </Card>
      ) : (
        <div className="work-list">
          {visible.map(({ work, dueAt, state, submission }) => {
            const subject = subjectById(snapshot, work.subjectId);
            const color = subject ? subjectColor(subject.colorIndex) : null;
            const subjectTeachers = snapshot.classTeachers
              .filter((link) => link.classId === work.classId && link.deletedAt === null && (link.subjectId === work.subjectId || (link.subjectId === null && !work.subjectId)))
              .map((link) => snapshot.teachers.find((teacher) => teacher.id === link.teacherId)?.displayName)
              .filter((name): name is string => Boolean(name));
            const teacherLabel = [...new Set(subjectTeachers)].join(' · ') || 'ครูผู้สอนประจำวิชา';
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
                      <span>ผู้สอน {teacherLabel}</span>
                      <span>เต็ม {work.maxScore} คะแนน</span>
                      {dueAt && <span>{new Date(dueAt).toLocaleString('th-TH')} · {timeRemainingLabel(dueAt)}</span>}
                    </div>
                  </div>
                  <div className="work-card-actions">
                    {isTeacher && canManageAcademicItem(snapshot, membership.role, membership.profileId, work.classId, work.subjectId) && work.status === 'draft' && (
                      <Button
                        variant="primary" size="sm"
                        onClick={() => void repository.publishAssignment(work.id, roster.map((student) => student.id))
                          .then(() => setMessage('เผยแพร่งานแล้ว'))}
                      >
                        เผยแพร่
                      </Button>
                    )}
                    {isTeacher && canManageAcademicItem(snapshot, membership.role, membership.profileId, work.classId, work.subjectId) && work.status === 'published' && (
                      <>
                        <Button size="sm" variant="secondary" onClick={() => { setEditing(work); setFormOpen(true); }}>แก้ไข</Button>
                        <Button size="sm" variant="ghost" onClick={() => setCancelling(work)}>ยกเลิกงาน</Button>
                      </>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => {
                      if (isTeacher) {
                        setSelectedTrackingWorkId(work.id);
                        setExpanded(null);
                      } else {
                        setExpanded(open ? null : work.id);
                        if (!open && ownStudent) void repository.markWorkOpened(work.id, ownStudent.id);
                      }
                    }}>
                      {open ? 'ซ่อน' : isTeacher ? 'ดูสถานะการส่ง' : 'เปิดงาน'}
                    </Button>
                  </div>
                </div>

                {work.instructions && <p className="work-card-instructions">{work.instructions}</p>}

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
                    {submission?.driveUrl && (
                      <div className="drive-submit-panel drive-submit-panel--saved">
                        <div><strong>ส่งผ่าน Google Drive แล้ว</strong><Badge tone="success">ลิงก์พร้อมเปิด</Badge></div>
                        <a href={submission.driveUrl} target="_blank" rel="noreferrer">เปิดไฟล์ที่ส่ง ↗</a>
                      </div>
                    )}
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
                          <div className="drive-submit-panel">
                            <div className="drive-submit-heading"><span className="drive-submit-icon">↗</span><div><strong>ส่งงานผ่าน Google Drive</strong><small>รูปแบบเดียวกับ Google Classroom</small></div></div>
                            <p>อัปโหลดไฟล์ใน Google Drive แล้วตั้งค่าแชร์เป็น “ทุกคนที่มีลิงก์” หรือแชร์ให้อีเมลครู จากนั้นวางลิงก์ไว้ที่นี่</p>
                            <Field label="ลิงก์ไฟล์หรือโฟลเดอร์ Google Drive">
                              <input
                                type="url"
                                value={turnInDriveUrls[work.id] ?? ''}
                                onChange={(event) => setTurnInDriveUrls((current) => ({ ...current, [work.id]: event.target.value }))}
                                placeholder="https://drive.google.com/..."
                                aria-describedby={`drive-hint-${work.id}`}
                              />
                            </Field>
                            <small id={`drive-hint-${work.id}`}>ระบบจะบันทึกลิงก์พร้อมเวลาและสถานะส่งตรงเวลา/ส่งช้าให้ครูตรวจได้ทันที</small>
                          </div>
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
      </section>

      {isTeacher && (
        <section className="assignment-section assignment-status-section" aria-labelledby="assignment-status-title">
          <CardHeader
            title={<span id="assignment-status-title">2 · สถานะการส่งงานของนักเรียน</span>}
            description="เลือกงานเพื่อดูการเปิดอ่าน การส่งช้า งานค้าง คะแนน และจัดการรายบุคคล"
            action={selectedTrackingWork && <Badge tone={workStateTone[selectedTrackingWork.state]}>{selectedTrackingWork.work.title}</Badge>}
          />
          {publishedItems.length === 0 ? (
            <EmptyState icon="◌" title="ยังไม่มีงานที่เผยแพร่" description="เผยแพร่งานจากส่วนที่ 1 แล้วสถานะของนักเรียนจะแสดงที่นี่" />
          ) : (
            <>
              <div className="assignment-work-picker" role="tablist" aria-label="เลือกงานเพื่อติดตาม">
                {publishedItems.map((item) => (
                  <button
                    key={item.work.id}
                    type="button"
                    className={item.work.id === selectedTrackingWork?.work.id ? 'is-active' : ''}
                    onClick={() => setSelectedTrackingWorkId(item.work.id)}
                  >
                    <span>{item.work.title}</span>
                    <small>{item.dueAt ? new Date(item.dueAt).toLocaleDateString('th-TH') : 'ไม่กำหนดวันส่ง'}</small>
                  </button>
                ))}
              </div>
              {selectedTrackingWork && (
                <>
                  <div className="ui-stat-grid tracking-summary-grid">
                    <Stat label="นักเรียนในห้อง" value={selectedWorkSummary.total} tone="brand" />
                    <Stat label="ส่งแล้ว" value={selectedWorkSummary.submitted} hint="รวมส่งตรงเวลาและส่งช้า" tone="success" />
                    <Stat label="ส่งช้า" value={selectedWorkSummary.late} tone={selectedWorkSummary.late > 0 ? 'warning' : 'neutral'} />
                    <Stat label="ยังไม่เรียบร้อย" value={selectedWorkSummary.waiting} hint="ค้าง / ใกล้ครบกำหนด / ขอแก้" tone={selectedWorkSummary.waiting > 0 ? 'danger' : 'neutral'} />
                  </div>
                  <WorkDetailPanel
                    work={selectedTrackingWork.work}
                    roster={roster}
                    actorProfileId={membership.profileId}
                    onMessage={setMessage}
                  />
                </>
              )}
            </>
          )}
        </section>
      )}

      {!isTeacher && (
        <section className="assignment-section student-status-section" aria-labelledby="student-status-title">
          <CardHeader
            title={<span id="student-status-title">2 · สถานะการส่งงานของฉัน</span>}
            description="สถานะเปลี่ยนทันทีหลังรับทราบหรือส่งงาน และระบบจะคำนวณว่าส่งตรงเวลาหรือส่งช้า"
          />
          <div className="ui-stat-grid tracking-summary-grid">
            <Stat label="งานทั้งหมด" value={publishedItems.length} tone="brand" />
            <Stat label="ส่งแล้ว" value={publishedItems.filter((item) => ['submitted', 'late', 'graded'].includes(item.state)).length} tone="success" />
            <Stat label="ส่งช้า" value={publishedItems.filter((item) => item.state === 'late').length} tone="warning" />
            <Stat label="ยังค้าง" value={publishedItems.filter((item) => ['overdue', 'urgent', 'soon', 'upcoming', 'revision_requested'].includes(item.state)).length} tone="danger" />
          </div>
          <div className="student-status-list">
            {publishedItems.length === 0 ? <EmptyState icon="✓" title="ยังไม่มีงานที่ต้องส่ง" description="เมื่อครูเผยแพร่งาน งานจะปรากฏที่ส่วนที่ 1" /> : publishedItems.map((item) => (
              <button key={item.work.id} type="button" className="student-status-row" onClick={() => setExpanded(item.work.id)}>
                <span className="student-status-copy"><strong>{item.work.title}</strong><small>{item.dueAt ? `กำหนดส่ง ${new Date(item.dueAt).toLocaleString('th-TH')}` : 'ไม่กำหนดวันส่ง'}</small></span>
                <Badge tone={workStateTone[item.state]}>{workStateLabels[item.state]}</Badge>
                <span className="student-status-arrow">ดูงาน →</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {isTeacher && (
        <section className="assignment-section tracking-panel" aria-labelledby="class-overview-title">
          <CardHeader
            title={<span id="class-overview-title">3 · ภาพรวมห้องเรียนทั้งหมด</span>}
            description="ดูว่านักเรียนคนไหนส่งแล้ว ส่งช้า หรือยังมีงานค้าง พร้อมเปิดรายละเอียดเชิงลึก"
            action={<Badge tone={trackingSummary.attention > 0 ? 'warning' : 'success'}>{trackingSummary.attention > 0 ? `ต้องตาม ${trackingSummary.attention} คน` : 'ทุกคนตามทัน'}</Badge>}
          />
          <div className="ui-stat-grid tracking-summary-grid">
            <Stat label="นักเรียนในห้อง" value={trackingSummary.students} tone="brand" />
            <Stat label="ส่งแล้ว" value={trackingSummary.submitted} hint="รวมทุกงาน" tone="success" />
            <Stat label="ส่งช้า" value={trackingSummary.late} hint="ควรเช็กกำหนดส่ง" tone={trackingSummary.late > 0 ? 'warning' : 'neutral'} />
            <Stat label="ยังมีงานค้าง" value={trackingSummary.waiting} hint="ยังไม่ส่งหรือขอแก้ไข" tone={trackingSummary.waiting > 0 ? 'danger' : 'neutral'} />
          </div>
          <div className="tracking-toolbar">
            <Field label="ค้นหานักเรียน">
              <input value={trackingQuery} onChange={(event) => setTrackingQuery(event.target.value)} placeholder="ชื่อหรือรหัสนักเรียน" />
            </Field>
            <Segmented ariaLabel="กรองการส่งงานของนักเรียน" value={trackingFilter} onChange={setTrackingFilter} options={trackingFilterOptions} />
          </div>
          {visibleTrackingRows.length === 0 ? (
            <EmptyState icon="✓" title="ไม่พบรายการที่ตรงกัน" description="ลองเปลี่ยนคำค้นหาหรือตัวกรองการส่งงาน" />
          ) : (
            <div className="tracking-list">
              {visibleTrackingRows.map((row) => (
                <article key={row.student.id} className={`tracking-row ${row.bucket}`}>
                  <ProfileAvatar displayName={row.student.displayName} avatarId={row.student.avatarId} avatarIndex={row.student.avatarIndex} avatarConfig={row.student.avatarConfig} size={44} />
                  <div className="tracking-person">
                    <strong>{row.student.displayName}</strong>
                    <span>{row.student.studentCode} · {row.totalWork === 0 ? 'ยังไม่มีงานที่เผยแพร่' : `ส่งแล้ว ${row.submitted}/${row.totalWork} งาน`}</span>
                    {row.totalWork > 0 && <ProgressBar value={row.completionRate} max={100} label={`${row.completionRate}%`} tone={row.bucket === 'attention' ? 'warning' : 'brand'} />}
                  </div>
                  <div className="tracking-counts">
                    {row.late > 0 && <span className="tracking-count warning">ช้า {row.late}</span>}
                    {row.overdue > 0 && <span className="tracking-count danger">ค้าง {row.overdue}</span>}
                    {row.revisionRequested > 0 && <span className="tracking-count warning">ขอแก้ {row.revisionRequested}</span>}
                    {row.late === 0 && row.overdue === 0 && row.revisionRequested === 0 && <span className="tracking-count success">เรียบร้อย</span>}
                  </div>
                  <LinkButton size="sm" variant={row.bucket === 'attention' ? 'primary' : 'ghost'} to={`/students/${row.student.id}`}>
                    ดูรายละเอียด
                  </LinkButton>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {formOpen && canCreateWork && (
        <WorkFormModal
          classId={effectiveClassId}
          className={classroom?.name ?? ''}
          subjects={membership.role === 'admin' ? subjects : manageableSubjects}
          rubrics={snapshot.rubrics}
          works={snapshot.assignments}
          editing={editing}
          actorProfileId={membership.profileId}
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
          description={`ส่งถึงนักเรียน ${roster.length} คนและผู้ปกครองที่เชื่อมบัญชีในห้องนี้ · นักเรียนส่งประกาศเองไม่ได้`}
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
                    .then(() => { setAnnouncing(false); setMessage('ส่งประกาศให้นักเรียนและผู้ปกครองที่เชื่อมบัญชีแล้ว'); });
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
