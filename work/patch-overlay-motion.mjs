import { patch } from './patchlib.mjs';
const file = 'apps/web/src/design-system/components.css';

/* ── The scrim ── */
const backdropOld = `.ui-modal-backdrop {
  position: fixed; inset: 0; z-index: 80; display: grid; place-items: center; padding: var(--space-5);
  background: var(--overlay); backdrop-filter: blur(4px) saturate(1.2); overflow: auto;
  animation: ui-fade var(--duration-normal) var(--ease-out);
}
@keyframes ui-fade { from { opacity: 0; } to { opacity: 1; } }`;

const backdropNew = `.ui-modal-backdrop {
  position: fixed; inset: 0; z-index: 80; display: grid; place-items: center; padding: var(--space-5);
  background: var(--overlay); backdrop-filter: blur(4px) saturate(1.2); overflow: auto;
  animation: ui-fade var(--duration-normal) var(--ease-out);
}
/*
 * Leaving faster than arriving.
 *
 * The rule everywhere in this file: an entrance is shown to somebody who has not seen the thing
 * yet, so it can afford to be watched; an exit is shown to somebody who has already decided to be
 * rid of it, so it must get out of the way. Roughly three-quarters of the entrance is the ratio
 * that reads as responsive without reading as a cut.
 */
.ui-modal-backdrop.is-closing { animation: ui-fade-out 150ms var(--ease-out) both; }
@keyframes ui-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes ui-fade-out { to { opacity: 0; } }`;

/* ── The panel ── */
const modalOld = `  animation: ui-pop var(--duration-slow) var(--ease-spring) both;
}`;
const modalNew = `  /*
   * 220ms on the overlay curve, and no overshoot.
   *
   * It ran for 420ms on --ease-spring, whose control points pass 1 before settling: every dialog in
   * the product arrived with a small bounce and took the better part of half a second to do it. On
   * a confirmation asking whether to delete a room that reads as unserious, and on the fifth dialog
   * of a working morning it reads as slow. The curve is the one the sheet libraries settled on --
   * a long, flat deceleration with no return -- and the duration is inside the 200-300ms band a
   * dialog belongs in.
   */
  animation: ui-pop 220ms var(--ease-overlay) both;
}
.ui-modal.is-closing { animation: ui-pop-out 160ms var(--ease-overlay) both; }
@keyframes ui-pop-out { to { opacity: 0; transform: translateY(6px) scale(.99); } }`;

/* ── The toast ── */
const toastOld = `  animation: ui-toast-in var(--duration-slow) var(--ease-spring) both;
  transition: opacity var(--duration-normal) var(--ease-out), transform var(--duration-normal) var(--ease-out);`;
const toastNew = `  /* A toast keeps its spring: it is small, it arrives uninvited, and a little life is how it earns
     the glance. 260ms rather than 420ms, because it is also the thing most often seen twice. */
  animation: ui-toast-in 260ms var(--ease-spring) both;
  transition: opacity 150ms var(--ease-out), transform 150ms var(--ease-out);`;

/* ── The drawer ── */
const drawerOld = `  animation: ui-drawer-in var(--duration-slow) var(--ease-emphasized) both;
}`;
const drawerNew = `  animation: ui-drawer-in 280ms var(--ease-overlay) both;
}
/* Back out through the edge it came in by, which is the only exit a side panel can have that does
   not look like it fell over. */
.ui-drawer.is-closing { animation: ui-drawer-out 190ms var(--ease-overlay) both; }
.ui-drawer-backdrop.is-closing { animation: ui-fade-out 190ms var(--ease-out) both; }
@keyframes ui-drawer-out { to { transform: translateX(100%); } }`;

patch(file, [[backdropOld, backdropNew], [modalOld, modalNew], [toastOld, toastNew], [drawerOld, drawerNew]]);
console.log('overlays enter and leave, faster and without the wobble');
