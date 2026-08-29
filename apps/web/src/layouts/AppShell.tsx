import { useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../app/AuthContext';

const roleLabels = { admin: 'ผู้ดูแลระบบ', teacher: 'ครู', student: 'นักเรียน', parent: 'ผู้ปกครอง' } as const;
const navigation = [['/', 'ภาพรวม', '◫'], ['/students', 'นักเรียน', '◉'], ['/attendance', 'เช็กชื่อ', '✓'], ['/assignments', 'งานและกิจกรรม', '▤'], ['/scores', 'คะแนนและเกรด', '☆'], ['/leaderboard', 'Leaderboard', '♕'], ['/parents', 'ผู้ปกครอง', '♧'], ['/reports', 'รายงาน', '▥'], ['/operations', 'Sync & Backup', '↻'], ['/settings', 'ตั้งค่า', '⚙']] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const auth = useAuth(); const [open, setOpen] = useState(false); const active = auth.active!;
  return <div className="app-frame"><aside className={`sidebar ${open ? 'open' : ''}`}><div className="sidebar-brand"><div className="brand-mark small">SC</div><div><strong>Smart Classroom</strong><span>{active.schoolName}</span></div></div><nav aria-label="เมนูหลัก">{navigation.map(([to, label, icon]) => <NavLink key={to} to={to} end={to === '/'} onClick={() => setOpen(false)}><span aria-hidden="true">{icon}</span>{label}</NavLink>)}</nav><div className="sidebar-user"><span className="user-avatar">{active.displayName.slice(0, 1)}</span><div><strong>{active.displayName}</strong><span>{roleLabels[active.role]}</span></div><button onClick={() => void auth.signOut()} aria-label="ออกจากระบบ">↪</button></div></aside><div className="app-content"><header className="topbar"><button className="menu-button" onClick={() => setOpen((value) => !value)} aria-label="เปิดเมนู">☰</button><div className="sync-pill online"><span/>ออนไลน์ · ซิงค์แล้ว</div><div className="role-switch">{auth.memberships.length > 1 && <select aria-label="เลือกบทบาท" value={active.membershipId} onChange={(e) => auth.selectMembership(e.target.value)}>{auth.memberships.map((item) => <option key={item.membershipId} value={item.membershipId}>{item.schoolName} · {roleLabels[item.role]}</option>)}</select>}</div></header><main className="page-content">{children}</main></div></div>;
}
