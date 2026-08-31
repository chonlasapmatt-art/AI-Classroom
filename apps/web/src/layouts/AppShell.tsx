import { useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useSession } from '../app/SessionContext';
import { useSchoolSnapshot } from '../data/RepositoryContext';
import { unreadCount } from '../academic/views';
import { isPreviewModeAvailable } from '../preview/previewMode';
import { StudentQuizPanel } from '../features/quiz/StudentQuizPanel';
import { TeacherCodeFirstRun } from '../features/teachers/TeacherCodeFirstRun';
import { useSyncStatus } from '../sync/SyncStatusContext';
import type { Role } from '../domain/types';

const roleLabels: Record<Role, string> = { admin: 'ผู้ดูแลระบบ', teacher: 'ครู', student: 'นักเรียน', parent: 'ผู้ปกครอง' };

interface NavItem { to: string; label: string; icon: string; roles: Role[] }

/** Sync state is shown as one calm pill; colour never carries the meaning on its own. */
const syncPillTone: Record<string, string> = {
  idle: 'online', syncing: 'syncing', synced: 'online', offline: 'offline', attention: 'attention', error: 'attention'
};

const navigation: NavItem[] = [
  { to: '/', label: 'ภาพรวม', icon: '◫', roles: ['admin', 'teacher', 'student', 'parent'] },
  { to: '/students', label: 'นักเรียน', icon: '◉', roles: ['admin', 'teacher'] },
  { to: '/calendar', label: 'ปฏิทิน', icon: '▦', roles: ['admin', 'teacher', 'student'] },
  { to: '/timetable', label: 'ตารางสอน', icon: '▤', roles: ['admin', 'teacher', 'student', 'parent'] },
  { to: '/notifications', label: 'การแจ้งเตือน', icon: '🔔', roles: ['student'] },
  { to: '/classes', label: 'ห้องเรียน', icon: '▦', roles: ['admin', 'teacher'] },
  { to: '/subjects', label: 'รายวิชา', icon: '◆', roles: ['admin', 'teacher'] },
  { to: '/teachers', label: 'ครู', icon: '✎', roles: ['admin'] },
  { to: '/attendance', label: 'เช็กชื่อ', icon: '✓', roles: ['admin', 'teacher'] },
  { to: '/assignments', label: 'งานและกิจกรรม', icon: '▤', roles: ['admin', 'teacher', 'student'] },
  { to: '/scores', label: 'คะแนนและเกรด', icon: '☆', roles: ['admin', 'teacher', 'student'] },
  { to: '/gradebook', label: 'สมุดเกรด', icon: '▩', roles: ['admin', 'teacher', 'student'] },
  { to: '/question-bank', label: 'คลังข้อสอบ', icon: '✎', roles: ['admin', 'teacher'] },
  { to: '/quiz', label: 'Quiz Challenge', icon: '◈', roles: ['admin', 'teacher'] },
  { to: '/grade-editor', label: 'แก้ไขคะแนน', icon: '✎', roles: ['admin', 'teacher'] },
  { to: '/leaderboard', label: 'Leaderboard', icon: '♕', roles: ['admin', 'teacher', 'student'] },
  { to: '/achievements', label: 'เหรียญรางวัล', icon: '✦', roles: ['admin', 'teacher', 'student', 'parent'] },
  { to: '/my-children', label: 'ลูกของฉัน', icon: '♡', roles: ['parent'] },
  { to: '/parents', label: 'ผู้ปกครอง', icon: '♧', roles: ['admin', 'teacher', 'parent'] },
  { to: '/reports', label: 'รายงาน', icon: '▥', roles: ['admin', 'teacher'] },
  { to: '/import', label: 'นำเข้ารายชื่อ', icon: '↥', roles: ['admin', 'teacher'] },
  { to: '/promotion', label: 'ปีการศึกษา', icon: '⇪', roles: ['admin', 'teacher'] },
  { to: '/operations', label: 'Sync & Backup', icon: '↻', roles: ['admin', 'teacher'] },
  { to: '/settings', label: 'ตั้งค่า', icon: '⚙', roles: ['admin', 'teacher'] },
  { to: '/profile', label: 'โปรไฟล์ของฉัน', icon: '☺', roles: ['admin', 'teacher', 'student', 'parent'] }
];

