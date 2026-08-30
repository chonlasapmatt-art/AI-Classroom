import type {
  AcademicAuditEntry, AcademicTerm, AchievementKey, Activity, ActivityScore, Announcement, Assignment, Attendance,
  AttendanceStatus, ClassTeacher, Classroom, ClassroomNotification, DeadlineExtension, Enrollment, MembershipContext,
  NotificationPreference, ParentLink, Rubric, RubricScore, Setting, Student, StudentAchievement, Subject, Submission,
  SubmissionVersion, SyncRecord, Teacher, TestRecord, TestScore, TimetableEntry, ScoreEvent
} from '../../domain/types';
import { standardSubjects } from '../subjectCatalog';
import type { SchoolSnapshot } from '../schoolRepository';

/**
 * Development fixtures. These records only ever reach the fixture repository, never the production
 * seed, never Supabase, and never the sync queue. Everything is deterministic so the preview looks
 * identical on every machine and can be asserted in tests.
 */
export const FIXTURE_SCHOOL_ID = 'fixture-school';
export const FIXTURE_SCHOOL_NAME = 'โรงเรียนสาธิต Smart Classroom';
export const FIXTURE_ACADEMIC_YEAR = '2569';
export const FIXTURE_TERM = '1';
/**
 * Anchor for every relative fixture date. It follows the real calendar so a preview opened on any
 * day still shows work that is due soon rather than a term that ended months ago; everything else
 * in the fixture stays deterministic.
 */
