import { useMemo, useState, type FormEvent } from 'react';
import { useSession } from '../../app/SessionContext';
import { useRepository, useSchoolSnapshot } from '../../data/RepositoryContext';
import { consentedStudents } from '../../data/selectors';
import type { SchoolSnapshot } from '../../data/schoolRepository';
import type { AchievementKey } from '../../domain/types';
import { achievementCatalog, achievementFor } from './achievementCatalog';
import {
  Badge, Button, Card, CardHeader, EmptyState, Field, FieldGroup, PageHeader, SearchInput, Stat,
  Toolbar, Tooltip
} from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { useToast } from '../../ui/toastContext';

export function AchievementsPage() {
  const { membership } = useSession();
  const repository = useRepository();
  const snapshot = useSchoolSnapshot();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');

  const canAward = membership.role === 'admin' || membership.role === 'teacher';
  const ownStudent = snapshot.students.find((student) => student.profileId === membership.profileId);

  // A student sees their own wall; a parent sees the children they are linked to; staff see everyone.
  const visibleStudents = useMemo(() => {
    if (canAward) return snapshot.students;
    if (ownStudent) return [ownStudent];
    return consentedStudents(snapshot);
  }, [canAward, ownStudent, snapshot]);

  const byStudent = useMemo(() => {
    const map = new Map<string, SchoolSnapshot['achievements']>();
    for (const badge of snapshot.achievements) {
      map.set(badge.studentId, [...(map.get(badge.studentId) ?? []), badge]);
    }
    return map;
  }, [snapshot.achievements]);

  async function award(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setBusy(true);
    try {
      await repository.awardAchievement({
        studentId: String(values.get('studentId') ?? ''),
        achievementKey: String(values.get('achievementKey') ?? '') as AchievementKey,
        note: String(values.get('note') ?? ''),
        awardedBy: membership.profileId
      });
      form.reset();
      toast('มอบเหรียญรางวัลแล้ว');
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : 'มอบเหรียญไม่สำเร็จ', { tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  const needle = query.trim().toLocaleLowerCase('th');
  const shownStudents = needle
    ? visibleStudents.filter((student) => student.displayName.toLocaleLowerCase('th').includes(needle)
      || student.studentCode.toLocaleLowerCase('th').includes(needle))
    : visibleStudents;
  const awardedStudents = visibleStudents.filter((student) => (byStudent.get(student.id) ?? []).length > 0).length;

  return (
    <>
      <PageHeader
        eyebrow="การยกย่องเชิงบวก"
        title="เหรียญรางวัล"
        description="เหรียญบอกสิ่งที่นักเรียนทำได้ ไม่มีเหรียญที่บอกสิ่งที่ทำไม่ได้ · เหรียญที่ได้รับแล้วจะไม่ถูกเรียกคืน"
      />

      <div className="ui-stat-grid">
        <Stat label="เหรียญที่มอบแล้ว" value={snapshot.achievements.length} hint="ทั้งโรงเรียน" tone="brand" icon={<Icon name="achievements" size={18} />} />
        <Stat
          label="นักเรียนที่ได้รับ"
          value={awardedStudents}
          hint={`จาก ${visibleStudents.length} คนที่คุณดูได้`}
          tone={awardedStudents > 0 ? 'success' : 'neutral'}
          icon={<Icon name="students" size={18} />}
        />
        <Stat label="ชนิดเหรียญ" value={achievementCatalog.length} hint="ดูรายการทั้งหมดด้านล่าง" tone="info" icon={<Icon name="star" size={18} />} />
      </div>

      {canAward && (
        <Card>
          <CardHeader
            title="มอบเหรียญ"
            description="มอบเหรียญเดิมซ้ำจะไม่เกิดรายการซ้ำ ระบบถือว่าเหรียญนั้นมอบไปแล้ว"
          />
          <form onSubmit={(event) => void award(event)}>
            <FieldGroup columns={3}>
              <Field label="นักเรียน">
                <select name="studentId" required defaultValue="">
                  <option value="" disabled>เลือกนักเรียน</option>
                  {snapshot.students.map((student) => (
                    <option key={student.id} value={student.id}>{student.displayName} · {student.studentCode}</option>
                  ))}
                </select>
              </Field>
              <Field label="เหรียญ">
                <select name="achievementKey" required defaultValue="">
                  <option value="" disabled>เลือกเหรียญ</option>
                  {achievementCatalog.map((item) => (
                    <option key={item.key} value={item.key}>{item.icon} {item.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="เหตุผล" hint="ไม่บังคับ · นักเรียนและผู้ปกครองจะเห็นข้อความนี้">
                <input name="note" maxLength={200} placeholder="เช่น ส่งงานครบ 5 ชิ้นติดต่อกัน" />
              </Field>
            </FieldGroup>
            <div className="ui-form-actions">
              <Button variant="primary" loading={busy} icon={<Icon name="star" size={16} />}>มอบเหรียญ</Button>
            </div>
          </form>
        </Card>
      )}

      <Card>
        <CardHeader
          title="เหรียญของนักเรียน"
          description="แตะหรือชี้ที่เหรียญเพื่อดูเหตุผลที่ครูบันทึกไว้"
          action={<Badge tone="neutral">{shownStudents.length} คน</Badge>}
        />
        {visibleStudents.length > 1 && (
          <Toolbar>
            <SearchInput value={query} onChange={setQuery} placeholder="ค้นหาชื่อหรือเลขประจำตัว" label="ค้นหานักเรียน" />
          </Toolbar>
        )}
        {shownStudents.length === 0 ? (
          <EmptyState
            icon={<Icon name={visibleStudents.length === 0 ? 'students' : 'search'} size={28} />}
            title={visibleStudents.length === 0 ? 'ยังไม่มีนักเรียนที่ดูข้อมูลได้' : 'ไม่พบนักเรียนที่ค้นหา'}
            description={visibleStudents.length === 0
              ? 'ผู้ปกครองจะเห็นเฉพาะบุตรหลานที่โรงเรียนยืนยันความสัมพันธ์แล้ว'
              : `ไม่มีชื่อหรือเลขประจำตัวที่ตรงกับ “${query}”`}
            {...(visibleStudents.length > 0 ? { action: <Button variant="secondary" onClick={() => setQuery('')}>ล้างการค้นหา</Button> } : {})}
          />
        ) : (
          <ul className="award-list">
            {shownStudents.map((student) => {
              const badges = byStudent.get(student.id) ?? [];
              return (
                <li key={student.id}>
                  <div className="award-who">
                    <strong>{student.displayName}</strong>
                    <span>{student.studentCode}</span>
                  </div>
                  {badges.length === 0 ? (
                    <span className="award-none">ยังไม่มีเหรียญ</span>
                  ) : (
                    <div className="badge-row">
                      {badges.map((badge) => {
                        const definition = achievementFor(badge.achievementKey);
                        return (
                          // The reason used to live only in a title attribute, which a phone or a
                          // tablet never shows at all — and the reason is the whole point of the badge.
                          <Tooltip key={badge.id} tip={badge.note || definition.description}>
                            <span className="achievement-badge">
                              <span aria-hidden="true">{definition.icon}</span>
                              {definition.label}
                            </span>
                          </Tooltip>
                        );
                      })}
                    </div>
                  )}
                  <Badge tone={badges.length > 0 ? 'success' : 'neutral'}>{badges.length} เหรียญ</Badge>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="เหรียญทั้งหมดในระบบ" description="ทุกเหรียญบอกสิ่งที่ทำได้ ไม่มีเหรียญที่ใช้ตำหนิ" />
        <ul className="badge-catalog">
          {achievementCatalog.map((item) => (
            <li key={item.key}>
              <span aria-hidden="true" className="badge-icon">{item.icon}</span>
              <div><strong>{item.label}</strong><span>{item.description}</span></div>
            </li>
          ))}
        </ul>
      </Card>

    </>
  );
}
