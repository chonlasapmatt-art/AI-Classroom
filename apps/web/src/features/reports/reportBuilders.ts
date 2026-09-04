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

/**
 * The reports a student and a guardian get.
 *
 * They are the same four questions the school-wide reports answer, asked about one person: was I
 * there, what was I given, what did I score, and what was I recognised for. They are built from the
 * snapshot the repository already scoped to the caller, so a student's own report cannot widen into
 * somebody else's row — the reader's data is all there is to read.
 */
export type PersonalReportId = 'attendance' | 'work' | 'scores' | 'awards';

export const personalReportTitles: Record<PersonalReportId, string> = {
  attendance: 'การเข้าเรียน',
  work: 'งานที่ได้รับมอบหมาย',
  scores: 'คะแนนที่ได้รับ',
  awards: 'เหรียญรางวัล'
};

const attendanceLabels: Record<string, string> = {
  present: 'มาเรียน', late: 'สาย', absent: 'ขาด', leave: 'ลา'
};

const submissionLabels: Record<string, string> = {
  pending: 'ยังไม่ส่ง', submitted: 'ส่งแล้ว', late: 'ส่งช้า', reviewed: 'ตรวจแล้ว',
  returned: 'ส่งคืนแล้ว', revision: 'ต้องแก้ไข', cancelled: 'ยกเลิก'
};

export function buildPersonalReport(
  id: PersonalReportId, snapshot: SchoolSnapshot, studentId: string, badgeLabel: (key: string) => string
): PersonalReportTable {
  const title = personalReportTitles[id];
  const subjectName = (subjectId: string | null | undefined) =>
    snapshot.subjects.find((item) => item.id === subjectId)?.name ?? '-';
  const className = (classId: string) => snapshot.classes.find((item) => item.id === classId)?.name ?? '-';

  switch (id) {
    case 'attendance': {
      const rows = snapshot.attendance
        .filter((item) => item.studentId === studentId && !item.deletedAt)
        .sort((left, right) => right.attendanceDate.localeCompare(left.attendanceDate))
        .map((item) => [
          item.attendanceDate,
          className(item.classId),
          item.sessionType === 'homeroom' ? 'โฮมรูม' : subjectName(item.subjectId),
          item.period ? `คาบ ${item.period}` : '-',
          attendanceLabels[item.status] ?? item.status
        ]);
      return { id, title, columns: ['วันที่', 'ห้องเรียน', 'วิชา', 'คาบ', 'สถานะ'], rows };
    }
    case 'work': {
      const mine = new Map(snapshot.submissions
        .filter((item) => item.studentId === studentId && !item.deletedAt)
        .map((item) => [item.assignmentId, item]));
      const rows = snapshot.assignments
        .filter((item) => !item.deletedAt && item.status !== 'draft' && mine.has(item.id))
        .sort((left, right) => (right.dueAt ?? '').localeCompare(left.dueAt ?? ''))
        .map((assignment) => {
          const submission = mine.get(assignment.id);
          return [
            assignment.title,
            subjectName(assignment.subjectId),
            assignment.dueAt ? assignment.dueAt.slice(0, 10) : 'ไม่มีกำหนดส่ง',
            submission ? submissionLabels[submission.status] ?? submission.status : 'ยังไม่ส่ง',
            submission?.isLate ? 'ส่งช้า' : '-',
            submission?.score ?? '-'
          ];
        });
      return { id, title, columns: ['งาน', 'วิชา', 'กำหนดส่ง', 'สถานะ', 'ความตรงเวลา', 'คะแนน'], rows };
    }
    case 'scores': {
      const rows = snapshot.scoreEvents
        .filter((item) => item.studentId === studentId && !item.deletedAt)
        .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
        .map((event) => [
          event.occurredAt.slice(0, 10),
          subjectName(event.subjectId),
          event.category,
          event.points,
          event.reason || '-'
        ]);
      return { id, title, columns: ['วันที่', 'วิชา', 'ประเภท', 'แต้ม', 'เหตุผล'], rows };
    }
    default: {
      const rows = snapshot.achievements
        .filter((item) => item.studentId === studentId && !item.deletedAt)
        .sort((left, right) => right.awardedAt.localeCompare(left.awardedAt))
        .map((item) => [item.awardedAt.slice(0, 10), badgeLabel(item.achievementKey), item.note || '-']);
      return { id, title, columns: ['วันที่', 'เหรียญ', 'บันทึกจากครู'], rows };
    }
  }
}

export interface PersonalReportTable { id: PersonalReportId; title: string; columns: string[]; rows: (string | number)[][] }

/** Both report shapes export the same way; the CSV does not care which one produced the rows. */
export function personalToCsv(report: PersonalReportTable): string {
  return toCsv({ id: 'student', title: report.title, columns: report.columns, rows: report.rows });
}

