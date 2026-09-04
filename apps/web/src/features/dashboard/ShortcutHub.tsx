import { NavLink } from 'react-router-dom';
import { Icon } from '../../ui/Icon';
import { navigationByRole } from '../../layouts/navigation';
import type { Role } from '../../domain/types';

/**
 * Every screen this role has, on the screen they start from.
 *
 * The quick actions above it are the three or four things this person does most; this is the rest of
 * the product, laid out the way their menu is, for the day they need the one screen they open twice
 * a term. It reads the same source as the menu, so a destination cannot exist in one and not the
 * other.
 *
 * It is a `<details>` on purpose. Open, it is a map; closed, it is one line — and the choice belongs
 * to the person looking at it rather than to a breakpoint. The dashboard above it stays the answer
 * to "what needs me today", which is what would be lost if twenty tiles were pinned to the top of it.
 */
export function ShortcutHub({ role }: { role: Role }) {
  const groups = navigationByRole[role].filter((group) => group.items.length > 0);

  return (
    <details className="shortcut-hub">
      <summary>
        <span className="shortcut-hub-title">ทางลัดทุกเมนู</span>
        <span className="shortcut-hub-hint">เปิดดูทุกหน้าที่คุณเข้าถึงได้</span>
      </summary>
      <div className="shortcut-hub-body">
        {groups.map((group) => (
          <section key={group.key}>
            <h3>{group.label}</h3>
            <div className="shortcut-hub-grid">
              {group.items.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.to === '/'} title={item.label}>
                  <Icon name={item.icon} size={18} />
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </div>
          </section>
        ))}
      </div>
    </details>
  );
}
