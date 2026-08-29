import { useMemo, useState } from 'react';
import { useSchoolSnapshot } from '../../data/RepositoryContext';
import { activeClasses } from '../../data/selectors';
import { buildReport, reportTitles, toCsv, type ReportId } from './reportBuilders';

const reportIds = Object.keys(reportTitles) as ReportId[];

export function ReportsPage() {
  const snapshot = useSchoolSnapshot();
  const classes = activeClasses(snapshot);
  const [reportId, setReportId] = useState<ReportId>('student');
  const [classId, setClassId] = useState('');
  const selectedClassId = classId || classes[0]?.id || '';
  const report = useMemo(() => buildReport(reportId, snapshot, selectedClassId), [reportId, snapshot, selectedClassId]);

  function exportCsv() {
    const blob = new Blob([toCsv(report)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${report.id}-${selectedClassId || 'school'}.csv`;
    link.click();
    URL.revokeObjectURL(url);
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

      <section className="panel data-panel">
        {report.rows.length === 0 ? (
          <div className="empty-state"><span>▥</span><h3>ไม่มีข้อมูลในรายงานนี้</h3><p>ลองเลือกห้องเรียนหรือรายงานอื่น</p></div>
        ) : (
          <div className="table-scroll">
            <table className="grid-table">
              <thead><tr>{report.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
              <tbody>
                {report.rows.map((row, rowIndex) => (
                  <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