/**
 * The picture over the table, built from the table's own rows.
 *
 * Deriving it from the rendered rows rather than from the snapshot is the point: whatever the reader
 * has filtered the table down to is what the chart draws, so the two can never disagree about what
 * is on screen. It also means a report gains a chart by describing which of its columns carries the
 * magnitude, not by growing a second query.
 *
 * Every one of these is a single series, so every bar is the same hue. Colouring bars darker where
 * they are longer would spend the only free channel restating the length.
 */
export interface ReportChart { caption: string; unit: string; bars: Array<{ label: string; value: number }> }

const number = (cell: string | number): number => typeof cell === 'number' ? cell : Number(cell) || 0;
const text = (cell: string | number | undefined): string => String(cell ?? '-');

/** Counts how many rows share the value in one column, in first-seen order. */
function countBy(rows: (string | number)[][], index: number, split?: string): Array<{ label: string; value: number }> {
  const tally = new Map<string, number>();
  for (const row of rows) {
    const raw = text(row[index]);
    for (const label of (split ? raw.split(split) : [raw]).map((item) => item.trim()).filter(Boolean)) {
      tally.set(label, (tally.get(label) ?? 0) + 1);
    }
  }
  return [...tally].map(([label, value]) => ({ label, value }));
}

/**
 * Five bands, named by what they mean rather than by their edges alone.
 *
 * A bar per student is not a distribution — it is the table again, drawn wider. Bands answer the
 * question a distribution is for: how many are near the bottom.
 */
function bands(rows: (string | number)[][], index: number, unit: string): Array<{ label: string; value: number }> {
  const edges = [90, 80, 70, 60];
  const labels = [`90–100${unit}`, `80–89${unit}`, `70–79${unit}`, `60–69${unit}`, `ต่ำกว่า 60${unit}`];
  const counts = [0, 0, 0, 0, 0];
  for (const row of rows) {
    const value = number(row[index] ?? 0);
    const slot = edges.findIndex((edge) => value >= edge);
    counts[slot === -1 ? 4 : slot] = (counts[slot === -1 ? 4 : slot] ?? 0) + 1;
  }
  return labels.map((label, slot) => ({ label, value: counts[slot] ?? 0 }));
}

/** The longest bars only: a chart with forty rows is a table that has stopped being readable. */
function longest(bars: Array<{ label: string; value: number }>, keep = 8): Array<{ label: string; value: number }> {
  return [...bars].sort((left, right) => right.value - left.value).slice(0, keep);
}

export function reportChart(report: ReportTable): ReportChart | null {
  if (report.rows.length === 0) return null;
  switch (report.id) {
    case 'student':
      return { caption: 'นักเรียนแยกตามสถานะ', unit: 'คน', bars: countBy(report.rows, 3) };
    case 'class':
      return { caption: 'อัตราเข้าเรียนรายห้อง', unit: '%', bars: longest(report.rows.map((row) => ({ label: text(row[0]), value: number(row[3] ?? 0) }))) };
    case 'attendance':
      return { caption: 'การกระจายอัตราเข้าเรียน', unit: 'คน', bars: bands(report.rows, 6, '%') };
    case 'score':
      return { caption: 'การกระจายคะแนนรวม', unit: 'คน', bars: bands(report.rows, 3, ' คะแนน') };
    case 'grade':
      return { caption: 'จำนวนนักเรียนแต่ละเกรด', unit: 'คน', bars: report.rows.map((row) => ({ label: text(row[0]), value: number(row[1] ?? 0) })) };
    case 'missing':
      return { caption: 'นักเรียนที่มีงานค้างมากที่สุด', unit: 'ชิ้น', bars: longest(report.rows.map((row) => ({ label: text(row[1]), value: number(row[2] ?? 0) }))) };
    case 'at-risk':
    default:
      // One student can be at risk for more than one reason, so the bars total more than the rows
      // and the caption says which count this is.
      return { caption: 'จำนวนครั้งที่เข้าเกณฑ์เสี่ยง แยกตามเหตุผล', unit: 'ครั้ง', bars: countBy(report.rows, 5, '/') };
  }
}

export function personalReportChart(report: PersonalReportTable): ReportChart | null {
  if (report.rows.length === 0) return null;
  switch (report.id) {
    case 'attendance':
      return { caption: 'จำนวนคาบแยกตามสถานะ', unit: 'คาบ', bars: countBy(report.rows, 4) };
    case 'work':
      return { caption: 'งานแยกตามสถานะการส่ง', unit: 'ชิ้น', bars: countBy(report.rows, 3) };
    case 'scores': {
      const tally = new Map<string, number>();
      for (const row of report.rows) tally.set(text(row[2]), (tally.get(text(row[2])) ?? 0) + number(row[3] ?? 0));
      return { caption: 'แต้มรวมแยกตามประเภท', unit: 'แต้ม', bars: [...tally].map(([label, value]) => ({ label, value })) };
    }
    default:
      return { caption: 'เหรียญที่ได้รับ', unit: 'ครั้ง', bars: countBy(report.rows, 1) };
  }
}
