import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useSession } from '../app/SessionContext';
import { useSchoolSnapshot } from '../data/RepositoryContext';
import { unreadCount } from '../academic/views';
import { isPreviewModeAvailable } from '../preview/previewMode';
import { StudentQuizPanel } from '../features/quiz/StudentQuizPanel';
import { TeacherCodeFirstRun } from '../features/teachers/TeacherCodeFirstRun';
import { ProfileAvatar } from '../features/avatars/ProfileAvatar';
import { useSyncStatus } from '../sync/SyncStatusContext';
import type { Role } from '../domain/types';

const roleLabels: Record<Role, string> = { admin: 'ผู้ดูแลระบบ', teacher: 'ครู', student: 'นักเรียน', parent: 'ผู้ปกครอง' };

interface NavItem { to: string; label: string; icon: string; roles: Role[] }
interface NavGroup { key: string; label: string; items: NavItem[] }

/** Sync state is shown as one calm pill; colour never carries the meaning on its own. */
const syncPillTone: Record<string, string> = {
  idle: 'online', syncing: 'syncing', synced: 'online', offline: 'offline', attention: 'attention', error: 'attention'
};

const navigationGroups: NavGroup[] = [
  { key: 'overview', label: 'ภาพรวมและการสื่อสาร', items: [
  { to: '/', label: 'ภาพรวม', icon: '◫', roles: ['admin', 'teacher', 'student', 'parent'] },
  { to: '/announcements', label: 'ประกาศรวม', icon: '📣', roles: ['admin', 'teacher', 'student', 'parent'] },
  { to: '/calendar', label: 'ปฏิทิน', icon: '▦', roles: ['admin', 'teacher', 'student'] },
  { to: '/timetable', label: 'ตารางสอน', icon: '▤', roles: ['admin', 'teacher', 'student', 'parent'] },
  { to: '/notifications', label: 'การแจ้งเตือน', icon: '🔔', roles: ['student'] }] },
  { key: 'school', label: 'จัดการโรงเรียน', items: [
  { to: '/students', label: 'นักเรียน', icon: '◉', roles: ['admin', 'teacher'] },
  { to: '/classes', label: 'ห้องเรียน', icon: '▦', roles: ['admin', 'teacher'] },
  { to: '/subjects', label: 'รายวิชา', icon: '◆', roles: ['admin', 'teacher'] },
  { to: '/teachers', label: 'ครู', icon: '✎', roles: ['admin'] },
  { to: '/parents', label: 'ผู้ปกครอง', icon: '♧', roles: ['admin', 'teacher', 'parent'] },
  { to: '/import', label: 'นำเข้ารายชื่อ', icon: '↥', roles: ['admin', 'teacher'] },
  { to: '/promotion', label: 'ปีการศึกษา', icon: '⇪', roles: ['admin', 'teacher'] }] },
  { key: 'learning', label: 'การเรียนการสอน', items: [
  { to: '/attendance', label: 'เช็กชื่อ / การเข้าเรียน', icon: '✓', roles: ['admin', 'teacher', 'parent'] },
  { to: '/assignments', label: 'งานและกิจกรรม', icon: '▤', roles: ['admin', 'teacher', 'student'] },
  { to: '/scores', label: 'คะแนนและเกรด', icon: '☆', roles: ['admin', 'teacher', 'student'] },
  { to: '/gradebook', label: 'สมุดเกรด', icon: '▩', roles: ['admin', 'teacher', 'student'] },
  { to: '/grade-editor', label: 'แก้ไขคะแนน', icon: '✎', roles: ['admin', 'teacher'] }] },
  { key: 'assessment', label: 'ข้อสอบและการประเมิน', items: [
  { to: '/question-bank', label: 'คลังข้อสอบ', icon: '✎', roles: ['admin', 'teacher'] },
  { to: '/quiz', label: 'Quiz Challenge', icon: '◈', roles: ['admin', 'teacher'] },
  { to: '/exams', label: 'ข้อสอบ', icon: '▤', roles: ['admin', 'teacher'] },
  { to: '/sit-exam', label: 'สอบ', icon: '✐', roles: ['student'] }] },
  { key: 'reports', label: 'ผลลัพธ์และระบบ', items: [
  { to: '/leaderboard', label: 'Leaderboard', icon: '♕', roles: ['admin', 'teacher', 'student'] },
  { to: '/achievements', label: 'เหรียญรางวัล', icon: '✦', roles: ['admin', 'teacher', 'student', 'parent'] },
  { to: '/my-children', label: 'ลูกของฉัน', icon: '♡', roles: ['parent'] },
  { to: '/reports', label: 'รายงาน', icon: '▥', roles: ['admin', 'teacher'] },
  { to: '/operations', label: 'Sync & Backup', icon: '↻', roles: ['admin'] }] },
  { key: 'account', label: 'บัญชีและเครื่องมือ', items: [
  { to: '/settings', label: 'ตั้งค่า', icon: '⚙', roles: ['admin', 'teacher'] },
  { to: '/profile', label: 'โปรไฟล์ของฉัน', icon: '☺', roles: ['admin', 'teacher', 'student', 'parent'] }] }
];

