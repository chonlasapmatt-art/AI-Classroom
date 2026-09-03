import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useSession } from '../app/SessionContext';
import { recall, recallRecord, rememberRecord } from '../app/deviceMemory';
import { useSchoolSnapshot } from '../data/RepositoryContext';
import { unreadCount } from '../academic/views';
import { isPreviewModeAvailable } from '../preview/previewMode';
import { StudentQuizPanel } from '../features/quiz/StudentQuizPanel';
import { TeacherCodeFirstRun } from '../features/teachers/TeacherCodeFirstRun';
import { ProfileAvatar } from '../features/avatars/ProfileAvatar';
import { useSyncStatus } from '../sync/SyncStatusContext';
import { Icon, type IconName } from '../ui/Icon';
import type { Role } from '../domain/types';
import type { SessionValue, SupportView } from '../app/SessionContext';

const roleLabels: Record<Role, string> = { admin: 'ผู้ดูแลระบบ', teacher: 'ครู', student: 'นักเรียน', parent: 'ผู้ปกครอง' };

interface NavItem { to: string; label: string; icon: IconName; roles: Role[] }
interface NavGroup { key: string; label: string; items: NavItem[] }

/** Sync state is shown as one calm pill; colour never carries the meaning on its own. */
const syncPillTone: Record<string, string> = {
  idle: 'online', syncing: 'syncing', synced: 'online', offline: 'offline', attention: 'attention', error: 'attention'
};

const navigationGroups: NavGroup[] = [
  { key: 'overview', label: 'ภาพรวมและการสื่อสาร', items: [
  { to: '/', label: 'ภาพรวม', icon: 'dashboard', roles: ['admin', 'teacher', 'student', 'parent'] },
  { to: '/announcements', label: 'ประกาศรวม', icon: 'announcements', roles: ['admin', 'teacher', 'student', 'parent'] },
  { to: '/calendar', label: 'ปฏิทิน', icon: 'calendar', roles: ['admin', 'teacher', 'student'] },
  { to: '/timetable', label: 'ตารางสอน', icon: 'timetable', roles: ['admin', 'teacher', 'student', 'parent'] },
  { to: '/notifications', label: 'การแจ้งเตือน', icon: 'bell', roles: ['student'] }] },
  { key: 'school', label: 'จัดการโรงเรียน', items: [
  { to: '/students', label: 'นักเรียน', icon: 'students', roles: ['admin', 'teacher', 'student'] },
  { to: '/classes', label: 'ห้องเรียน', icon: 'classes', roles: ['admin', 'teacher'] },
  { to: '/subjects', label: 'รายวิชา', icon: 'subjects', roles: ['admin', 'teacher'] },
  { to: '/teachers', label: 'ครู', icon: 'teachers', roles: ['admin'] },
  { to: '/parents', label: 'ผู้ปกครอง', icon: 'parents', roles: ['admin', 'teacher', 'parent'] },
  { to: '/import', label: 'นำเข้ารายชื่อ', icon: 'import', roles: ['admin', 'teacher'] },
  { to: '/promotion', label: 'ปีการศึกษา', icon: 'promotion', roles: ['admin', 'teacher'] }] },
  { key: 'learning', label: 'การเรียนการสอน', items: [
  { to: '/attendance', label: 'เช็กชื่อ / การเข้าเรียน', icon: 'attendance', roles: ['admin', 'teacher', 'parent'] },
  { to: '/assignments', label: 'งานและกิจกรรม', icon: 'assignments', roles: ['admin', 'teacher', 'student'] },
  { to: '/scores', label: 'คะแนนและเกรด', icon: 'scores', roles: ['admin', 'teacher', 'student'] },
  { to: '/gradebook', label: 'สมุดเกรด', icon: 'gradebook', roles: ['admin', 'teacher', 'student'] },
  { to: '/grade-editor', label: 'แก้ไขคะแนน', icon: 'grade-edit', roles: ['admin', 'teacher'] }] },
  { key: 'assessment', label: 'ข้อสอบและการประเมิน', items: [
  { to: '/question-bank', label: 'คลังข้อสอบ', icon: 'question-bank', roles: ['admin', 'teacher'] },
  { to: '/quiz', label: 'Quiz Challenge', icon: 'quiz', roles: ['admin', 'teacher'] },
  { to: '/exams', label: 'ข้อสอบ', icon: 'exams', roles: ['admin', 'teacher'] },
  { to: '/sit-exam', label: 'สอบ', icon: 'sit-exam', roles: ['student'] }] },
  { key: 'reports', label: 'ผลลัพธ์และระบบ', items: [
  { to: '/leaderboard', label: 'Leaderboard', icon: 'leaderboard', roles: ['admin', 'teacher', 'student'] },
  { to: '/achievements', label: 'เหรียญรางวัล', icon: 'achievements', roles: ['admin', 'teacher', 'student', 'parent'] },
  { to: '/my-children', label: 'ลูกของฉัน', icon: 'children', roles: ['parent'] },
  { to: '/reports', label: 'รายงาน', icon: 'reports', roles: ['admin', 'teacher'] },
  { to: '/operations', label: 'Sync & Backup', icon: 'operations', roles: ['admin'] }] },
  { key: 'account', label: 'บัญชีและเครื่องมือ', items: [
  { to: '/settings', label: 'ตั้งค่า', icon: 'settings', roles: ['admin', 'teacher', 'student', 'parent'] },
  { to: '/profile', label: 'โปรไฟล์ของฉัน', icon: 'profile', roles: ['admin', 'teacher', 'student', 'parent'] }] }
];

