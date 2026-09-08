import type { IconName } from '../ui/Icon';
import type { Role } from '../domain/types';
export interface NavItem { to: string; label: string; icon: IconName }
export interface NavGroup { key: string; label: string; items: NavItem[] }

/**
 * Every destination in the product, named once.
 *
 * A route appears here with the words a person would use for it, and the role menus below decide
 * who sees it. Naming a screen twice is how one menu ends up calling it "คะแนน" and another
 * "คะแนนและเกรด", which reads to a teacher as two different places.
 */
export const destination = (to: string, label: string, icon: IconName): NavItem => ({ to, label, icon });

/**
 * The menu, written per role rather than filtered per role.
 *
 * Each role gets at most seven top-level sections, named for what that person came to do: a teacher
 * opens "เช็กชื่อ", not "การเรียนการสอน", and a guardian opens "ลูกของฉัน", not "ผลลัพธ์และระบบ".
 * One shared list filtered four ways produced section names that were true for the admin and vague
 * for everybody else, which is the shape a menu takes when it is written from the database outwards
 * instead of from the person inwards.
 *
 * Nothing became unreachable in the regrouping: every route a role could open before is still in
 * that role's menu, under a heading that says why they would want it.
 */
/*
 * "ประกาศรวม" is the school's own noticeboard and belongs to the administrator alone.
 *
 * It was on every role's menu, which put the whole school's announcements — every class, every
 * audience — in front of a teacher, a student and a guardian. What each of them should see is the
 * news for their own rooms, which reaches them where it is meant to: the dashboard, the
 * notification centre and the class screens. The menu is what grants a route, so taking the entry
 * away also refuses the address to everybody but an administrator.
 */
