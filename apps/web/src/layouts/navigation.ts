import type { IconName } from '../ui/Icon';
import type { Role } from '../domain/types';
export interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  /**
   * Reachable, but not offered in the menu.
   *
   * The menu is also what grants a route -- `isRouteAllowed` reads this list -- so a screen that
   * should be reached from somewhere else in the product cannot simply be deleted from it without
   * closing the address to the very buttons that lead there. Hidden means the role still holds the
   * screen; only the menu row is gone.
   */
  hidden?: true;
}
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
 * The same destination, held by the role but reached from a screen rather than from the menu.
 *
 * `/profile` is one of these now. It used to be a row in every role's menu called "โปรไฟล์ของฉัน",
 * sitting a few centimetres below the card at the foot of the sidebar that already showed the
 * person's avatar, their name and their role — two doors onto the same screen, one of them looking
 * exactly like the thing it leads to and not being pressable. The card is the door; the row was the
 * duplicate, and the route is still granted from here.
 */
export const reachedElsewhere = (to: string, label: string, icon: IconName): NavItem =>
  ({ to, label, icon, hidden: true });

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
      /*
       * The room moved up here from "structure".
       *
       * It was filed with subjects and the question bank as a thing an administrator sets up once a
       * year. It is now the way into the register -- every room carries a "เช็กชื่อ" button that
       * opens the period being taught -- so it belongs with the day: the calendar, the timetable,
       * and the rooms those two describe.
       */
      destination('/classes', 'ห้องเรียน', 'classes'),
      destination('/timetable', 'ตารางสอน', 'timetable')
    ] },
    { key: 'people', label: 'นักเรียนและบุคลากร', items: [
      destination('/students', 'นักเรียน', 'students'),
      destination('/teachers', 'ครู', 'teachers'),
      destination('/parents', 'ผู้ปกครอง', 'parents'),
      destination('/promotion', 'ปีการศึกษา', 'promotion')
    ] },
    { key: 'structure', label: 'รายวิชาและข้อสอบ', items: [
      destination('/subjects', 'รายวิชา', 'subjects'),
      destination('/question-bank', 'คลังข้อสอบ', 'question-bank'),
      destination('/exams', 'ข้อสอบ', 'exams')
    ] },
    { key: 'classroom', label: 'งาน คะแนน และการเข้าเรียน', items: [
      /*
       * "เช็กชื่อ" is not an errand of its own any more, and no longer a menu entry either.
       *
       * It was a screen somebody had to remember to visit, pick the room on and pick the period on
       * -- all three of which the timetable already knows the moment somebody opens the room being
       * taught. The room card in ห้องเรียน offers the two jobs as two buttons: "เช็กชื่อ" goes to
       * that period's sheet, "ดูรายชื่อนักเรียน" opens the roll. The route is untouched; what is
       * gone is a third door into a place two clearer ones already lead to.
       *
       * What is left in the menu is the screen for reading a past day and correcting it, under
       * รายงาน, which is a different job and is named as one.
       */
      reachedElsewhere('/classroom', 'เปิดคาบเรียน · เช็กชื่อ', 'attendance'),
      /*
       * The one entry for everything run in front of a class.
       *
       * The activities behind it arrived one at a time and each took its own place in the menu — a
       * picker on the board, a quiz screen two sections away, points typed on a third screen. A
       * teacher standing in front of thirty people presses one thing; the grid behind this entry is
       * where the choosing happens.
       */
      destination('/classroom-tools', 'เกมและกิจกรรมหน้าชั้นเรียน', 'dice'),
      /*
       * Quiz Challenge is off the menu, and still reachable.
       *
       * The school asked for the row to go. The route is what the menu grants, so deleting the
       * entry outright would also close the address — including the link on the preview tour that
       * walks a teacher through running a round. Hidden keeps the screen for the roles that had it
       * and takes away only the row.
       */
      reachedElsewhere('/quiz', 'Quiz Challenge', 'quiz'),
      destination('/assignments', 'งานและกิจกรรม', 'assignments'),
      destination('/scores', 'คะแนนและเกรด', 'scores'),
      // The administrator keeps the teacher's merged screen — one entry over both views — rather
      // than the old separate "สมุดเกรด", which named a second place for the same rows.
      destination('/gradebook', 'สมุดเกรดรายวิชา', 'gradebook'),
      destination('/grade-editor', 'แก้ไขคะแนน', 'grade-edit')
    ] },
    { key: 'reports', label: 'รายงาน', items: [
      destination('/reports', 'กล่องข้อความห้องเรียน', 'reports'),
      destination('/attendance', 'ประวัติการเข้าเรียน', 'attendance'),
      destination('/analytics', 'รายงานเชิงลึก', 'reports'),
      destination('/leaderboard', 'Leaderboard', 'leaderboard')
    ] },
    { key: 'operations', label: 'Sync และ Backup', items: [
      destination('/operations', 'Sync & Backup', 'operations')
    ] },
    { key: 'account', label: 'ตั้งค่า', items: [
      destination('/settings', 'ตั้งค่า', 'settings'),
      reachedElsewhere('/profile', 'โปรไฟล์ของฉัน', 'profile')
    ] }
  ],
  teacher: [
    { key: 'today', label: 'วันนี้', items: [
      destination('/', 'ภาพรวม', 'dashboard'),
      destination('/calendar', 'ปฏิทิน', 'calendar'),
      // Beside the calendar, because the room is the way into the lesson and the register.
      destination('/classes', 'ห้องเรียน', 'classes'),
      destination('/timetable', 'ตารางสอน', 'timetable')
    ] },
    /*
     * Taking the register is not an errand of its own any more, and not a menu entry either.
     *
     * "เช็กชื่อ" was a screen a teacher had to remember to visit, choose the room on and choose the
     * period on — all of which the timetable already knows the moment they open the room they are
     * teaching. So the register lives in the lesson, reached from the room: ห้องเรียน lists the
     * rooms this teacher has, and each card carries "เช็กชื่อ" and "ดูรายชื่อนักเรียน" as two
     * separate buttons. Each period still has its own sheet, so the next teacher into the room
     * starts from a clean one.
     */
    { key: 'activities', label: 'สอนวันนี้', items: [
      reachedElsewhere('/classroom', 'เปิดคาบเรียน · เช็กชื่อ', 'attendance'),
      /*
       * The one entry for everything run in front of a class.
       *
       * The activities behind it arrived one at a time and each took its own place in the menu — a
       * picker on the board, a quiz screen two sections away, points typed on a third screen. A
       * teacher standing in front of thirty people presses one thing; the grid behind this entry is
       * where the choosing happens.
       */
      destination('/classroom-tools', 'เกมและกิจกรรมหน้าชั้นเรียน', 'dice'),
      // Off the menu for the teacher too, and kept reachable for the same reason as the administrator's.
      reachedElsewhere('/quiz', 'Quiz Challenge', 'quiz'),
      destination('/question-bank', 'คลังข้อสอบ', 'question-bank'),
      destination('/exams', 'ข้อสอบ', 'exams')
    ] },
    /*
     * "คะแนนและเกรด" and "สมุดเกรด" were one screen split in two, and a teacher had to know which
     * of them held the number they were after. They are now one entry over both views.
     *
     * Importing a roster is not a screen any more: adding people from a file is a button beside
     * the form that adds one, on the students, teachers and guardians screens.
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
      destination('/subjects', 'รายวิชา', 'subjects'),
      destination('/parents', 'ผู้ปกครอง', 'parents')
    ] },
    { key: 'reports', label: 'รายงาน', items: [
      destination('/reports', 'กล่องข้อความห้องเรียน', 'reports'),
      destination('/analytics', 'รายงานเชิงลึก', 'reports'),
      destination('/leaderboard', 'Leaderboard', 'leaderboard')
    ] },
    { key: 'operations', label: 'Sync', items: [
      destination('/operations', 'สถานะ Sync', 'operations')
    ] },
    { key: 'account', label: 'ตั้งค่า', items: [
      destination('/settings', 'ตั้งค่า', 'settings'),
      reachedElsewhere('/profile', 'โปรไฟล์ของฉัน', 'profile')
    ] }
  ],
  student: [
    { key: 'today', label: 'วันนี้', items: [
      destination('/', 'ภาพรวม', 'dashboard'),
      destination('/notifications', 'การแจ้งเตือน', 'bell'),
      destination('/calendar', 'ปฏิทิน', 'calendar'),
      /*
       * Beside the calendar, rather than under a heading of its own.
       *
       * "ตารางเรียน" was a section containing one row with the same name, so the menu said the word
       * twice and spent a whole heading on it. What a timetable answers is "what is on today", which
       * is the question the calendar beside it answers over a longer span — so they belong together,
       * and the section they were in is gone rather than renamed.
       *
       * A student reads a class timetable. Only the people who teach from one call it ตารางสอน.
       */
      destination('/timetable', 'ตารางเรียน', 'timetable')
    ] },
    /*
     * Everything about the studying, under one heading.
     *
     * Work, exams, marks and lessons were four rows under three headings — "งานของฉัน", "คะแนน" and
     * half of "ห้องเรียนของฉัน" — and a heading that holds one row is a line to read for no choice
     * offered. A child looking for what they scored and a child looking for what to hand in are on
     * the same errand, so the menu says it once.
     */
    { key: 'learning', label: 'การเรียนของฉัน', items: [
      destination('/assignments', 'งานและกิจกรรม', 'assignments'),
      destination('/sit-exam', 'สอบ', 'sit-exam'),
      destination('/scores', 'คะแนนและเกรด', 'scores'),
      destination('/subjects', 'รายวิชาและบทเรียน', 'subjects')
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
    { key: 'classroom', label: 'ห้องเรียนและรางวัล', items: [
      destination('/students', 'เพื่อนร่วมชั้น', 'students'),
      destination('/leaderboard', 'Leaderboard', 'leaderboard')
    ] },
    /*
     * Marks and lessons moved up into "การเรียนของฉัน", and the two headings they had are gone.
     *
     * One place for marks, not two: "สมุดเกรด" and "คะแนนและเกรด" answered the same question about
     * the same rows, and a child choosing between them was choosing between two words for one
     * thing. A subject is where the lessons are, so it stays on every menu — a student opens it to
     * watch what their teacher published, a guardian to see what is being taught. What each of them
     * may do inside is decided there, not here.
     */
    { key: 'account', label: 'ตั้งค่า', items: [
      reachedElsewhere('/profile', 'โปรไฟล์ของฉัน', 'profile'),
      destination('/settings', 'ตั้งค่า', 'settings')
    ] }
  ],
  parent: [
    { key: 'children', label: 'ลูกของฉัน', items: [
      destination('/', 'ภาพรวม', 'dashboard'),
      destination('/my-children', 'ลูกของฉัน', 'children'),
      // The timetable sits with the calendar for the same reason it does on a student's menu: it is
      // the short answer to "what is on today", and it had a whole section to itself for one row.
      destination('/timetable', 'ตารางเรียนของลูก', 'timetable'),
      /*
       * The register is one row, and it had a section of its own.
       *
       * A guardian's whole menu is six rows; spending a heading on one of them is two lines of
       * reading for one destination. It is about their child, which is what this section is already
       * called.
       */
      destination('/attendance', 'การเข้าเรียนของลูก', 'attendance'),
      destination('/subjects', 'รายวิชาและบทเรียน', 'subjects')
    ] },
    // No `/parents` entry here. For a guardian that screen only redirects to `/my-children`, so it
    // was a second door onto a page the menu already names — and the two sat under headings that
    // read as different places.
    { key: 'account', label: 'ตั้งค่า', items: [
      reachedElsewhere('/profile', 'โปรไฟล์ของฉัน', 'profile'),
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
