import { useLocation } from 'react-router-dom';
import { useSession } from '../../app/SessionContext';
import { Button, Card, EmptyState, LinkButton, PageHeader } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { navigationByRole } from '../../layouts/navigation';

/**
 * An address that names nothing.
 *
 * Before this, an unknown path was redirected to the dashboard without a word, so a stale bookmark,
 * a typo and a link from a message that had been edited all looked identical: the app simply
 * ignored where somebody meant to go. Saying which address failed is the difference between a
 * person fixing their own link and one reporting that the app "keeps sending me home".
 *
 * The suggestions are this role's own menu, so the way out is a place they can actually open.
 */
export function NotFoundPage() {
  const location = useLocation();
  const { membership } = useSession();
  const suggestions = navigationByRole[membership.role]
    .flatMap((group) => group.items)
    .filter((item) => item.to !== '/')
    .slice(0, 6);

  return (
    <>
      <PageHeader
        eyebrow="ไม่พบหน้า"
        title="ไม่พบหน้าที่คุณเปิด"
        description="ลิงก์อาจถูกย้าย พิมพ์ผิด หรือเป็นของบัญชีคนละบทบาท"
        action={<LinkButton to="/" variant="primary">กลับหน้าภาพรวม</LinkButton>}
      />
      <Card>
        <EmptyState
          icon={<Icon name="search" size={28} />}
          title={`ไม่มีหน้า ${location.pathname} ในระบบ`}
          description="ลองกลับหน้าภาพรวม หรือเลือกเมนูด้านล่างที่บัญชีของคุณเปิดได้"
          action={<Button variant="secondary" onClick={() => window.history.back()}>ย้อนกลับหน้าก่อนหน้า</Button>}
        />
        {suggestions.length > 0 && (
          <nav className="not-found-suggestions" aria-label="เมนูที่คุณเปิดได้">
            {suggestions.map((item) => (
              <LinkButton key={item.to} to={item.to} size="sm" variant="ghost">{item.label}</LinkButton>
            ))}
          </nav>
        )}
      </Card>
    </>
  );
}
