import { useMemo, useState } from 'react';
import { useSession } from '../../app/SessionContext';
import { useSchoolSnapshot } from '../../data/RepositoryContext';
import { activeClasses, consentedStudents } from '../../data/selectors';
import { achievementFor } from '../achievements/achievementCatalog';
import type { AchievementKey } from '../../domain/types';
import {
  buildPersonalReport, buildReport, personalReportTitles, personalToCsv, reportTitles, toCsv,
  type PersonalReportId, type ReportId
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

function ReportTableView({ columns, rows }: { columns: string[]; rows: (string | number)[][] }) {
  if (rows.length === 0) {
    return (
      <section className="panel data-panel">
        <div className="empty-state"><span>▥</span><h3>ไม่มีข้อมูลในรายงานนี้</h3><p>ลองเลือกรายงานอื่นหรือช่วงเวลาอื่น</p></div>
      </section>
    );
  }
  return (
    <section className="panel data-panel">
      <div className="table-scroll">
        <table className="grid-table">
          <thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
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
  const report = useMemo(
    () => buildPersonalReport(reportId, snapshot, studentId, badgeLabel),
    [reportId, snapshot, studentId]
  );
  const owner = students.find((item) => item.id === studentId);

  return (
    <>
      <section className="page-heading">
        <div>
          <span className="eyebrow">{audience === 'parent' ? 'รายงานของลูก · ดูอย่างเดียว' : 'รายงานของฉัน'}</span>
          <h1>{report.title}</h1>
          <p>{owner ? `${owner.displayName} · ` : ''}{report.rows.length} รายการ</p>
        </div>
        <button className="primary-button" disabled={report.rows.length === 0}
          onClick={() => download(`${report.id}-${studentId}.csv`, personalToCsv(report))}>ส่งออก CSV</button>
      </section>

      <div className="toolbar">
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
      </div>

      <ReportTableView columns={report.columns} rows={report.rows} />
    </>
  );
}

function StudentReports() {
  const { membership } = useSession();
  const snapshot = useSchoolSnapshot();
  const me = snapshot.students.find((item) => item.profileId === membership.profileId);
  if (!me) {
    return (
      <section className="panel">
        <div className="empty-state"><span>▥</span><h3>ยังไม่มีข้อมูลของคุณ</h3>
          <p>เมื่อครูบันทึกการเข้าเรียนหรือคะแนนแล้ว รายงานของคุณจะแสดงที่นี่</p></div>
      </section>
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
      <section className="panel">
        <div className="empty-state"><span>▥</span><h3>ยังไม่มีนักเรียนที่เชื่อมไว้</h3>
          <p>เมื่อโรงเรียนเชื่อมบัญชีและบันทึกความยินยอมแล้ว รายงานของลูกจะแสดงที่นี่</p></div>
      </section>
    );
  }
  return <PersonalReports studentId={selected} students={children} onSelect={setStudentId} audience="parent" />;
}

export function ReportsPage() {
  const { membership } = useSession();
  if (membership.role === 'student') return <StudentReports />;
  if (membership.role === 'parent') return <ParentReports />;
  return <StaffReports />;
}

function StaffReports() {
  const snapshot = useSchoolSnapshot();
  const classes = activeClasses(snapshot);
  const [reportId, setReportId] = useState<ReportId>('student');
  const [classId, setClassId] = useState('');
  const selectedClassId = classId || classes[0]?.id || '';
  const report = useMemo(() => buildReport(reportId, snapshot, selectedClassId), [reportId, snapshot, selectedClassId]);

  function exportCsv() {
    download(`${report.id}-${selectedClassId || 'school'}.csv`, toCsv(report));
  }

  return (
    <>
      <section className="page-heading">
        <div>
          <span className="eyebrow">รายงาน</span>
          <h1>{report.title}</h1>
          <p>{report.rows.length} แถว · ข้อมูลคำนวณจากสิทธิ์ที่คุณเข้าถึงได้</p>
        </div>
        <button className="primary-button" onClick={exportCsv} disabled={report.rows.length === 0}>ส่งออก CSV</button>
      </section>

      <div className="toolbar">
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
      </div>

      <ReportTableView columns={report.columns} rows={report.rows} />
    </>
  );
}
