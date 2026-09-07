import { useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Icon } from '../../ui/Icon';
import { SearchInput } from '../../ui/components';
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
 *
 * Opening it is where the map stopped helping. A teacher has twenty-five destinations here and an
 * administrator twenty-six, so "the day they need the one screen" meant reading eight headings and
 * two dozen tiles to find it — which is slower than the sidebar it was meant to shortcut. The filter
 * is the fix: type two letters and the map becomes the one row you were looking for.
 */
export function ShortcutHub({ role }: { role: Role }) {
  const groups = useMemo(
    () => navigationByRole[role].filter((group) => group.items.length > 0),
    [role]
  );
  const total = useMemo(
    () => groups.reduce((count, group) => count + group.items.length, 0),
    [groups]
  );
  const [query, setQuery] = useState('');

  /*
   * The group label matches too, so somebody who remembers "it was under การเรียนการสอน" gets that
   * whole section back rather than nothing. Empty groups drop out instead of standing as headings
   * over nothing, and the grouping itself survives filtering — it is how these screens are
   * remembered, and a flat list of results would throw that away at exactly the moment it helps.
   */
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle === '') return groups;
    return groups
      .map((group) => group.label.toLowerCase().includes(needle)
        ? group
        : { ...group, items: group.items.filter((item) => item.label.toLowerCase().includes(needle)) })
      .filter((group) => group.items.length > 0);
  }, [groups, query]);

  const matches = shown.reduce((count, group) => count + group.items.length, 0);

  return (
    <details className="shortcut-hub">
      <summary>
        {/* h1 is the page title and h2 is what every card beside this one uses, so the hub is an h2
            and its groups are h3 — no level is skipped on the way down. */}
        <h2 className="shortcut-hub-title">ทางลัดทุกเมนู</h2>
        <span className="shortcut-hub-hint">ทุกหน้าที่คุณเข้าถึงได้ {total} เมนู</span>
        <Icon name="chevron-down" size={18} className="shortcut-hub-chevron" />
      </summary>
      <div className="shortcut-hub-body">
        {/* Named for the hub, not for the menu. The sidebar carries its own "ค้นหาเมนู" field, and
            two controls answering to one name on the same page is a coin toss for anybody choosing
            between them by name — a screen reader user, or a test. */}
        <SearchInput
          value={query}
          onChange={setQuery}
          label="ค้นหาทางลัด"
          placeholder="พิมพ์ชื่อเมนูเพื่อค้นหา"
          className="shortcut-hub-search"
        />
        {shown.length === 0 ? (
          /* A dead end explains itself and offers the way out, rather than leaving a blank panel
             that reads as the hub having broken. */
          <p className="shortcut-hub-empty" role="status">
            ไม่พบทางลัดที่ตรงกับ “{query.trim()}” · ลองพิมพ์สั้นลง หรือล้างช่องค้นหาเพื่อดูทั้งหมด
          </p>
        ) : (
          <>
            {query.trim() !== '' && (
              <p className="shortcut-hub-count" role="status">พบ {matches} เมนู</p>
            )}
            {shown.map((group) => (
              <section key={group.key}>
                <h3>{group.label}</h3>
                <div className="shortcut-hub-grid">
                  {group.items.map((item) => (
                    <NavLink key={item.to} to={item.to} end={item.to === '/'}>
                      <Icon name={item.icon} size={18} />
                      <span>{item.label}</span>
                    </NavLink>
                  ))}
                </div>
              </section>
            ))}
          </>
        )}
      </div>
    </details>
  );
}
