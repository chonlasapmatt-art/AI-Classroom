import { patch } from './patchlib.mjs';
patch('apps/web/src/features/dashboard/ShortcutHub.tsx', [[
  `    () => navigationByRole[role].filter((group) => group.items.length > 0),`,
  `    // A hidden destination is reached from a screen rather than from a menu -- the register, which
    // is a button on the room card -- so it is not a shortcut either. It stays in navigationByRole
    // because that list is also what grants the route.
    () => navigationByRole[role]
      .map((group) => ({ ...group, items: group.items.filter((item) => !item.hidden) }))
      .filter((group) => group.items.length > 0),`
]]);

patch('apps/web/tests/integration/roleNavigation.test.tsx', [[
  `    fireEvent.change(await screen.findByLabelText('ค้นหาเมนู'), { target: { value: 'เช็กชื่อ' } });`,
  `    fireEvent.change(await screen.findByLabelText('ค้นหาเมนู'), { target: { value: 'ห้องเรียน' } });`
]]);
console.log('hub skips hidden destinations');
