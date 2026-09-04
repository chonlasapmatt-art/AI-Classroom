import { useLocation } from 'react-router-dom';
import { useSession } from '../../app/SessionContext';
import { Card, ForbiddenState, LinkButton, PageHeader } from '../../ui/components';
import { navigationByRole } from '../../layouts/navigation';
import type { Role } from '../../domain/types';

const roleLabels: Record<Role, string> = {
  admin: 'ผู้ดูแลระบบ', teacher: 'ครู', student: 'นักเรียน', parent: 'ผู้ปกครอง'
};

/**
 * A screen this account was never offered.
 *
 * The menu is written per role, so reaching here means the address was typed, followed from a link
 * meant for somebody else, or kept from a session under a different role. Naming the role and the
 * address turns a dead end into something a person can explain to whoever sent them the link —
 * and it is deliberately not phrased as a failure, because nothing failed.
 */
export function ForbiddenPage() {
  const location = useLocation();
  const { membership } = useSession();
  const home = navigationByRole[membership.role][0]?.items[0]?.to ?? '/';

  return (
    <>
      <PageHeader
        eyebrow="สิทธิ์การเข้าถึง"
        title="หน้านี้ไม่ได้เปิดให้บทบาทของคุณ"
        description={`บัญชีนี้เข้าใช้งานในฐานะ ${roleLabels[membership.role]}`}
        action={<LinkButton to={home} variant="primary">กลับหน้าที่เปิดได้</LinkButton>}
      />
      <Card>
        <ForbiddenState
          message={`${location.pathname} ไม่อยู่ในเมนูของ${roleLabels[membership.role]}`}
          hint="เมนูด้านซ้ายแสดงเฉพาะหน้าที่บัญชีของคุณเปิดได้ · หากต้องใช้หน้านี้จริง ให้ติดต่อแอดมินโรงเรียนเพื่อตรวจสอบบทบาทของบัญชี"
        />
      </Card>
    </>
  );
}