export function AppShell({ children }: { children: ReactNode }) {
  const session = useSession();
  const snapshot = useSchoolSnapshot();
  const sync = useSyncStatus();
  const [open, setOpen] = useState(false);
  const { membership } = session;
  const ownStudent = snapshot.students.find((item) => item.profileId === membership.profileId);
  const unread = ownStudent ? unreadCount(snapshot, ownStudent.id) : 0;
  const items = navigation.filter((item) => item.roles.includes(membership.role));

  return (
    <div className="app-frame">
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <div className="brand-mark small">SC</div>
          <div><strong>Smart Classroom</strong><span>{membership.schoolName}</span></div>
        </div>
        <nav aria-label="เมนูหลัก">
          {items.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === '/'} onClick={() => setOpen(false)}>
              <span aria-hidden="true">{item.icon}</span>
              {item.label}
              {item.to === '/notifications' && unread > 0 && <span className="nav-badge">{unread}</span>}
            </NavLink>
          ))}
          {isPreviewModeAvailable && session.mode === 'preview' && membership.role === 'admin' && (
            // Development tool only: teachers, students and parents pick their avatar on their profile.
            <NavLink to="/avatar-gallery" onClick={() => setOpen(false)}>
              <span aria-hidden="true">☺</span>Avatar Gallery
            </NavLink>
          )}
        </nav>
        <div className="sidebar-user">
          <span className="user-avatar">{membership.displayName.slice(0, 1)}</span>
          <div><strong>{membership.displayName}</strong><span>{roleLabels[membership.role]}</span></div>
          <button onClick={() => void session.signOut()} aria-label={session.mode === 'preview' ? 'ออกจากโหมด Preview' : 'ออกจากระบบ'}>↪</button>
        </div>
      </aside>

      <div className="app-content">
        <header className="topbar">
          <button className="menu-button" onClick={() => setOpen((value) => !value)} aria-label="เปิดเมนู">☰</button>
          {session.mode === 'preview' ? (
            <div className="sync-pill preview"><span />Preview / Development Only · ไม่ใช่ข้อมูลจริง</div>
          ) : (
            <button
              type="button"
              className={`sync-pill ${syncPillTone[sync?.phase ?? 'idle'] ?? 'online'}`}
              onClick={() => void sync?.syncNow()}
              title={sync?.detail || 'ซิงก์ข้อมูลกับเซิร์ฟเวอร์'}
            >
              <span />{sync?.label ?? 'เชื่อมต่อ Supabase'}
            </button>
          )}
          <div className="role-switch">
            {session.memberships.length > 1 && (
              <label className="role-switch-label">
                {session.mode === 'preview' ? 'สลับบทบาท (Preview)' : 'บทบาท'}
                <select
                  aria-label="เลือกบทบาท"
                  value={membership.membershipId}
                  onChange={(event) => session.selectMembership(event.target.value)}
                >
                  {session.memberships.map((item) => (
                    <option key={item.membershipId} value={item.membershipId}>
                      {roleLabels[item.role]} · {item.displayName}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </header>
        {/* An operator working inside a school through the ordinary screens must never be mistaken
            for the school's own administrator — by the school, or by themselves. */}
        {membership.membershipId.startsWith('support:') && (
          <div className="support-banner" role="status">
            <strong>SUPER ADMIN SUPPORT MODE</strong>
            <span>กำลังดูแล: {membership.schoolName}</span>
            <span className="support-reason">ทุกการกระทำถูกบันทึกในบันทึกตรวจสอบของโรงเรียนนี้</span>
          </div>
        )}
        {/* A round running in this student's class reaches them wherever they are in the app: the
            invitation is the enrolment, not a code somebody has to read off a board. */}
        <main className="page-content"><StudentQuizPanel />{children}</main>
        <TeacherCodeFirstRun />
      </div>
    </div>
  );
}
