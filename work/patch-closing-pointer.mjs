import { patch } from './patchlib.mjs';
const file = 'apps/web/src/design-system/components.css';

patch(file, [
  [
    `.ui-modal-backdrop.is-closing { animation: ui-fade-out 150ms var(--ease-out) both; }`,
    `/* A panel on its way out still occupies the page for the length of its exit, and a click that
   lands on a button inside it in that time does something the person did not ask for. Nothing that
   is leaving accepts a pointer. */
.ui-modal-backdrop.is-closing { animation: ui-fade-out 150ms var(--ease-out) both; pointer-events: none; }`
  ],
  [
    `.ui-modal.is-closing { animation: ui-pop-out 160ms var(--ease-overlay) both; }`,
    `.ui-modal.is-closing { animation: ui-pop-out 160ms var(--ease-overlay) both; pointer-events: none; }`
  ],
  [
    `.ui-drawer.is-closing { animation: ui-drawer-out 190ms var(--ease-overlay) both; }
.ui-drawer-backdrop.is-closing { animation: ui-fade-out 190ms var(--ease-out) both; }`,
    `.ui-drawer.is-closing { animation: ui-drawer-out 190ms var(--ease-overlay) both; pointer-events: none; }
.ui-drawer-backdrop.is-closing { animation: ui-fade-out 190ms var(--ease-out) both; pointer-events: none; }`
  ]
]);
console.log('nothing that is leaving accepts a click');
