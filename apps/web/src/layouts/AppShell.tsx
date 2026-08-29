import { useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useSession } from '../app/SessionContext';
import { useSchoolSnapshot } from '../data/RepositoryContext';
import { unreadCount } from '../academic/views';
import { isPreviewModeAvailable } from '../preview/previewMode';
import type { Role } from '../domain/types';

const roleLabels: Record<Role, string> = { admin: 'ผู้ดูแลระบบ', teacher: 'ครู', student: 'นักเรียน', parent: 'ผู้ปกครอง' };

interface NavItem { to: string; label: string; icon: string; roles: Role[] }

const navigation: NavItem[] = [
  { to: '/', label: 'ภาพรวม', icon: '◫', roles: ['admin', 'teacher', 'student', 'parent'] },
  { to: '/students', label: 'นักเรียน', icon: '◉', roles: ['admin', 'teacher'] },
  { to: '/calendar', label: 'ปฏิทิน', icon: '▦', roles: ['admin', 'teacher', 'student'] },
  { to: '/notifications', label: 'การแจ้งเตือน', icon: '🔔', roles: ['student'] },
  { to: '/classes', label: 'ห้องเรียน', icon: '▦', roles: ['admin', 'teacher'] },
  { to: '/subjects', label: 'รายวิชา', icon: '◆', roles: ['admin', 'teacher'] },
  { to: '/teachers', label: 'ครู', icon: '✎', roles: ['admin'] },
  { to: '/attendance', label: 'เช็กชื่อ', icon: '✓', roles: ['admin', 'teacher'] },
  { to: '/assignments', label: 'งานและกิจกรรม', icon: '▤', roles: ['admin', 'teacher', 'student'] },
  { to: '/scores', label: 'คะแนนและเกรด', icon: '☆', roles: ['admin', 'teacher', 'student'] },
  { to: '/gradebook', label: 'สมุดเกรด', icon: '▩', roles: ['admin', 'teacher', 'student'] },
  { to: '/grade-editor', label: 'แก้ไขคะแนน', icon: '✎', roles: ['admin', 'teacher'] },
  { to: '/leaderboard', label: 'Leaderboard', icon: '♕', roles: ['admin', 'teacher', 'student'] },
  { to: '/parents', label: 'ผู้ปกครอง', icon: '♧', roles: ['admin', 'teacher', 'parent'] },
  { to: '/reports', label: 'รายงาน', icon: '▥', roles: ['admin', 'teacher'] },
  { to: '/import', label: 'นำเข้ารายชื่อ', icon: '↥', roles: ['admin', 'teacher'] },
  { to: '/operations', label: 'Sync & Backup', icon: '↻', roles: ['admin', 'teacher'] },
  { to: '/settings', label: 'ตั้งค่า', icon: '⚙', roles: ['admin', 'teacher'] },
  { to: '/profile', label: 'โปรไฟล์ของฉัน', icon: '☺', roles: ['admin', 'teacher', 'student', 'parent'] }
];

export function AppShell({ children }: { children: ReactNode }) {
  const session = useSession();
  const snapshot = useSchoolSnapshot();
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
            <div className="sync-pill online"><span />เชื่อมต่อ Supabase</div>
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
        <main className="page-content">{children}</main>
      </div>
    </div>
  );
}
