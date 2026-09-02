import { attendanceDailySummary, classIdOfStudent, rosterFor, scorePolicyFrom, standingsFor } from '../../data/selectors';
import type { SchoolSnapshot } from '../../data/schoolRepository';

export type ReportId = 'student' | 'class' | 'attendance' | 'score' | 'grade' | 'missing' | 'at-risk';

export interface ReportTable { id: ReportId; title: string; columns: string[]; rows: (string | number)[][] }

export const reportTitles: Record<ReportId, string> = {
  student: 'รายชื่อนักเรียน',
  class: 'สรุปรายห้องเรียน',
  attendance: 'สรุปการเข้าเรียน',
  score: 'คะแนนรายบุคคล',
  grade: 'การกระจายเกรด',
  missing: 'งานค้างส่ง',
  'at-risk': 'นักเรียนกลุ่มเสี่ยง'
};

/** Attendance below this rate, or this many missing pieces of work, flags a student as at risk. */
export const AT_RISK_PRESENT_RATE = 80;
export const AT_RISK_MISSING_WORK = 2;

export function buildReport(id: ReportId, snapshot: SchoolSnapshot, classId: string): ReportTable {
  const policy = scorePolicyFrom(snapshot.settings);
  const roster = rosterFor(snapshot, classId);
  const standings = standingsFor(snapshot, classId, policy);
  const classroom = snapshot.classes.find((item) => item.id === classId);
  const title = reportTitles[id];

  switch (id) {
    case 'student':
      return {
        id, title, columns: ['รหัสนักเรียน', 'ชื่อ-สกุล', 'ห้องเรียน', 'สถานะ'],
        rows: roster.map((student) => [
          student.studentCode, student.displayName,
          snapshot.classes.find((item) => item.id === classIdOfStudent(snapshot, student.id))?.name ?? '-',
          student.status === 'active' ? 'กำลังศึกษา' : 'พักการเรียน'
        ])
      };

    case 'class':
      return {
        id, title, columns: ['ห้องเรียน', 'ระดับชั้น', 'จำนวนนักเรียน', 'อัตราเข้าเรียน (%)', 'งานที่เผยแพร่'],
        rows: snapshot.classes.map((item) => [
          item.name, item.gradeLevel, rosterFor(snapshot, item.id).length,
          attendanceDailySummary(snapshot, { classId: item.id }).presentRate,
          snapshot.assignments.filter((assignment) => assignment.classId === item.id && assignment.status !== 'draft').length
        ])
      };

    case 'attendance':
      return {
        id, title, columns: ['รหัสนักเรียน', 'ชื่อ-สกุล', 'มา', 'สาย', 'ขาด', 'ลา', 'อัตราเข้าเรียน (%)'],
        rows: roster.map((student) => {
          const summary = attendanceDailySummary(snapshot, { studentId: student.id });
          return [student.studentCode, student.displayName, summary.present, summary.late, summary.absent, summary.leave, summary.presentRate];
        })
      };

    case 'score':
      return {
        id, title, columns: ['อันดับ', 'รหัสนักเรียน', 'ชื่อ-สกุล', 'คะแนนรวม', 'เกรด'],
        rows: standings.map((entry) => [entry.rank, entry.student.studentCode, entry.student.displayName, entry.total, entry.grade])
      };

    case 'grade': {
      const grades = ['A', 'B', 'C', 'D', 'F'];
      return {
        id, title, columns: ['เกรด', 'จำนวนนักเรียน', 'สัดส่วน (%)'],
        rows: grades.map((grade) => {
          const count = standings.filter((entry) => entry.grade === grade).length;
          const percent = standings.length === 0 ? 0 : Math.round((count / standings.length) * 1000) / 10;
          return [grade, count, percent];
        })
      };
    }

    case 'missing':
      return {
        id, title, columns: ['รหัสนักเรียน', 'ชื่อ-สกุล', 'งานค้างส่ง', 'ห้องเรียน'],
        rows: standings
          .filter((entry) => entry.missingWork > 0)
          .map((entry) => [entry.student.studentCode, entry.student.displayName, entry.missingWork, classroom?.name ?? '-'])
      };

    case 'at-risk':
    default:
      return {
        id, title: reportTitles['at-risk'],
        columns: ['รหัสนักเรียน', 'ชื่อ-สกุล', 'อัตราเข้าเรียน (%)', 'งานค้างส่ง', 'คะแนนรวม', 'เหตุผล'],
        rows: standings
          .filter((entry) => entry.presentRate < AT_RISK_PRESENT_RATE || entry.missingWork >= AT_RISK_MISSING_WORK || entry.grade === 'F')
          .map((entry) => {
            const reasons: string[] = [];
            if (entry.presentRate < AT_RISK_PRESENT_RATE) reasons.push('เข้าเรียนน้อย');
            if (entry.missingWork >= AT_RISK_MISSING_WORK) reasons.push('งานค้างส่ง');
            if (entry.grade === 'F') reasons.push('คะแนนต่ำกว่าเกณฑ์');
            return [entry.student.studentCode, entry.student.displayName, entry.presentRate, entry.missingWork, entry.total, reasons.join(' / ')];
          })
      };
  }
}

function escapeCsv(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** UTF-8 BOM keeps Thai readable when the file is opened in Excel. */
const BYTE_ORDER_MARK = String.fromCharCode(0xfeff);

export function toCsv(report: ReportTable): string {
  const lines = [report.columns.map(escapeCsv).join(','), ...report.rows.map((row) => row.map(escapeCsv).join(','))];
  return `${BYTE_ORDER_MARK}${lines.join('\r\n')}\r\n`;
}
