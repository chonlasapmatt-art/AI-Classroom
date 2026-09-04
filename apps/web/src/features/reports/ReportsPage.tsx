import { useMemo, useState } from 'react';
import { useSession } from '../../app/SessionContext';
import { useSchoolSnapshot } from '../../data/RepositoryContext';
import { activeClasses, consentedStudents } from '../../data/selectors';
import { achievementFor } from '../achievements/achievementCatalog';
import type { AchievementKey } from '../../domain/types';
import { Card, EmptyState, PageHeader, Toolbar } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { ReportView } from './ReportView';
import {
  buildPersonalReport, buildReport, personalReportChart, personalReportTitles, personalToCsv,
  reportChart, reportTitles, toCsv,
  type PersonalReportId, type PersonalReportTable, type ReportId, type ReportTable
} from './reportBuilders';

const reportIds = Object.keys(reportTitles) as ReportId[];
const personalReportIds = Object.keys(personalReportTitles) as PersonalReportId[];

/** Downloads a report as CSV. The same act for both shapes, so it is written once. */
function download(name: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

export function ReportsPage() {
  const { membership } = useSession();
  if (membership.role === 'student') return <StudentReports />;
  if (membership.role === 'parent') return <ParentReports />;
  return <StaffReports />;
}

/**
 * A student's own record, and a guardian's view of one child's.
 *
 * Same four reports, one subject. The rows come out of the snapshot the repository already narrowed
 * to this reader, so nothing here has to remember to filter — a report that widened would have to
 * get past the data layer first.
 */
function PersonalReports({ studentId, students, onSelect, audience }: {
  studentId: string;
  students: { id: string; displayName: string }[];
  onSelect?: (id: string) => void;
  audience: 'student' | 'parent';
}) {
  const snapshot = useSchoolSnapshot();
  const [reportId, setReportId] = useState<PersonalReportId>('attendance');
  const badgeLabel = (key: string) => achievementFor(key as AchievementKey).label;
  const report: PersonalReportTable = useMemo(
    () => buildPersonalReport(reportId, snapshot, studentId, badgeLabel),
    [reportId, snapshot, studentId]
  );
  const chart = useMemo(() => personalReportChart(report), [report]);
  const owner = students.find((item) => item.id === studentId);

  return (
    <>
      <PageHeader
        eyebrow={audience === 'parent' ? 'รายงานของลูก · ดูอย่างเดียว' : 'รายงานของฉัน'}
        title={report.title}
        description={owner ? `${owner.displayName} · ข้อมูลเฉพาะของบัญชีนี้เท่านั้น` : 'ข้อมูลเฉพาะของบัญชีนี้เท่านั้น'}
      />
      <ReportView
        title={report.title}
        eyebrow={`${report.rows.length} รายการ`}
        columns={report.columns}
        rows={report.rows}
        chart={chart}
        onExport={(rows) => download(`${report.id}-${studentId}.csv`, personalToCsv({ ...report, rows }))}
        emptyTitle="ยังไม่มีข้อมูลในรายงานนี้"
        emptyDescription="เมื่อครูบันทึกข้อมูลแล้ว รายการจะแสดงที่นี่"
        controls={
          <Toolbar>
            <label>
              รายงาน
              <select value={reportId} onChange={(event) => setReportId(event.target.value as PersonalReportId)}>
                {personalReportIds.map((id) => <option key={id} value={id}>{personalReportTitles[id]}</option>)}
              </select>
            </label>
            {onSelect && (
              <label>
                นักเรียน
                <select value={studentId} onChange={(event) => onSelect(event.target.value)}>
                  {students.map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}
                </select>
              </label>
            )}
          </Toolbar>
        }
      />
    </>
  );
}

function StudentReports() {
  const { membership } = useSession();
  const snapshot = useSchoolSnapshot();
  const me = snapshot.students.find((item) => item.profileId === membership.profileId);
  if (!me) {
    return (
      <>
        <PageHeader eyebrow="รายงานของฉัน" title="รายงานของฉัน" />
        <Card>
          <EmptyState
            icon={<Icon name="reports" size={28} />}
            title="ยังไม่มีข้อมูลของคุณ"
            description="เมื่อครูบันทึกการเข้าเรียนหรือคะแนนแล้ว รายงานของคุณจะแสดงที่นี่"
          />
        </Card>
      </>
    );
  }
  return <PersonalReports studentId={me.id} students={[me]} audience="student" />;
}

function ParentReports() {
  const snapshot = useSchoolSnapshot();
  const children = consentedStudents(snapshot);
  const [studentId, setStudentId] = useState('');
  const selected = studentId || children[0]?.id || '';
  if (!selected) {
    return (
      <>
        <PageHeader eyebrow="รายงานของลูก · ดูอย่างเดียว" title="รายงานของลูก" />
        <Card>
          <EmptyState
            icon={<Icon name="children" size={28} />}
            title="ยังไม่มีนักเรียนที่เชื่อมไว้"
            description="เมื่อโรงเรียนเชื่อมบัญชีและบันทึกความยินยอมแล้ว รายงานของลูกจะแสดงที่นี่"
          />
        </Card>
      </>
    );
  }
  return <PersonalReports studentId={selected} students={children} onSelect={setStudentId} audience="parent" />;
}

function StaffReports() {
  const snapshot = useSchoolSnapshot();
  const classes = activeClasses(snapshot);
  const [reportId, setReportId] = useState<ReportId>('student');
  const [classId, setClassId] = useState('');
  const selectedClassId = classId || classes[0]?.id || '';
  const report: ReportTable = useMemo(
    () => buildReport(reportId, snapshot, selectedClassId),
    [reportId, snapshot, selectedClassId]
  );
  const chart = useMemo(() => reportChart(report), [report]);

  return (
    <>
      <PageHeader
        eyebrow="รายงาน"
        title={report.title}
        description="ข้อมูลคำนวณจากสิทธิ์ที่คุณเข้าถึงได้ · ส่งออก CSV ได้เฉพาะแถวที่กรองไว้"
      />
      <ReportView
        title={report.title}
        eyebrow={`${report.rows.length} แถว`}
        columns={report.columns}
        rows={report.rows}
        chart={chart}
        onExport={(rows) => download(`${report.id}-${selectedClassId || 'school'}.csv`, toCsv({ ...report, rows }))}
        controls={
          <Toolbar>
            <label>
              รายงาน
              <select value={reportId} onChange={(event) => setReportId(event.target.value as ReportId)}>
                {reportIds.map((id) => <option key={id} value={id}>{reportTitles[id]}</option>)}
              </select>
            </label>
            <label>
              ห้องเรียน
              <select value={selectedClassId} onChange={(event) => setClassId(event.target.value)}>
                {classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
          </Toolbar>
        }
      />
    </>
  );
}
