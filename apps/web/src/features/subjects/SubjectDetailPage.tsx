import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type CSSProperties, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { useSession } from '../../app/SessionContext';
import { useRepository, useSchoolSnapshot } from '../../data/RepositoryContext';
import { consentedStudents } from '../../data/selectors';
import { subjectColor } from '../../data/subjectCatalog';
import { teacherLinksForProfile } from '../../data/teacherResponsibilities';
import { Badge, Button, Card, CardHeader, EmptyState, Field, PageHeader } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { SubjectIcon } from './SubjectIcon';
import { useToast } from '../../ui/toastContext';
import { handleSubjectRequest, listSubjectRequests, raiseSubjectRequest, type SubjectRequest } from './subjectRequests';

const fileSize = (bytes: number): string => bytes > 1024 * 1024
  ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  : `${Math.max(1, Math.round(bytes / 1024))} KB`;

const whenLabel = (value: string): string => {
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? '' : at.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
};

/**
 * One subject: who teaches it, what it has been given to learn from, and how to ask about it.
 *
 * The subject list was a catalogue — a name, a colour and a count — and everything a subject
 * actually holds lived somewhere else, filed under a class or a piece of work. This is the subject
 * itself: the staff who teach it, the rooms that take it, the material a teacher publishes for it,
 * and the questions guardians have asked about it.
 *
 * Four roles, four different pages, from the same rows:
 *   * a teacher of this subject publishes material and closes questions;
 *   * an administrator can do both anywhere, being responsible for the whole school;
 *   * a student reads the material, which is what it is for;
 *   * a guardian reads it too, and — alone among the roles — can ask a question about their own
 *     child, because a guardian with a question and no way to ask is how a school gets a phone call
 *     at eight in the morning.
 */