const sidebarStorageKey = (role: Role) => `smart-classroom.sidebar-groups.${role}`;
const avatarStorageKey = (profileId: string) => `smart-classroom.avatar.${profileId}`;

const supportRoleOptions: { role: Role; label: string }[] = [
  { role: 'admin', label: 'ผู้ดูแลระบบ' },
  { role: 'teacher', label: 'ครู' },
  { role: 'student', label: 'นักเรียน' },
  { role: 'parent', label: 'ผู้ปกครอง' }
];

interface SupportTarget { profileId: string; displayName: string }

function SupportRoleSwitcher({ session, snapshot }: { session: SessionValue; snapshot: ReturnType<typeof useSchoolSnapshot> }) {
  const navigate = useNavigate();
  const support = session.support;
  if (!support) return null;
  const activeSupport = support;

  const operator = session.memberships.find((item) => item.membershipId.startsWith('support:')) ?? session.membership;
  const targets: Record<Role, SupportTarget[]> = {
    admin: [{ profileId: operator.profileId, displayName: operator.displayName }],
    teacher: snapshot.teachers
      .filter((teacher) => teacher.status === 'active' && teacher.profileId)
      .map((teacher) => ({ profileId: teacher.profileId!, displayName: teacher.displayName })),
    student: snapshot.students
      .filter((student) => student.status === 'active' && student.profileId)
      .map((student) => ({ profileId: student.profileId!, displayName: student.displayName })),
    parent: Array.from(new Map(snapshot.parentLinks
      .filter((link) => link.status === 'linked' && link.profileId)
      .map((link) => [link.profileId!, { profileId: link.profileId!, displayName: link.parentName }])).values())
  };
  const roleTargets = targets[activeSupport.view.role];

  function setRole(role: Role) {
    const target = targets[role][0] ?? operator;
    const next: SupportView = { role, targetProfileId: target.profileId, targetDisplayName: target.displayName };
    activeSupport.setView(next);
    navigate('/');
  }

  function setTarget(profileId: string) {
    const target = roleTargets.find((item) => item.profileId === profileId);
    if (!target) return;
    activeSupport.setView({ ...activeSupport.view, targetProfileId: target.profileId, targetDisplayName: target.displayName });
    navigate('/');
  }

  return (
    <div className="support-role-switch" aria-label="เครื่องมือดูแลหลายมุมมอง">
      <label className="role-switch-label">
        มุมมอง Support
        <select aria-label="เลือกมุมมอง Support" value={activeSupport.view.role} onChange={(event) => setRole(event.target.value as Role)}>
          {supportRoleOptions.map((option) => <option key={option.role} value={option.role}>{option.label}</option>)}
        </select>
      </label>
      <label className="role-switch-label support-target-select">
        บัญชีที่ตรวจสอบ
        <select
          aria-label="เลือกบัญชีที่ตรวจสอบ"
          value={roleTargets.some((item) => item.profileId === activeSupport.view.targetProfileId) ? activeSupport.view.targetProfileId : ''}
          onChange={(event) => setTarget(event.target.value)}
          disabled={roleTargets.length === 0}
        >
          {roleTargets.length === 0
            ? <option value="">ยังไม่มีบัญชีใน role นี้</option>
            : roleTargets.map((target) => <option key={target.profileId} value={target.profileId}>{target.displayName}</option>)}
        </select>
      </label>
    </div>
  );
}

