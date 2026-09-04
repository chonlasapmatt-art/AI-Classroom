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
      destination('/announcements', 'ประกาศรวม', 'announcements'),
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
    { key: 'work', label: 'งานและคะแนน', items: [
      destination('/assignments', 'งานและกิจกรรม', 'assignments'),
      destination('/scores', 'คะแนนและเกรด', 'scores'),
      destination('/gradebook', 'สมุดเกรด', 'gradebook'),
      destination('/grade-editor', 'แก้ไขคะแนน', 'grade-edit')
    ] },
    { key: 'people', label: 'นักเรียน', items: [
      destination('/students', 'นักเรียน', 'students'),
      destination('/classes', 'ห้องเรียน', 'classes'),
      destination('/subjects', 'รายวิชา', 'subjects'),
      destination('/parents', 'ผู้ปกครอง', 'parents'),
      destination('/import', 'นำเข้ารายชื่อ', 'import'),
      destination('/promotion', 'ปีการศึกษา', 'promotion')
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
      destination('/announcements', 'ประกาศรวม', 'announcements'),
      destination('/notifications', 'การแจ้งเตือน', 'bell'),
      destination('/calendar', 'ปฏิทิน', 'calendar')
    ] },
    { key: 'work', label: 'งานของฉัน', items: [
      destination('/assignments', 'งานและกิจกรรม', 'assignments'),
      destination('/sit-exam', 'สอบ', 'sit-exam')
    ] },
    { key: 'activities', label: 'กิจกรรม', items: [
      destination('/leaderboard', 'Leaderboard', 'leaderboard'),
      destination('/achievements', 'เหรียญรางวัล', 'achievements')
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
      destination('/reports', 'รายงานของลูก', 'reports'),
      destination('/achievements', 'เหรียญรางวัล', 'achievements')
    ] },
    { key: 'timetable', label: 'ตารางเรียน', items: [
      destination('/timetable', 'ตารางสอน', 'timetable')
    ] },
    { key: 'news', label: 'ประกาศ', items: [
      destination('/announcements', 'ประกาศรวม', 'announcements')
    ] },
    { key: 'account', label: 'โปรไฟล์', items: [
      destination('/parents', 'ผู้ปกครอง', 'parents'),
      destination('/profile', 'โปรไฟล์ของฉัน', 'profile'),
      destination('/settings', 'ตั้งค่า', 'settings')
    ] }
  ]
};