const sidebarStorageKey = (role: Role) => `smart-classroom.sidebar-groups.${role}`;
const avatarStorageKey = (profileId: string) => `smart-classroom.avatar.${profileId}`;

function readExpandedGroups(role: Role, groups: NavGroup[], path: string): Record<string, boolean> {
  try {
    const saved = JSON.parse(localStorage.getItem(sidebarStorageKey(role)) ?? '{}') as Record<string, unknown>;
    return Object.fromEntries(groups.map((group) => [
      group.key,
      group.items.some((item) => path === item.to || (item.to !== '/' && path.startsWith(`${item.to}/`)))
        || saved[group.key] !== false
    ]));
  } catch {
    return Object.fromEntries(groups.map((group) => [group.key, true]));
  }
}

export function AppShell({ children }: { children: ReactNode }) {
  const session = useSession();
  const snapshot = useSchoolSnapshot();
  const location = useLocation();
  const sync = useSyncStatus();
  const [open, setOpen] = useState(false);
  const { membership } = session;
  const ownStudent = snapshot.students.find((item) => item.profileId === membership.profileId);
  const ownTeacher = snapshot.teachers.find((item) => item.profileId === membership.profileId);
  const ownParentLink = snapshot.parentLinks.find((item) => item.profileId === membership.profileId || item.lineUserId === membership.profileId);
  const unread = ownStudent ? unreadCount(snapshot, ownStudent.id) : 0;
  const visibleGroups = useMemo(() => {
    const groups: NavGroup[] = navigationGroups.map((group) => ({
      ...group, items: group.items.filter((item) => item.roles.includes(membership.role))
    }));
    if (isPreviewModeAvailable && session.mode === 'preview') {
      groups.push({
        key: 'preview', label: 'ชุดเดโม Preview',
        items: [{ to: '/preview-demo', label: 'คู่มือทดสอบระบบ', icon: '✦', roles: ['admin', 'teacher', 'student', 'parent'] }]
      });
    }
    return groups.filter((group) => group.items.length > 0);
  }, [membership.role, session.mode]);
  const [expandedGroups, setExpandedGroups] = useState(() => readExpandedGroups(membership.role, visibleGroups, location.pathname));
  const [ownAvatarId, setOwnAvatarId] = useState(() => localStorage.getItem(avatarStorageKey(membership.profileId)));
  const ownAvatarPhotoId = ownStudent?.avatarPhotoId ?? ownTeacher?.avatarPhotoId ?? ownParentLink?.avatarPhotoId ?? null;
  const visibleAvatarId = ownStudent?.avatarId ?? ownTeacher?.avatarId ?? ownParentLink?.avatarId ?? ownAvatarId;

  useEffect(() => {
    setExpandedGroups(readExpandedGroups(membership.role, visibleGroups, location.pathname));
    setOwnAvatarId(localStorage.getItem(avatarStorageKey(membership.profileId)));
  }, [location.pathname, membership.profileId, membership.role, visibleGroups]);

  useEffect(() => {
    const refreshAvatar = () => setOwnAvatarId(localStorage.getItem(avatarStorageKey(membership.profileId)));
    window.addEventListener('smart-classroom:avatar-changed', refreshAvatar);
    return () => window.removeEventListener('smart-classroom:avatar-changed', refreshAvatar);
  }, [membership.profileId]);

  function toggleGroup(key: string) {
    setExpandedGroups((current) => {
      const next = { ...current, [key]: !current[key] };
      localStorage.setItem(sidebarStorageKey(membership.role), JSON.stringify(next));
      return next;
    });
  }

  return (
    <div className="app-frame">
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <div className="brand-mark small">SC</div>
          <div><strong>Smart Classroom</strong><span>{membership.schoolName}</span></div>
        </div>
        <nav aria-label="เมนูหลัก">
          {visibleGroups.map((group) => (
            <section className="sidebar-section" key={group.key}>
              <button
                type="button"
                className="sidebar-section-toggle"
                aria-expanded={expandedGroups[group.key] ?? true}
                onClick={() => toggleGroup(group.key)}
              >
                <span>{group.label}</span><span aria-hidden="true">{expandedGroups[group.key] ? '⌃' : '⌄'}</span>
              </button>
              {expandedGroups[group.key] && <div className="sidebar-section-items">
                {group.items.map((item) => (
                  <NavLink key={item.to} to={item.to} end={item.to === '/'} onClick={() => setOpen(false)}>
                    <span aria-hidden="true">{item.icon}</span>
                    {item.label}
                    {item.to === '/notifications' && unread > 0 && <span className="nav-badge">{unread}</span>}
                  </NavLink>
                ))}
              </div>}
            </section>
          ))}
          {isPreviewModeAvailable && session.mode === 'preview' && (
            <section className="sidebar-section">
              <div className="sidebar-section-items">
                <NavLink to="/avatar-gallery" onClick={() => setOpen(false)}>
                  <span aria-hidden="true">☺</span>Avatar Gallery
                </NavLink>
              </div>
            </section>
          )}
        </nav>
        <div className="sidebar-user">
          <ProfileAvatar displayName={membership.displayName} avatarId={visibleAvatarId} avatarPhotoId={ownAvatarPhotoId} size={40} />
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
              aria-label="ซิงก์ข้อมูลกับเซิร์ฟเวอร์ทันที"
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
