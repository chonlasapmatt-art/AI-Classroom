import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSession } from '../../app/SessionContext';
import { Button, Card, CardHeader, EmptyState, PageHeader } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { ClassroomToolsHub } from './ClassroomToolsHub';

/**
 * The address behind the menu entry, which opens the hub and is otherwise almost nothing.
 *
 * A page rather than a menu item that opens a dialog in place: the entry has to be linkable — from
 * the board, from a room card, from a note a head of year sends round — and a dialog with no address
 * cannot be linked to. Closing the hub leaves this behind, which is why it says what it is and how
 * to open it again rather than being an empty screen.
 */
export function ClassroomToolsPage() {
  const { membership } = useSession();
  const [searchParams] = useSearchParams();
  const [open, setOpen] = useState(true);
  const isStaff = membership.role === 'admin' || membership.role === 'teacher';

  if (!isStaff) {
    return (
      <EmptyState
        icon={<Icon name="dice" size={28} />}
        title="กิจกรรมหน้าชั้นเปิดให้ครูและผู้ดูแล"
        description="นักเรียนเข้าร่วมกิจกรรมได้จากหน้าจอที่ครูเปิดให้ในคาบเรียน"
      />
    );
  }

  return (
    <>
      <PageHeader
        title="เกมและกิจกรรมหน้าชั้นเรียน"
        description="ศูนย์รวมเครื่องมือช่วยสอนที่ใช้หน้าชั้น — สุ่มชื่อ แบ่งกลุ่ม ตอบคำถาม และให้ดาว"
      />
      <Card>
        <CardHeader
          title="เลือกกิจกรรม"
          description="เลือกเครื่องมือที่ต้องการเพื่อสร้างความสนุกสนานและการมีส่วนร่วมในห้องเรียน"
        />
        <Button variant="primary" icon={<Icon name="dice" size={16} />} onClick={() => setOpen(true)}>
          เปิดศูนย์รวมกิจกรรม
        </Button>
      </Card>

      {open && (
        <ClassroomToolsHub
          onClose={() => setOpen(false)}
          {...(searchParams.get('class') ? { initialClassId: searchParams.get('class')! } : {})}
        />
      )}
    </>
  );
}
