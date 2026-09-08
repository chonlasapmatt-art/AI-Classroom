import { Link } from 'react-router-dom';
import { Card, CardHeader, LinkButton } from '../../ui/components';
import { Icon, type IconName } from '../../ui/Icon';
import type { Role } from '../../domain/types';

interface AdminDoor { to: string; label: string; description: string; icon: IconName }

/**
 * The screens an administrator runs the school from, named once.
 *
 * Every one of them already exists and already has its own guard; this list is a set of addresses,
 * not a new permission. Adding a door here adds a shortcut and nothing else — whether it opens is
 * still decided by `isRouteAllowed` on the way in and by the database on the way down.
 */
const adminDoors: AdminDoor[] = [
  { to: '/operations', label: 'Sync และ Backup', description: 'สถานะการซิงค์ สำรองข้อมูล และกู้คืน', icon: 'operations' },
  { to: '/teachers', label: 'บุคลากร', description: 'เพิ่ม แก้ไข และกำหนดสิทธิ์ครูในโรงเรียน', icon: 'teachers' },
  { to: '/announcements', label: 'ประกาศรวม', description: 'ประกาศที่ทั้งโรงเรียนเห็นพร้อมกัน', icon: 'announcements' },
  { to: '/import', label: 'นำเข้ารายชื่อ', description: 'นำเข้านักเรียนและผู้ปกครองจากไฟล์', icon: 'import' },
  { to: '/promotion', label: 'ปีการศึกษา', description: 'เลื่อนชั้นและปิดปีการศึกษา', icon: 'promotion' },
  { to: '/settings', label: 'ตั้งค่าโรงเรียน', description: 'เกรด การเข้าเรียน และค่าตั้งต้นของระบบ', icon: 'settings' }
];

/**
 * The way into the administrator's side of the product, from the screen everybody starts on.
 *
 * It renders for an administrator and for nobody else, so a student's home screen is unchanged and
 * a teacher's home screen is unchanged. That is a courtesy rather than a defence: each address
 * below is guarded on arrival, and anybody who types one without the role gets the same refusal
 * page they would have got before this card existed. Nothing here touches sign-in — the account
 * looking at it is already signed in through the school's own login.
 */
export function AdminEntry({ role }: { role: Role }) {
  if (role !== 'admin') return null;

  return (
    <Card className="admin-entry">
      <CardHeader
        title={<><Icon name="operations" size={18} /> ศูนย์ผู้ดูแลระบบ</>}
        description="เฉพาะผู้ดูแลระบบเท่านั้นที่เห็นส่วนนี้"
        action={<LinkButton to="/operations" variant="primary" size="sm">เปิดศูนย์ผู้ดูแล</LinkButton>}
      />
      <div className="admin-entry-grid">
        {adminDoors.map((door) => (
          <Link key={door.to} to={door.to} className="admin-entry-door" data-icon={door.icon}>
            <span className="admin-entry-icon" aria-hidden="true"><Icon name={door.icon} size={20} /></span>
            <span className="admin-entry-copy">
              <strong>{door.label}</strong>
              <small>{door.description}</small>
            </span>
            <Icon name="chevron-right" size={16} className="admin-entry-chevron" />
          </Link>
        ))}
      </div>
    </Card>
  );
}