export const FIXTURE_TODAY = new Date().toISOString().slice(0, 10);

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function isWeekend(isoDate: string): boolean {
  const day = new Date(`${isoDate}T00:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}

/** Last `count` school days up to and including the anchor date. */
export function recentSchoolDays(count: number, anchor = FIXTURE_TODAY): string[] {
  const days: string[] = [];
  let cursor = anchor;
  while (days.length < count) {
    if (!isWeekend(cursor)) days.unshift(cursor);
    cursor = addDays(cursor, -1);
  }
  return days;
}

function record(id: string, createdAt = `${FIXTURE_TODAY}T01:00:00.000Z`): SyncRecord {
  return { id, schoolId: FIXTURE_SCHOOL_ID, version: 1, createdAt, updatedAt: createdAt, deletedAt: null };
}

const givenNames = [
  'ธนกร', 'ปุณยวีร์', 'ณัฐวิภา', 'กันตพัฒน์', 'พิมพ์ลภัส', 'ศุภกร', 'ชญานิศ', 'ภูริณัฐ', 'อริสรา', 'ธีรภัทร',
  'ปัณณธร', 'นภัสสร', 'กฤตเมธ', 'วรินทร', 'ธัญชนก', 'สิรวิชญ์', 'พีรดา', 'จิรัฏฐ์', 'ณิชาภัทร', 'กิตติภพ',
  'อาทิตยา', 'พงศกร', 'ปรียาภรณ์', 'เมธาสิทธิ์', 'ชนัญชิดา', 'ธนดล', 'ภัทรวดี', 'ณภัทร', 'สุพิชญา', 'รวิภาส'
];

const familyNames = [
  'ศรีสุวรรณ', 'อินทรวิเชียร', 'บุญมาก', 'พงษ์ไพบูลย์', 'วัฒนากูล', 'จันทร์เพ็ญ', 'ทองแท้', 'เกษมสุข',
  'ประเสริฐศรี', 'ธนวัฒน์', 'ใจดี', 'รุ่งเรือง', 'พิทักษ์ชน', 'สายทอง', 'ก้องเกียรติ'
];

function studentName(index: number): string {
  const given = givenNames[index % givenNames.length]!;
  const family = familyNames[(index * 7) % familyNames.length]!;
  return `${given} ${family}`;
}

export interface FixtureData extends SchoolSnapshot {
  memberships: MembershipContext[];
  /** Class shown by default in preview (the one with a full roster). */
  primaryClassId: string;
}

export function buildFixtureData(): FixtureData {
  const random = seededRandom(20690824);
  const termId = 'fixture-term-1';
  const terms: AcademicTerm[] = [{
    ...record(termId), academicYear: FIXTURE_ACADEMIC_YEAR, term: FIXTURE_TERM,
    startsOn: '2026-05-16', endsOn: '2026-10-10', status: 'active'
  }];

  const subjects: Subject[] = standardSubjects.map((seed, index) => ({
    ...record(`fixture-subject-${seed.code}`),
    code: seed.code, name: seed.name, nameEn: seed.nameEn,
    colorIndex: seed.colorIndex, iconKey: seed.iconKey, sortOrder: index, status: 'active'
  }));
  const subjectId = (code: string) => `fixture-subject-${code}`;

  const classes: Classroom[] = [
    { ...record('fixture-class-1'), academicTermId: termId, name: 'ป.5/1', gradeLevel: 'ประถมศึกษาปีที่ 5', capacity: 30, status: 'active' },
    { ...record('fixture-class-2'), academicTermId: termId, name: 'ป.5/2', gradeLevel: 'ประถมศึกษาปีที่ 5', capacity: 40, status: 'active' },
    { ...record('fixture-class-3'), academicTermId: termId, name: 'ป.6/1', gradeLevel: 'ประถมศึกษาปีที่ 6', capacity: 40, status: 'active' }
  ];
  const primaryClassId = 'fixture-class-1';

  const teachers: Teacher[] = [
    { ...record('fixture-teacher-1'), profileId: 'preview-teacher', avatarId: 'avatar_010', avatarPhotoId: null, teacherCode: 'T-001', displayName: 'ครูสมฤทัย ปัญญาดี', email: 'somruethai@example.ac.th', subject: 'วิทยาศาสตร์', verificationStatus: 'verified_teacher', status: 'active' },
    { ...record('fixture-teacher-2'), profileId: null, avatarId: 'avatar_020', avatarPhotoId: null, teacherCode: 'T-002', displayName: 'ครูอนุชา ตั้งใจสอน', email: 'anucha@example.ac.th', subject: 'คณิตศาสตร์', verificationStatus: 'verified_teacher', status: 'active' },
    { ...record('fixture-teacher-3'), profileId: null, avatarId: 'avatar_030', avatarPhotoId: null, teacherCode: 'T-003', displayName: 'ครูพิมพ์ชนก ใจงาม', email: 'pimchanok@example.ac.th', subject: 'ภาษาไทย', verificationStatus: 'verification_pending', status: 'active' }
  ];

  const classTeachers: ClassTeacher[] = [
    { ...record('fixture-ct-1'), classId: 'fixture-class-1', teacherId: 'fixture-teacher-1', role: 'primary' },
    { ...record('fixture-ct-2'), classId: 'fixture-class-1', teacherId: 'fixture-teacher-2', role: 'assistant' },
    { ...record('fixture-ct-3'), classId: 'fixture-class-2', teacherId: 'fixture-teacher-2', role: 'primary' },
    { ...record('fixture-ct-4'), classId: 'fixture-class-3', teacherId: 'fixture-teacher-3', role: 'primary' }
  ];

  const students: Student[] = [];
  const enrollments: Enrollment[] = [];
  const rosterSizes: Record<string, number> = { 'fixture-class-1': 24, 'fixture-class-2': 8, 'fixture-class-3': 8 };
  let studentCounter = 0;
  for (const classroom of classes) {
    const size = rosterSizes[classroom.id] ?? 8;
    for (let seat = 0; seat < size; seat += 1) {
      const index = studentCounter;
      studentCounter += 1;
      const id = `fixture-student-${index + 1}`;
      students.push({
        ...record(id),
        profileId: index === 0 ? 'preview-student' : null,
        studentCode: `${FIXTURE_ACADEMIC_YEAR}${String(index + 1).padStart(4, '0')}`,
        displayName: studentName(index),
        avatarIndex: index * 7,
        avatarId: index < 12 ? `avatar_${String(index + 1).padStart(3, '0')}` : null,
        avatarPhotoId: null,
        avatarConfig: index < 4
          ? { archetype: index % 8, palette: (index * 3) % 8, skinTone: index % 6, hair: (index * 2) % 6, accessory: (index + 1) % 8, badge: (index + 1) % 6 }
          : null,
        status: 'active'
      });
      enrollments.push({
        ...record(`fixture-enrollment-${index + 1}`),
        studentId: id, classId: classroom.id, academicTermId: termId, status: 'active',
        enrolledAt: '2026-05-16T01:00:00.000Z', leftAt: null
      });
    }
  }

  const primaryRoster = enrollments.filter((item) => item.classId === primaryClassId).map((item) => item.studentId);

  const attendance: Attendance[] = [];
  const days = recentSchoolDays(10);
  const statuses: AttendanceStatus[] = ['present', 'present', 'present', 'present', 'present', 'late', 'absent', 'leave'];
  for (const day of days) {
    for (const studentId of primaryRoster) {
      const status = statuses[Math.floor(random() * statuses.length)] ?? 'present';
      attendance.push({
        ...record(`fixture-attendance-${day}-${studentId}`, `${day}T02:00:00.000Z`),
        classId: primaryClassId, studentId, attendanceDate: day, status,
        note: status === 'leave' ? 'ลากิจ (ผู้ปกครองแจ้ง)' : ''
      });
    }
  }

  const assignments: Assignment[] = [
    {
      ...record('fixture-assignment-1'), classId: primaryClassId, subjectId: subjectId('SC'),
      workType: 'homework', rubricId: null, reminderOffsets: [0, 1440, 180], startAt: null,
      publishedAt: `${addDays(FIXTURE_TODAY, -9)}T02:00:00.000Z`, cancelledAt: null,
      title: 'ใบงานระบบสุริยะ',
      instructions: 'ทำลงในสมุด ถ่ายรูปส่งในระบบ',
      description: 'สรุปลักษณะดาวเคราะห์ 8 ดวง พร้อมวาดแผนภาพ', assignedAt: `${addDays(FIXTURE_TODAY, -9)}T02:00:00.000Z`,
      dueAt: `${addDays(FIXTURE_TODAY, -4)}T09:00:00.000Z`, maxScore: 20, status: 'closed'
    },
    {
      ...record('fixture-assignment-2'), classId: primaryClassId, subjectId: subjectId('SC'),
      workType: 'assignment', rubricId: null, reminderOffsets: [0, 1440, 180], startAt: null,
      publishedAt: `${addDays(FIXTURE_TODAY, -5)}T02:00:00.000Z`, cancelledAt: null,
      title: 'รายงานการทดลองแรงเสียดทาน',
      instructions: 'ใช้แบบฟอร์มรายงานการทดลองที่ครูแจก',
      description: 'บันทึกผลการทดลองและสรุปตัวแปรที่เกี่ยวข้อง', assignedAt: `${addDays(FIXTURE_TODAY, -5)}T02:00:00.000Z`,
      dueAt: `${addDays(FIXTURE_TODAY, 1)}T09:00:00.000Z`, maxScore: 30, status: 'published'
    },
    {
      ...record('fixture-assignment-3'), classId: primaryClassId, subjectId: subjectId('OC'),
      workType: 'project', rubricId: 'fixture-rubric-1', reminderOffsets: [0, 4320, 1440, 180], startAt: null,
      publishedAt: `${addDays(FIXTURE_TODAY, -2)}T02:00:00.000Z`, cancelledAt: null,
      title: 'โครงงานพลังงานทดแทนกลุ่ม',
      instructions: 'ส่งไฟล์นำเสนอ 1 ไฟล์ต่อกลุ่ม',
      description: 'ทำงานกลุ่มละ 4 คน นำเสนอสัปดาห์หน้า', assignedAt: `${addDays(FIXTURE_TODAY, -2)}T02:00:00.000Z`,
      dueAt: `${addDays(FIXTURE_TODAY, 7)}T09:00:00.000Z`, maxScore: 50, status: 'published'
    },
    {
      ...record('fixture-assignment-4'), classId: primaryClassId, subjectId: subjectId('MA'),
      workType: 'homework', rubricId: null, reminderOffsets: [0, 1440, 180], startAt: null,
      publishedAt: null, cancelledAt: null,
      title: 'แบบฝึกหัดทบทวนปลายภาค',
      instructions: '',
      description: 'ยังไม่เผยแพร่ รอตรวจทานข้อสอบ', assignedAt: `${FIXTURE_TODAY}T02:00:00.000Z`,
      dueAt: null, maxScore: 40, status: 'draft'
    }
  ];

  const submissions: Submission[] = [];
  for (const assignment of assignments.filter((item) => item.status !== 'draft')) {
    primaryRoster.forEach((studentId, seat) => {
      const roll = random();
      const missing = roll > 0.86;
      const late = !missing && roll > 0.74;
      const graded = assignment.status === 'closed';
      if (missing && assignment.status !== 'closed') return;
      submissions.push({
        ...record(`fixture-submission-${assignment.id}-${seat}`),
        assignmentId: assignment.id, studentId,
        submittedAt: missing ? null : `${addDays(FIXTURE_TODAY, -3)}T08:30:00.000Z`,
        status: missing ? 'not_started' : graded ? 'graded' : 'submitted',
        score: graded && !missing ? Math.round(assignment.maxScore * (0.62 + random() * 0.38)) : null,
        isLate: late,
        teacherNote: missing ? 'ยังไม่ส่งงาน' : graded ? 'ตรวจแล้ว ทำได้ดีมาก' : '',
        studentNote: missing ? '' : 'ส่งงานผ่านระบบ',
        version: missing ? 0 : 1,
        openedAt: missing ? null : `${addDays(FIXTURE_TODAY, -4)}T02:00:00.000Z`,
        acknowledgedAt: missing || seat % 5 === 0 ? null : `${addDays(FIXTURE_TODAY, -4)}T02:30:00.000Z`,
        revisionNote: '',
        percentage: null,
        calculatedGrade: null,
        finalGrade: null,
        gradeOverrideReason: '',
        gradedBy: graded ? 'preview-teacher' : null,
        gradedAt: graded ? `${addDays(FIXTURE_TODAY, -3)}T09:00:00.000Z` : null
      });
    });
  }

  const activities: Activity[] = [
    { ...record('fixture-activity-1'), classId: primaryClassId, subjectId: subjectId('SC'), title: 'กิจกรรมทดลองวิทยาศาสตร์หน้าชั้น', activityDate: addDays(FIXTURE_TODAY, -8), maxScore: 10, status: 'published' },
    { ...record('fixture-activity-2'), classId: primaryClassId, subjectId: subjectId('SC'), title: 'กิจกรรมตอบคำถามบนกระดานอัจฉริยะ', activityDate: addDays(FIXTURE_TODAY, -3), maxScore: 10, status: 'published' },
    { ...record('fixture-activity-3'), classId: primaryClassId, subjectId: subjectId('PE'), title: 'กิจกรรมจิตอาสาประจำสัปดาห์', activityDate: FIXTURE_TODAY, maxScore: 10, status: 'draft' }
  ];

  const activityScores: ActivityScore[] = [];
  for (const activity of activities.filter((item) => item.status === 'published')) {
    primaryRoster.forEach((studentId, seat) => {
      activityScores.push({
        ...record(`fixture-activity-score-${activity.id}-${seat}`),
        activityId: activity.id, studentId,
        score: Math.round(activity.maxScore * (0.55 + random() * 0.45)), note: ''
      });
    });
  }

  const tests: TestRecord[] = [
    { ...record('fixture-test-1'), classId: primaryClassId, subjectId: subjectId('SC'), title: 'สอบกลางภาค วิทยาศาสตร์', testDate: addDays(FIXTURE_TODAY, -12), maxScore: 100, status: 'published' },
    { ...record('fixture-test-2'), classId: primaryClassId, subjectId: subjectId('MA'), title: 'สอบย่อยหน่วยที่ 3', testDate: addDays(FIXTURE_TODAY, -1), maxScore: 20, status: 'draft' }
  ];

  const testScores: TestScore[] = [];
  for (const test of tests) {
    primaryRoster.forEach((studentId, seat) => {
      testScores.push({
        ...record(`fixture-test-score-${test.id}-${seat}`),
        testId: test.id, studentId,
        score: Math.round(test.maxScore * (0.5 + random() * 0.5)),
        publishedAt: test.status === 'published' ? `${addDays(FIXTURE_TODAY, -10)}T04:00:00.000Z` : null
      });
    });
  }

  const parentLinks: ParentLink[] = primaryRoster.slice(0, 4).map((studentId, index) => ({
    ...record(`fixture-parent-link-${index + 1}`),
    studentId,
    avatarId: index === 0 ? 'avatar_055' : null,
    avatarPhotoId: null,
    parentName: `ผู้ปกครองของ ${students.find((item) => item.id === studentId)?.displayName ?? ''}`.trim(),
    relationship: index % 2 === 0 ? 'มารดา' : 'บิดา',
    contact: `08${index}-000-11${index}${index}`,
    lineUserId: index < 2 ? `Ufixture${index}` : null,
    status: index < 2 ? 'linked' : index === 2 ? 'invited' : 'revoked',
    invitationCode: index === 2 ? 'PV-482913' : null,
    consentVersion: index < 2 ? '2026-05-01' : null,
    consentGrantedAt: index < 2 ? '2026-05-20T03:00:00.000Z' : null
  }));

  const publishedAssignments = assignments.filter((item) => item.status === 'published');
  const notifications: ClassroomNotification[] = publishedAssignments.flatMap((assignment, order) =>
    primaryRoster.slice(0, 6).map((studentId, seat) => ({
      ...record(`fixture-notification-${assignment.id}-${seat}`, `${addDays(FIXTURE_TODAY, -1)}T03:00:00.000Z`),
      studentId, classId: primaryClassId, assignmentId: assignment.id,
      kind: order === 0 ? ('submission_reminder' as const) : ('assignment_published' as const),
      title: order === 0 ? `เตือนส่งงาน: ${assignment.title}` : `งานใหม่: ${assignment.title}`,
      body: assignment.dueAt ? `กำหนดส่ง ${new Date(assignment.dueAt).toLocaleString('th-TH')}` : 'ไม่กำหนดวันส่ง',
      dedupeKey: `published:${assignment.id}:${studentId}`,
      state: seat % 3 === 0 ? ('read' as const) : ('delivered' as const),
      scheduledAt: `${addDays(FIXTURE_TODAY, -1)}T03:00:00.000Z`,
      sentAt: `${addDays(FIXTURE_TODAY, -1)}T03:00:00.000Z`,
      readAt: seat % 3 === 0 ? `${FIXTURE_TODAY}T04:00:00.000Z` : null
    })));

  const rubrics: Rubric[] = [{
    ...record('fixture-rubric-1'),
    title: 'เกณฑ์ให้คะแนนโครงงาน',
    subjectId: subjectId('OC'),
    criteria: [
      { id: 'content', label: 'เนื้อหา', maxScore: 25, description: 'ครบถ้วน ถูกต้อง อ้างอิงได้' },
      { id: 'accuracy', label: 'ความถูกต้อง', maxScore: 15, description: 'ข้อมูลและการคำนวณถูกต้อง' },
      { id: 'presentation', label: 'การนำเสนอ', maxScore: 10, description: 'ชัดเจน เข้าใจง่าย' }
    ],
    status: 'active'
  }];

  const rubricScores: RubricScore[] = [];
  const submissionVersions: SubmissionVersion[] = submissions
    .filter((item) => item.submittedAt)
    .map((item, index) => ({
      ...record(`fixture-submission-version-${index + 1}`),
      assignmentId: item.assignmentId,
      studentId: item.studentId,
      versionNumber: 1,
      submittedAt: item.submittedAt!,
      isLate: item.isLate,
      studentNote: item.studentNote,
      attachmentOwnerId: `${item.assignmentId}:${item.studentId}`
    }));

  const deadlineExtensions: DeadlineExtension[] = [{
    ...record('fixture-extension-1'),
    assignmentId: 'fixture-assignment-3',
    studentId: primaryRoster[2] ?? 'fixture-student-3',
    dueAt: `${addDays(FIXTURE_TODAY, 10)}T09:00:00.000Z`,
    reason: 'ลาป่วย',
    grantedBy: 'preview-teacher'
  }];

  const announcements: Announcement[] = [{
    ...record('fixture-announcement-1'),
    classId: primaryClassId,
    subjectId: subjectId('AR'),
    title: 'เตรียมอุปกรณ์วาดรูป',
    body: 'พรุ่งนี้ให้นักเรียนนำอุปกรณ์วาดรูปมาด้วย',
    studentIds: [],
    createdBy: 'preview-teacher'
  }];

  const notificationPreferences: NotificationPreference[] = [{
    ...record('fixture-notification-preference-1'),
    profileId: 'preview-student',
    assignmentReminder: true,
    projectReminder: true,
    gradeNotification: true,
    quietHoursStart: '21:00',
    quietHoursEnd: '06:00'
  }];

  const academicAudit: AcademicAuditEntry[] = [{
    ...record('fixture-audit-1'),
    action: 'ASSIGNMENT_PUBLISHED',
    actorProfileId: 'preview-teacher',
    assignmentId: 'fixture-assignment-2',
    studentId: null,
    oldValue: '',
    newValue: 'รายงานการทดลองแรงเสียดทาน',
    reason: '',
    occurredAt: `${addDays(FIXTURE_TODAY, -5)}T02:00:00.000Z`
  }];

  const settings: Setting[] = [
    {
      ...record('fixture-setting-score-policy'), scopeType: 'school', scopeId: null, key: 'score_policy',
      valueJson: { weights: { assignment: 60, activity: 30, test: 10 }, latePenaltyPercent: 10, missingItem: 'zero', decimals: 2 }
    },
    {
      ...record('fixture-setting-privacy'), scopeType: 'school', scopeId: null, key: 'privacy_policy',
      valueJson: { policyVersion: '2026-05-01', showLeaderboardToStudents: true, shareScoresWithParents: true }
    }
  ];

  settings.push({
    ...record('fixture-setting-grade-scheme'), scopeType: 'school', scopeId: null, key: 'grade_scheme',
    valueJson: {
      bands: [
        { grade: 'A+', minPercentage: 95, label: 'ดีเยี่ยม' },
        { grade: 'A', minPercentage: 90, label: 'ดีมาก' },
        { grade: 'B', minPercentage: 80, label: 'ดี' },
        { grade: 'C', minPercentage: 70, label: 'พอใช้' }
      ],
      belowGrade: 'ต่ำกว่าเกณฑ์'
    }
  }, {
    ...record('fixture-setting-gradebook-weights'), scopeType: 'school', scopeId: null, key: 'gradebook_weights',
    valueJson: { homework: 20, assignment: 20, activity: 10, project: 20, test: 30 }
  });

  // A readable week: three classes, five teaching days, four periods each, so every timetable view
  // has something to show without the preview pretending to be a real school schedule.
  const periodClock = [
    { startTime: '08:30', endTime: '09:20' }, { startTime: '09:30', endTime: '10:20' },
    { startTime: '10:30', endTime: '11:20' }, { startTime: '13:00', endTime: '13:50' }
  ];
  const weekSubjects = ['TH', 'MA', 'SC', 'EN', 'SO', 'AR', 'PE', 'OC'];
  const timetable: TimetableEntry[] = [];
  classes.forEach((classroom, classIndex) => {
    for (let day = 1; day <= 5; day += 1) {
      periodClock.forEach((clock, periodIndex) => {
        const slot = (classIndex * 3 + day + periodIndex) % weekSubjects.length;
        timetable.push({
          ...record(`fixture-timetable-${classroom.id}-${day}-${periodIndex + 1}`),
          classId: classroom.id, subjectId: subjectId(weekSubjects[slot] ?? 'TH'),
          teacherId: teachers[(classIndex + periodIndex) % teachers.length]?.id ?? null,
          academicTermId: termId, dayOfWeek: day, period: periodIndex + 1,
          startTime: clock.startTime, endTime: clock.endTime,
          room: `อาคาร ${classIndex + 1} ห้อง ${classIndex + 1}0${periodIndex + 1}`, status: 'active'
        });
      });
    }
  });

  const achievementSeeds: { studentIndex: number; key: AchievementKey; note: string }[] = [
    { studentIndex: 0, key: 'on_time_submitter', note: 'ส่งงานตรงเวลาต่อเนื่อง 5 ชิ้น' },
    { studentIndex: 0, key: 'reader', note: 'อ่านหนังสือนอกเวลาครบตามเป้า' },
    { studentIndex: 1, key: 'steady_attendance', note: 'มาเรียนครบทุกวันในเดือนนี้' },
    { studentIndex: 2, key: 'score_improver', note: 'คะแนนดีขึ้นจากการสอบครั้งก่อน' },
    { studentIndex: 3, key: 'helper', note: 'ช่วยเพื่อนทบทวนบทเรียน' },
    { studentIndex: 4, key: 'experimenter', note: 'ออกแบบการทดลองด้วยตนเอง' }
  ];
  const achievements: StudentAchievement[] = achievementSeeds.flatMap((seed, index) => {
    const student = students[seed.studentIndex];
    if (!student) return [];
    return [{
      ...record(`fixture-achievement-${index + 1}`),
      studentId: student.id, achievementKey: seed.key, dedupeKey: `${student.id}:${seed.key}`,
      note: seed.note, awardedBy: 'preview-teacher',
      awardedAt: `${addDays(FIXTURE_TODAY, -(index + 1))}T03:00:00.000Z`
    }];
  });

  const scoreEvents: ScoreEvent[] = students.slice(0, 6).map((student, index) => ({
    ...record(`fixture-score-event-${index + 1}`),
    studentId: student.id, classId: primaryClassId, subjectId: null,
    category: (index % 2 === 0 ? 'bonus' : 'participation') as ScoreEvent['category'],
    points: index % 2 === 0 ? 5 : 1,
    reason: index % 2 === 0 ? 'ช่วยงานห้องเรียน' : 'ตอบคำถามในชั้นเรียน',
    sourceType: 'board' as const, sourceId: null, awardedBy: 'preview-teacher',
    occurredAt: new Date(Date.now() - index * 3_600_000).toISOString()
  }));

  const memberships: MembershipContext[] = [
    { membershipId: 'preview-admin', schoolId: FIXTURE_SCHOOL_ID, schoolName: FIXTURE_SCHOOL_NAME, profileId: 'preview-admin', displayName: 'ผู้ดูแลระบบ (Preview)', role: 'admin', status: 'active' },
    { membershipId: 'preview-teacher', schoolId: FIXTURE_SCHOOL_ID, schoolName: FIXTURE_SCHOOL_NAME, profileId: 'preview-teacher', displayName: teachers[0]!.displayName, role: 'teacher', status: 'active' },
    { membershipId: 'preview-student', schoolId: FIXTURE_SCHOOL_ID, schoolName: FIXTURE_SCHOOL_NAME, profileId: 'preview-student', displayName: students[0]!.displayName, role: 'student', status: 'active' },
    { membershipId: 'preview-parent', schoolId: FIXTURE_SCHOOL_ID, schoolName: FIXTURE_SCHOOL_NAME, profileId: 'preview-parent', displayName: parentLinks[0]!.parentName, role: 'parent', status: 'active' }
  ];

  return {
    ready: true, terms, classes, subjects, teachers, classTeachers, students, enrollments, assignments, submissions,
    activities, activityScores, tests, testScores, attendance, parentLinks, attachments: [], notifications,
    rubrics, rubricScores, submissionVersions, deadlineExtensions, announcements, notificationPreferences,
    academicAudit, timetable, achievements, scoreEvents, settings,
    pendingSync: 0, blockedSync: 0, memberships, primaryClassId
  };
}