export const navigationByRole: Record<Role, NavGroup[]> = {
  admin: [
    { key: 'overview', label: 'ภาพรวม', items: [
      destination('/', 'ภาพรวม', 'dashboard'),
      destination('/announcements', 'ประกาศรวม', 'announcements'),
      destination('/calendar', 'ปฏิทิน', 'calendar'),
      destination('/timetable', 'ตารางสอน', 'timetable')
    ] },
    { key: 'people', label: 'นักเรียนและบุคลากร', items: [
      destination('/students', 'นักเรียน', 'students'),
      destination('/teachers', 'ครู', 'teachers'),
      destination('/parents', 'ผู้ปกครอง', 'parents'),
      destination('/import', 'นำเข้ารายชื่อ', 'import'),
      destination('/promotion', 'ปีการศึกษา', 'promotion')
    ] },
    { key: 'structure', label: 'ห้องเรียนและรายวิชา', items: [
      destination('/classes', 'ห้องเรียน', 'classes'),
      destination('/subjects', 'รายวิชา', 'subjects'),
      destination('/question-bank', 'คลังข้อสอบ', 'question-bank'),
      destination('/exams', 'ข้อสอบ', 'exams')
    ] },
    { key: 'classroom', label: 'งาน คะแนน และการเข้าเรียน', items: [
      destination('/attendance', 'เช็กชื่อ / การเข้าเรียน', 'attendance'),
      destination('/classroom', 'กิจกรรมหน้าชั้น', 'star'),
      destination('/quiz', 'Quiz Challenge', 'quiz'),
      destination('/assignments', 'งานและกิจกรรม', 'assignments'),
      destination('/scores', 'คะแนนและเกรด', 'scores'),
      destination('/gradebook', 'สมุดเกรด', 'gradebook'),
      destination('/grade-editor', 'แก้ไขคะแนน', 'grade-edit')
    ] },
    { key: 'reports', label: 'รายงาน', items: [
      destination('/reports', 'รายงาน', 'reports'),
      destination('/leaderboard', 'Leaderboard', 'leaderboard'),
      destination('/achievements', 'เหรียญรางวัล', 'achievements')
    ] },
    { key: 'operations', label: 'Sync และ Backup', items: [
      destination('/operations', 'Sync & Backup', 'operations')
    ] },
    { key: 'account', label: 'ตั้งค่า', items: [
      destination('/settings', 'ตั้งค่า', 'settings'),
      destination('/profile', 'โปรไฟล์ของฉัน', 'profile')
    ] }
  ],
  teacher: [
    { key: 'today', label: 'วันนี้', items: [
      destination('/', 'ภาพรวม', 'dashboard'),
      destination('/calendar', 'ปฏิทิน', 'calendar'),
      destination('/timetable', 'ตารางสอน', 'timetable')
    ] },
    { key: 'attendance', label: 'เช็กชื่อ', items: [
      destination('/attendance', 'เช็กชื่อ / การเข้าเรียน', 'attendance')
    ] },
    { key: 'activities', label: 'กิจกรรม', items: [
      destination('/classroom', 'กิจกรรมหน้าชั้น', 'star'),
      destination('/quiz', 'Quiz Challenge', 'quiz'),
      destination('/question-bank', 'คลังข้อสอบ', 'question-bank'),
      destination('/exams', 'ข้อสอบ', 'exams')
    ] },
    /*
     * "คะแนนและเกรด" and "สมุดเกรด" were one screen split in two, and a teacher had to know which
     * of them held the number they were after. They are now one entry over both views.
     *
     * "นำเข้ารายชื่อ" is gone from a teacher's menu on purpose: adding children to a room now
     * happens on the student screen, where a teacher already is, and the bulk import of a whole
     * school's roster stays an administrator's tool.
     */
    { key: 'work', label: 'งานและคะแนน', items: [
      destination('/assignments', 'งานและกิจกรรม', 'assignments'),
      destination('/gradebook', 'สมุดเกรดรายวิชา', 'gradebook'),
      destination('/grade-editor', 'แก้ไขคะแนน', 'grade-edit')
    ] },
    /*
     * "ปีการศึกษา" opens and closes terms and moves whole year groups between them, which is the
     * school's calendar rather than one teacher's work. It belongs to the administrator; what a
     * teacher needs from it — which term is open right now — is on the dashboard.
     */
    { key: 'people', label: 'นักเรียน', items: [
      destination('/students', 'นักเรียน', 'students'),
      destination('/classes', 'ห้องเรียน', 'classes'),
      destination('/subjects', 'รายวิชา', 'subjects'),
      destination('/parents', 'ผู้ปกครอง', 'parents')
    ] },
    { key: 'reports', label: 'รายงาน', items: [
      destination('/reports', 'รายงาน', 'reports'),
      destination('/leaderboard', 'Leaderboard', 'leaderboard'),
      destination('/achievements', 'เหรียญรางวัล', 'achievements')
    ] },
    { key: 'operations', label: 'Sync', items: [
      destination('/operations', 'สถานะ Sync', 'operations')
    ] },
    { key: 'account', label: 'โปรไฟล์', items: [
      destination('/settings', 'ตั้งค่า', 'settings'),
      destination('/profile', 'โปรไฟล์ของฉัน', 'profile')
    ] }
  ],
  student: [
    { key: 'today', label: 'วันนี้', items: [
      destination('/', 'ภาพรวม', 'dashboard'),
      destination('/notifications', 'การแจ้งเตือน', 'bell'),
      destination('/calendar', 'ปฏิทิน', 'calendar')
    ] },
    { key: 'work', label: 'งานของฉัน', items: [
      destination('/assignments', 'งานและกิจกรรม', 'assignments'),
      destination('/sit-exam', 'สอบ', 'sit-exam')
    ] },
    /*
     * Medals are given, not browsed.
     *
     * The screen behind "เหรียญรางวัล" is the one a teacher awards from: it lists every child in
     * the school and what each of them has been given, which is a leaderboard of worth that nobody
     * asked a ten-year-old to read about themselves. A child learns about their own medal the way
     * they learn about a returned piece of work — a notification addressed to them — and sees the
     * ones they hold on their own profile. Taking the entry away also refuses the address.
     */
    { key: 'activities', label: 'กิจกรรม', items: [
      destination('/leaderboard', 'Leaderboard', 'leaderboard')
    ] },
    { key: 'scores', label: 'คะแนน', items: [
      destination('/scores', 'คะแนนและเกรด', 'scores'),
      destination('/gradebook', 'สมุดเกรด', 'gradebook'),
      destination('/reports', 'รายงานของฉัน', 'reports')
    ] },
    { key: 'timetable', label: 'ตารางเรียน', items: [
      destination('/timetable', 'ตารางสอน', 'timetable')
    ] },
    { key: 'classmates', label: 'เพื่อนร่วมชั้น', items: [
      destination('/students', 'นักเรียน', 'students')
    ] },
    { key: 'account', label: 'โปรไฟล์', items: [
      destination('/profile', 'โปรไฟล์ของฉัน', 'profile'),
      destination('/settings', 'ตั้งค่า', 'settings')
    ] }
  ],
  parent: [
    { key: 'children', label: 'ลูกของฉัน', items: [
      destination('/', 'ภาพรวม', 'dashboard'),
      destination('/my-children', 'ลูกของฉัน', 'children')
    ] },
    { key: 'attendance', label: 'การเข้าเรียน', items: [
      destination('/attendance', 'เช็กชื่อ / การเข้าเรียน', 'attendance')
    ] },
    { key: 'work', label: 'งานและคะแนน', items: [
      destination('/reports', 'รายงานของลูก', 'reports')
    ] },
    { key: 'timetable', label: 'ตารางเรียน', items: [
      destination('/timetable', 'ตารางสอน', 'timetable')
    ] },
    // No `/parents` entry here. For a guardian that screen only redirects to `/my-children`, so it
    // was a second door onto a page the menu already names — and the two sat under headings that
    // read as different places.
    { key: 'account', label: 'โปรไฟล์', items: [
      destination('/profile', 'โปรไฟล์ของฉัน', 'profile'),
      destination('/settings', 'ตั้งค่า', 'settings')
    ] }
  ]
};