function readExpandedGroups(role: Role, groups: NavGroup[], path: string): Record<string, boolean> {
  try {
    const saved = recallRecord<Record<string, unknown>>(sidebarStorageKey(role), {});
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
        items: [{ to: '/preview-demo', label: 'คู่มือทดสอบระบบ', icon: 'preview-demo', roles: ['admin', 'teacher', 'student', 'parent'] }]
      });
    }
    return groups.filter((group) => group.items.length > 0);
  }, [membership.role, session.mode]);
  const [expandedGroups, setExpandedGroups] = useState(() => readExpandedGroups(membership.role, visibleGroups, location.pathname));
  const [ownAvatarId, setOwnAvatarId] = useState(() => recall(avatarStorageKey(membership.profileId)));
  const ownAvatarPhotoId = ownStudent?.avatarPhotoId ?? ownTeacher?.avatarPhotoId ?? ownParentLink?.avatarPhotoId ?? null;
  const visibleAvatarId = ownStudent?.avatarId ?? ownTeacher?.avatarId ?? ownParentLink?.avatarId ?? ownAvatarId;

  useEffect(() => {
    setExpandedGroups(readExpandedGroups(membership.role, visibleGroups, location.pathname));
    setOwnAvatarId(recall(avatarStorageKey(membership.profileId)));
  }, [location.pathname, membership.profileId, membership.role, visibleGroups]);

  /*
   * The drawer had a scrim in the stylesheet and nothing rendering it, so on a phone it opened
   * over the page with no way back except finding the menu button again underneath it. Escape and
   * a tap outside are the two exits people try first; both close it now.
   *
   * The page behind is frozen while it is open. Without that, scrolling the drawer at its end
   * scrolls the page underneath, and the reader loses their place in a list they were halfway
   * through — on a phone that reads as the app throwing their work away.
   */
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    const refreshAvatar = () => setOwnAvatarId(recall(avatarStorageKey(membership.profileId)));
    window.addEventListener('smart-classroom:avatar-changed', refreshAvatar);
    return () => window.removeEventListener('smart-classroom:avatar-changed', refreshAvatar);
  }, [membership.profileId]);

  /*
   * Which navigation entry the current URL belongs to.
   *
   * The sidebar already highlights it, and on a phone the sidebar is not on screen — so the one
   * place that always answered "where am I" was hidden exactly where the question is hardest. The
   * top bar now carries the answer at every width.
   *
   * Longest match wins: `/my-children/:id` has to resolve to "ลูกของฉัน" rather than to `/`, and a
   * first-match scan over a list whose first entry is `/` would answer with the dashboard for every
   * page in the product.
   */
  const currentPage = useMemo(() => {
    const path = location.pathname;
    let best: { group: string; item: NavItem } | null = null;
    for (const group of visibleGroups) {
      for (const item of group.items) {
        const matches = item.to === '/' ? path === '/' : path === item.to || path.startsWith(`${item.to}/`);
        if (matches && (!best || item.to.length > best.item.to.length)) best = { group: group.label, item };
      }
    }
    return best;
  }, [location.pathname, visibleGroups]);

  /*
   * The phone's bottom bar: the five destinations this role opens most, and nothing else.
   *
   * It is a shortcut, never the whole menu — every one of these is still in the drawer, and the
   * drawer is still the complete list. Five is the ceiling because a sixth target on a 360px screen
   * is narrower than a thumb, and a bar people mis-tap is worse than one entry fewer.
   */
  const quickNav = useMemo(() => {
    const wanted: Record<Role, string[]> = {
      admin: ['/', '/students', '/attendance', '/reports', '/settings'],
      teacher: ['/', '/attendance', '/assignments', '/scores', '/announcements'],
      student: ['/', '/assignments', '/scores', '/notifications', '/profile'],
      parent: ['/', '/my-children', '/attendance', '/announcements', '/profile']
    };
    const available = new Map(visibleGroups.flatMap((group) => group.items.map((item) => [item.to, item])));
    return wanted[membership.role].map((to) => available.get(to)).filter((item): item is NavItem => Boolean(item));
  }, [membership.role, visibleGroups]);

  function toggleGroup(key: string) {
    setExpandedGroups((current) => {
      const next = { ...current, [key]: !current[key] };
      rememberRecord(sidebarStorageKey(membership.role), next);
      return next;
    });
  }

  return (
    <div className="app-frame">
      {open && (
        <div
          className="sidebar-overlay"
          role="presentation"
          onClick={() => setOpen(false)}
        />
      )}
      <aside className={`sidebar ${open ? 'open' : ''}`} aria-hidden={undefined}>
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
                <span>{group.label}</span><Icon name={expandedGroups[group.key] ? 'chevron-up' : 'chevron-down'} size={14} />
              </button>
              {expandedGroups[group.key] && <div className="sidebar-section-items">
                {group.items.map((item) => (
                  <NavLink key={item.to} to={item.to} end={item.to === '/'} onClick={() => setOpen(false)}>
                    <Icon name={item.icon} size={18} />
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
                  <Icon name="avatar-gallery" size={18} />Avatar Gallery
                </NavLink>
              </div>
            </section>
          )}
        </nav>
        <div className="sidebar-user">
          <ProfileAvatar displayName={membership.displayName} avatarId={visibleAvatarId} avatarPhotoId={ownAvatarPhotoId} size={40} />
          <div><strong>{membership.displayName}</strong><span>{roleLabels[membership.role]}</span></div>
          <button onClick={() => void session.signOut()} aria-label={session.mode === 'preview' ? 'ออกจากโหมด Preview' : 'ออกจากระบบ'}><Icon name="logout" size={18} /></button>
        </div>
      </aside>

      <div className="app-content">
        <header className="topbar">
          <button
            className="menu-button"
            onClick={() => setOpen((value) => !value)}
            aria-label={open ? 'ปิดเมนู' : 'เปิดเมนู'}
            aria-expanded={open}
          >
            <Icon name={open ? 'close' : 'menu'} size={22} />
          </button>
          {/* School, then section, then page — the same order the sidebar reads, so the bar is a
              reminder rather than a second way of describing the product. The section is dropped on
              a narrow screen by CSS rather than by JavaScript, so no width is ever mid-measurement. */}
          <div className="topbar-context">
            <span className="topbar-school">{membership.schoolName}</span>
            <span className="topbar-crumbs">
              {currentPage && <span className="topbar-section">{currentPage.group}</span>}
              <strong>{currentPage?.item.label ?? 'ภาพรวม'}</strong>
            </span>
          </div>
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
            {session.support ? <SupportRoleSwitcher session={session} snapshot={snapshot} /> : session.memberships.length > 1 && (
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
          {/* The role is stated, not inferred from which buttons happen to be on screen. A guardian
              and a teacher see different products; saying which one this is prevents the support
              call that starts "the button isn't there". */}
          <div className="topbar-identity">
            <span className="topbar-role">{roleLabels[membership.role]}</span>
            <NavLink to="/profile" className="topbar-avatar" aria-label={`โปรไฟล์ของ ${membership.displayName}`}>
              <ProfileAvatar
                displayName={membership.displayName} avatarId={visibleAvatarId}
                avatarPhotoId={ownAvatarPhotoId} size={34}
              />
            </NavLink>
          </div>
        </header>
        {/* An operator working inside a school through the ordinary screens must never be mistaken
            for the school's own administrator — by the school, or by themselves. */}
        {membership.membershipId.startsWith('support:') && (
          <div className="support-banner" role="status">
            <strong>SUPER ADMIN SUPPORT MODE · {roleLabels[membership.role]}</strong>
            <span>กำลังดูแล: {membership.schoolName}</span>
            <span className="support-reason">มุมมองนี้ใช้ตรวจสอบข้อมูลจริง · สิทธิ์แก้ไขยังตรวจจาก Support Session ของเซิร์ฟเวอร์</span>
            <button type="button" onClick={() => void session.support?.end()}>ออกจาก Support Mode</button>
          </div>
        )}
        {/* A round running in this student's class reaches them wherever they are in the app: the
            invitation is the enrolment, not a code somebody has to read off a board. */}
        <main className="page-content"><StudentQuizPanel />{children}</main>
        {/* Shown only under the drawer breakpoint, by CSS. Rendering it at every width and hiding
            it in the stylesheet keeps one DOM for every screen size — a bar that mounted on resize
            would move focus and lose a half-typed field on a tablet being rotated. */}
        {quickNav.length > 0 && (
          <nav className="bottom-nav" aria-label="เมนูลัด">
            {quickNav.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.to === '/'}>
                <span className="bottom-nav-icon">
                  <Icon name={item.icon} size={20} />
                  {item.to === '/notifications' && unread > 0 && <span className="bottom-nav-badge" aria-hidden="true" />}
                </span>
                <span className="bottom-nav-label">{item.label}</span>
              </NavLink>
            ))}
          </nav>
        )}
        <TeacherCodeFirstRun />
      </div>
    </div>
  );
}