export function SubjectDetailPage() {
  const { subjectId = '' } = useParams();
  const { membership } = useSession();
  const repository = useRepository();
  const snapshot = useSchoolSnapshot();
  const { toast } = useToast();

  const subject = snapshot.subjects.find((item) => item.id === subjectId) ?? null;
  const [requests, setRequests] = useState<SubjectRequest[]>([]);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [aboutStudentId, setAboutStudentId] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);

  /** The staff on this subject, and the rooms they take it in. */
  const staff = useMemo(() => {
    const rows = snapshot.classTeachers.filter((link) => link.subjectId === subjectId && !link.deletedAt);
    return rows.map((link) => ({
      id: link.id,
      teacherName: snapshot.teachers.find((teacher) => teacher.id === link.teacherId)?.displayName ?? 'ครูของโรงเรียน',
      className: snapshot.classes.find((classroom) => classroom.id === link.classId)?.name ?? '',
      owner: link.role === 'primary'
    }));
  }, [snapshot.classTeachers, snapshot.classes, snapshot.teachers, subjectId]);

  const teachesThis = useMemo(
    () => membership.role === 'teacher'
      && teacherLinksForProfile(snapshot, membership.profileId).some((link) => link.subjectId === subjectId),
    [membership.profileId, membership.role, snapshot, subjectId]
  );
  const canPublish = membership.role === 'admin' || teachesThis;
  const canHandle = canPublish;
  const canAsk = membership.role === 'parent';

  const materials = useMemo(
    () => snapshot.attachments
      .filter((item) => item.ownerType === 'subject' && item.ownerId === subjectId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    [snapshot.attachments, subjectId]
  );

  const children = useMemo(() => consentedStudents(snapshot), [snapshot]);

  const loadRequests = useCallback(async () => {
    if (!subjectId) return;
    try {
      setRequests(await listSubjectRequests(membership.schoolId, subjectId));
      setRequestError(null);
    } catch (reason) {
      // Requests live on the server only, so a device with no connection has none to show. Saying
      // so is better than an empty list that reads as "nobody has ever asked".
      setRequestError(reason instanceof Error ? reason.message : 'อ่านคำร้องไม่สำเร็จ');
    }
  }, [membership.schoolId, subjectId]);

  useEffect(() => { void loadRequests(); }, [loadRequests]);
  useEffect(() => {
    if (subjectId) void repository.refreshAttachments('subject', subjectId).catch(() => undefined);
  }, [repository, subjectId]);

  if (!subject) {
    return (
      <>
        <PageHeader eyebrow="รายวิชา" title="ไม่พบรายวิชานี้" />
        <Card>
          <EmptyState
            icon={<Icon name="subjects" size={28} />}
            title="ไม่พบรายวิชานี้"
            description="รายวิชาอาจถูกเก็บถาวรไปแล้ว หรือคุณไม่มีสิทธิ์ดูรายวิชานี้"
          />
        </Card>
      </>
    );
  }

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      await repository.addAttachment({
        ownerType: 'subject', ownerId: subjectId, file, uploadedBy: membership.profileId
      });
      toast(`เพิ่มบทเรียน "${file.name}" แล้ว`);
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : 'อัปโหลดไม่สำเร็จ', { tone: 'error' });
    } finally {
      setUploading(false);
    }
  }

  /** Opens a lesson in a new tab: a video plays, a PDF renders, everything else downloads. */
  async function open(attachmentId: string, fileName: string) {
    try {
      const blob = await repository.openAttachment(attachmentId);
      if (!blob) { toast('ยังดาวน์โหลดไฟล์นี้ไม่ได้', { tone: 'error' }); return; }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener';
      link.download = fileName;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : 'เปิดไฟล์ไม่สำเร็จ', { tone: 'error' });
    }
  }

  async function ask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (body.trim().length < 5) { toast('พิมพ์รายละเอียดอย่างน้อย 5 ตัวอักษร', { tone: 'error' }); return; }
    setSending(true);
    try {
      await raiseSubjectRequest({
        schoolId: membership.schoolId,
        subjectId,
        studentId: aboutStudentId || null,
        body: body.trim()
      });
      setBody('');
      toast('ส่งคำร้องถึงครูผู้สอนแล้ว');
      await loadRequests();
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : 'ส่งคำร้องไม่สำเร็จ', { tone: 'error' });
    } finally {
      setSending(false);
    }
  }

  async function close(requestId: string) {
    try {
      await handleSubjectRequest(membership.schoolId, requestId);
      await loadRequests();
      toast('ทำเครื่องหมายว่าดำเนินการแล้ว');
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : 'อัปเดตคำร้องไม่สำเร็จ', { tone: 'error' });
    }
  }

  const color = subjectColor(subject.colorIndex);
  const openRequests = requests.filter((item) => item.status === 'open');

  return (
    <>
      <PageHeader
        eyebrow="รายวิชา"
        title={subject.name}
        description={`${subject.code}${subject.nameEn ? ` · ${subject.nameEn}` : ''} · ${staff.length} คาบมอบหมายให้ครู`}
        action={canPublish && (
          <label className="subject-upload">
            <input type="file" hidden onChange={(event) => void upload(event)} disabled={uploading} />
            <span className="ui-button ui-button-primary ui-size-md">{uploading ? 'กำลังอัปโหลด…' : '+ เพิ่มบทเรียน'}</span>
          </label>
        )}
      />

      <Card className="subject-hero">
        {/* The subject's colour is carried on the inner element: `Card` takes a class, not a style,
            and the tint is a property of this block rather than of the card around it. */}
        <div className="subject-hero-head subject-tint" style={{ '--subject-color': color.solid } as CSSProperties}>
          <span className="subject-card-icon"><SubjectIcon iconKey={subject.iconKey} size={26} /></span>
          <div>
            <strong>{subject.name}</strong>
            <span>{staff.length === 0 ? 'ยังไม่มีครูผู้สอน' : staff.map((row) => row.teacherName).filter((name, index, all) => all.indexOf(name) === index).join(' · ')}</span>
          </div>
          <Badge tone={subject.status === 'active' ? 'success' : 'neutral'}>
            {subject.status === 'active' ? 'เปิดสอน' : 'เก็บถาวร'}
          </Badge>
        </div>
        {staff.length > 0 && (
          <ul className="subject-staff-list">
            {staff.map((row) => (
              <li key={row.id}>
                <Icon name="teachers" size={14} />
                <span>{row.teacherName}</span>
                <Badge tone={row.owner ? 'brand' : 'neutral'}>
                  {row.className ? `${row.owner ? 'ครูเจ้าของวิชา' : 'ครูร่วมสอน'} · ${row.className}` : 'ครูผู้สอน'}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader
          title={`บทเรียนและสื่อการสอน ${materials.length > 0 ? `(${materials.length})` : ''}`.trim()}
          description={canPublish
            ? 'อัปโหลดวิดีโอ ใบงาน สไลด์ หรือไฟล์อื่นที่แอปรองรับ · นักเรียนและผู้ปกครองในโรงเรียนเปิดดูได้'
            : 'สื่อการสอนที่ครูผู้สอนเผยแพร่ไว้สำหรับวิชานี้'}
        />
        {materials.length === 0 ? (
          <EmptyState
            icon={<Icon name="assignments" size={28} />}
            title="ยังไม่มีบทเรียนในวิชานี้"
            description={canPublish
              ? 'กด "เพิ่มบทเรียน" เพื่ออัปโหลดไฟล์แรก · ไฟล์ละไม่เกิน 15 MB'
              : 'เมื่อครูผู้สอนเผยแพร่บทเรียน จะปรากฏที่นี่'}
          />
        ) : (
          <ul className="subject-material-list">
            {materials.map((item) => (
              <li key={item.id}>
                <span className="subject-material-icon" aria-hidden="true">
                  <Icon name={item.kind === 'video' ? 'quiz' : item.kind === 'image' ? 'palette' : 'assignments'} size={18} />
                </span>
                <span className="subject-material-copy">
                  <strong>{item.fileName}</strong>
                  <small>{fileSize(item.byteSize)} · {whenLabel(item.createdAt)}</small>
                </span>
                <Button size="sm" variant="secondary" onClick={() => void open(item.id, item.fileName)}>เปิด</Button>
                {canPublish && (
                  <Button size="sm" variant="ghost" onClick={() => void repository.removeAttachment(item.id)}>ลบ</Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {canAsk && (
        <Card>
          <CardHeader
            title="ติดต่อครูผู้สอน"
            description="ส่งคำร้องหรือคำถามถึงครูที่สอนวิชานี้ · ครูผู้สอนและผู้ดูแลระบบเท่านั้นที่อ่านได้"
          />
          <form onSubmit={(event) => void ask(event)}>
            {children.length > 0 && (
              <Field label="เกี่ยวกับบุตรหลาน" hint="ไม่บังคับ · เลือกเมื่อคำถามเกี่ยวกับลูกคนใดคนหนึ่ง">
                <select value={aboutStudentId} onChange={(event) => setAboutStudentId(event.target.value)}>
                  <option value="">ไม่ระบุ (ถามเกี่ยวกับวิชานี้)</option>
                  {children.map((child) => <option key={child.id} value={child.id}>{child.displayName}</option>)}
                </select>
              </Field>
            )}
            <Field label="รายละเอียด" hint="เช่น ขอสื่อการสอนย้อนหลัง หรือสอบถามงานที่ค้างส่ง">
              <textarea value={body} onChange={(event) => setBody(event.target.value)} rows={4} maxLength={2000} required />
            </Field>
            <div className="ui-form-actions">
              <Button variant="primary" type="submit" loading={sending} disabled={body.trim().length < 5}>
                ส่งคำร้อง
              </Button>
            </div>
          </form>
        </Card>
      )}

      {(canHandle || canAsk) && (
        <Card>
          <CardHeader
            title={canHandle ? `คำร้องถึงวิชานี้ ${openRequests.length > 0 ? `· ค้าง ${openRequests.length}` : ''}`.trim() : 'คำร้องที่คุณส่งไว้'}
            description={canHandle
              ? 'คำร้องจากผู้ปกครองของนักเรียนที่เรียนวิชานี้'
              : 'สถานะคำร้องที่คุณส่งถึงครูผู้สอน'}
          />
          {requestError ? (
            <EmptyState
              icon={<Icon name="warning" size={28} />}
              title="ยังอ่านคำร้องไม่ได้"
              description={`${requestError} · คำร้องอยู่บนเซิร์ฟเวอร์ ต้องเชื่อมต่ออินเทอร์เน็ตจึงจะอ่านได้`}
            />
          ) : requests.length === 0 ? (
            <EmptyState
              icon={<Icon name="bell" size={28} />}
              title="ยังไม่มีคำร้อง"
              description={canHandle ? 'เมื่อผู้ปกครองส่งคำร้องถึงวิชานี้ จะขึ้นที่นี่' : 'คำร้องที่คุณส่งจะแสดงสถานะที่นี่'}
            />
          ) : (
            <ul className="subject-request-list">
              {requests.map((request) => (
                <li key={request.id} data-status={request.status}>
                  <div className="subject-request-copy">
                    <div className="subject-request-head">
                      <strong>{request.raisedByName || 'ผู้ปกครอง'}</strong>
                      <Badge tone={request.status === 'open' ? 'warning' : 'success'}>
                        {request.status === 'open' ? 'รอดำเนินการ' : 'ดำเนินการแล้ว'}
                      </Badge>
                      {request.studentId && (
                        <Badge tone="neutral">
                          {snapshot.students.find((student) => student.id === request.studentId)?.displayName ?? 'นักเรียน'}
                        </Badge>
                      )}
                    </div>
                    <p>{request.body}</p>
                    <span className="subject-request-meta">{whenLabel(request.createdAt)}</span>
                  </div>
                  {canHandle && request.status === 'open' && (
                    <Button size="sm" variant="secondary" onClick={() => void close(request.id)}>ดำเนินการแล้ว</Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </>
  );
}