/**
 * Whether a role may open a path, decided by the menu it was given.
 *
 * The menu above is already the statement of what each role is offered, so reading authority out of
 * it means a screen can never be hidden from a menu and still reachable by typing its address —
 * which is what happened before: every route was mounted for every role, and a student who typed
 * `/teachers` got the staff roster rendered against a snapshot that merely happened to be empty.
 *
 * This is a convenience and a piece of honesty, not the refusal that matters. The database decides
 * what any account can read; this only stops the product from offering a door it will not open.
 *
 * Longest match is unnecessary here — only membership matters — but the prefix rule is: a detail
 * screen belongs to whoever was given its list, so `/students/:id` follows `/students` and
 * `/my-children/:id` follows `/my-children` without either having to be named twice.
 */
export function isRouteAllowed(role: Role, path: string): boolean {
  return navigationByRole[role].some((group) => group.items.some((item) => (
    item.to === '/' ? path === '/' : path === item.to || path.startsWith(`${item.to}/`)
  )));
}

/**
 * Screens a teacher only holds by looking after a room, rather than by teaching in one.
 *
 * Guardians belong to a homeroom: the person who rings a parent is the child's advisor or their
 * assistant, and a teacher who takes one subject in the room has no business holding the school's
 * list of parents and their contact details. The role alone cannot say this — it depends on the
 * staff list — so the menu asks, and so does the route guard.
 */
export const ADVISOR_ONLY_ROUTES: readonly string[] = ['/parents'];

export function isAdvisorOnlyRoute(path: string): boolean {
  return ADVISOR_ONLY_ROUTES.some((route) => path === route || path.startsWith(`${route}/`));
}
