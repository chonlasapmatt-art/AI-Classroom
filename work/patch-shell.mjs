import { patch } from './patchlib.mjs';
patch('apps/web/src/layouts/AppShell.tsx', [[
  `    const groups: NavGroup[] = navigationByRole[membership.role]
      .map((group) => ({ ...group, items: group.items.filter((item) => advisor || !isAdvisorOnlyRoute(item.to)) }));`,
  `    const groups: NavGroup[] = navigationByRole[membership.role]
      // A hidden destination is one the role holds and reaches from a screen rather than from here:
      // the register, which is two buttons on the room card. It stays in the list because the list
      // is also what grants the route; it simply is not offered as a menu row.
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => !item.hidden && (advisor || !isAdvisorOnlyRoute(item.to)))
      }));`
]]);
console.log('hidden rows kept out of the rendered menu');
