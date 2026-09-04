import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useSession } from '../../app/SessionContext';
import { recall, remember } from '../../app/deviceMemory';
import { useRepository, useSchoolSnapshot } from '../../data/RepositoryContext';
import { Badge, Button, Card, CardHeader, Field, FieldGroup, PageHeader } from '../../ui/components';
import { AvatarPicker } from '../avatars/AvatarPicker';
import { ProfileAvatar } from '../avatars/ProfileAvatar';
import { useToast } from '../../ui/toastContext';

const roleLabels = { admin: 'ผู้ดูแลระบบ', teacher: 'ครู', student: 'นักเรียน', parent: 'ผู้ปกครอง' } as const;
const avatarStorageKey = (profileId: string) => `smart-classroom.avatar.${profileId}`;

/**
 * Everyone's own account page: pick your avatar, decide which non-critical reminders you want.
 * It only ever reads and writes the signed-in person's own record.
 */
export function ProfilePage() {
  const { membership } = useSession();
  const repository = useRepository();
  const snapshot = useSchoolSnapshot();
  const [pickerOpen, setPickerOpen] = useState(false);
  const { toast } = useToast();
  const [error, setError] = useState<string | null>(null);
  const [localAvatarId, setLocalAvatarId] = useState(() => recall(avatarStorageKey(membership.profileId)));

  useEffect(() => {
    setLocalAvatarId(recall(avatarStorageKey(membership.profileId)));
  }, [membership.profileId]);

  const student = snapshot.students.find((item) => item.profileId === membership.profileId);
  const teacher = snapshot.teachers.find((item) => item.profileId === membership.profileId);
  const parentLink = snapshot.parentLinks.find((item) => item.profileId === membership.profileId || item.lineUserId === membership.profileId);

  const avatarId = student?.avatarId ?? teacher?.avatarId ?? parentLink?.avatarId
    ?? localAvatarId;
  const avatarPhotoId = student?.avatarPhotoId ?? teacher?.avatarPhotoId ?? parentLink?.avatarPhotoId ?? null;
  const photoInput = useRef<HTMLInputElement>(null);
  const canPickAvatar = membership.role === 'admin' || ['teacher', 'student', 'parent'].includes(membership.role);
  const preference = snapshot.notificationPreferences.find((item) => item.profileId === membership.profileId);

  async function saveAvatar(nextAvatarId: string) {
    if (membership.role === 'admin') {
      remember(avatarStorageKey(membership.profileId), nextAvatarId);
      setLocalAvatarId(nextAvatarId);
    } else {
      await repository.saveOwnAvatar(membership.profileId, membership.role, nextAvatarId);
    }
    remember(avatarStorageKey(membership.profileId), nextAvatarId);
    setLocalAvatarId(nextAvatarId);
    window.dispatchEvent(new Event('smart-classroom:avatar-changed'));
    toast('บันทึก avatar แล้ว');
  }

  async function uploadPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || membership.role === 'admin') return;
    setError(null);
    try {
      await repository.saveOwnAvatarPhoto(membership.profileId, membership.role, file);
      toast('อัปโหลดรูปโปรไฟล์แล้ว');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'อัปโหลดรูปไม่สำเร็จ');
    }
  }

  async function removePhoto() {
    if (membership.role === 'admin') return;
    try {
      await repository.clearOwnAvatarPhoto(membership.profileId, membership.role);
      toast('กลับไปใช้ avatar แบบวาดแล้ว');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'ลบรูปไม่สำเร็จ');
    }
  }

  async function savePreferences(form: HTMLFormElement) {
    const data = new FormData(form);
    try {
      await repository.saveNotificationPreference({
        profileId: membership.profileId,
        assignmentReminder: data.get('assignmentReminder') === 'on',
        projectReminder: data.get('projectReminder') === 'on',
        gradeNotification: data.get('gradeNotification') === 'on',
        quietHoursStart: String(data.get('quietStart') ?? '') || null,
        quietHoursEnd: String(data.get('quietEnd') ?? '') || null
      });
      toast('บันทึกการตั้งค่าการแจ้งเตือนแล้ว');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'บันทึกไม่สำเร็จ');
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="บัญชีของฉัน"
        title="โปรไฟล์"
        description="ปรับ avatar และการแจ้งเตือนของบัญชีตัวเอง — ไม่สามารถแก้ไขของผู้อื่นได้"
      />

      <div className="profile-grid">
        <Card className="profile-card">
          <div className="profile-identity">
            <ProfileAvatar
              displayName={membership.displayName}
              avatarId={avatarId}
              avatarPhotoId={avatarPhotoId}
              {...(student ? { avatarIndex: student.avatarIndex, avatarConfig: student.avatarConfig } : {})}
              size={120}
              animation="wave"
            />
            <div>
              <h2>{membership.displayName}</h2>
              <p>{membership.schoolName}</p>
              <div className="profile-badges">
                <Badge tone="brand">{roleLabels[membership.role]}</Badge>
                {avatarPhotoId
                  ? <Badge tone="neutral">รูปที่อัปโหลด</Badge>
                  : avatarId
                    ? <Badge tone="neutral">{avatarId}</Badge>
                    : <Badge tone="neutral">ใช้ตัวอักษรย่อ</Badge>}
              </div>
            </div>
          </div>
          {canPickAvatar ? (
            <div className="profile-photo-actions">
              <Button variant="primary" onClick={() => setPickerOpen(true)}>เปลี่ยน Avatar</Button>
              {membership.role === 'admin' ? (
                <p className="ui-field-hint">ผู้ดูแลระบบเลือก Avatar ได้จากคลัง Avatar Gallery</p>
              ) : (
                <>
                  <Button variant="secondary" onClick={() => photoInput.current?.click()}>อัปโหลดรูปของฉัน</Button>
                  {avatarPhotoId && <Button variant="ghost" onClick={() => void removePhoto()}>ลบรูปที่อัปโหลด</Button>}
                  <input
                    ref={photoInput}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    hidden
                    onChange={(event) => void uploadPhoto(event)}
                  />
                </>
              )}
            </div>
          ) : (
            <p className="ui-field-hint">บัญชีนี้ยังไม่มีข้อมูลเจ้าของโปรไฟล์สำหรับเปลี่ยน avatar</p>
          )}
        </Card>

        <Card>
          <CardHeader
            title="การแจ้งเตือน"
            description="ปิดได้เฉพาะการเตือนที่ไม่ใช่ประกาศสำคัญจากครู"
          />
          <form onSubmit={(event) => { event.preventDefault(); void savePreferences(event.currentTarget); }}>
            <FieldGroup columns={1}>
              <label className="switch-row">
                <input type="checkbox" name="assignmentReminder" defaultChecked={preference?.assignmentReminder ?? true} />
                <span><strong>เตือนงานและการบ้าน</strong><small>เตือนตามกำหนดที่ครูตั้งไว้</small></span>
              </label>
              <label className="switch-row">
                <input type="checkbox" name="projectReminder" defaultChecked={preference?.projectReminder ?? true} />
                <span><strong>เตือนโครงงาน</strong><small>งานชิ้นใหญ่ที่ใช้เวลาหลายวัน</small></span>
              </label>
              <label className="switch-row">
                <input type="checkbox" name="gradeNotification" defaultChecked={preference?.gradeNotification ?? true} />
                <span><strong>แจ้งเมื่อครูตรวจงานแล้ว</strong><small>คะแนนและความเห็นของครู</small></span>
              </label>
            </FieldGroup>
            <FieldGroup title="ช่วงเวลาเงียบ">
              <Field label="เริ่ม" hint="เลื่อนการเตือนไปหลังช่วงนี้">
                <input type="time" name="quietStart" defaultValue={preference?.quietHoursStart ?? '21:00'} />
              </Field>
              <Field label="สิ้นสุด">
                <input type="time" name="quietEnd" defaultValue={preference?.quietHoursEnd ?? '06:00'} />
              </Field>
            </FieldGroup>
            <Button variant="primary">บันทึกการตั้งค่า</Button>
            {error && <p className="ui-field-message" role="alert">{error}</p>}
          </form>
        </Card>
      </div>

      {pickerOpen && (
        <AvatarPicker
          displayName={membership.displayName}
          currentAvatarId={avatarId}
          onSave={saveAvatar}
          onClose={() => setPickerOpen(false)}
        />
      )}

    </>
  );
}
