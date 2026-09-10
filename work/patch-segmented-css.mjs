import { patch } from './patchlib.mjs';
const file = 'apps/web/src/design-system/components.css';

const old = `.ui-segmented { display: inline-flex; flex-wrap: wrap; padding: 4px; border-radius: var(--radius-lg); background: var(--surface-sunken); gap: 2px; max-width: 100%; }`;
const neu = `.ui-segmented { position: relative; display: inline-flex; flex-wrap: wrap; padding: 4px; border-radius: var(--radius-lg); background: var(--surface-sunken); gap: 2px; max-width: 100%; }
/*
 * The selection, as one pill that moves rather than a background that blinks.
 *
 * It travels on transform, which the compositor handles on its own thread. Width and height are
 * transitioned too, because the buttons are text-sized and no two are the same width -- but this
 * element is absolutely positioned and childless, so those touch its own box and nothing else's.
 * Scaling a fixed pill instead would have kept the transition purely composited and stretched its
 * corner radius into an ellipse on the way, which is worse than the thing being fixed.
 */
.ui-segmented-pill {
  position: absolute; top: 0; left: 0; z-index: 0; pointer-events: none;
  border-radius: calc(var(--radius-lg) - 4px);
  background: var(--surface); box-shadow: var(--shadow-xs);
  transition:
    transform var(--duration-normal) var(--ease-emphasized),
    width var(--duration-normal) var(--ease-emphasized),
    height var(--duration-normal) var(--ease-emphasized);
}
/* The buttons sit over the pill, and the selected one no longer paints a background of its own. */
.ui-segmented button { position: relative; z-index: 1; }`;

const selectedOld = `.ui-segmented button.selected { background: var(--surface); color: var(--ink-900); box-shadow: var(--shadow-xs); }`;
const selectedNew = `.ui-segmented button.selected { background: transparent; color: var(--ink-900); box-shadow: none; }
/* Before the pill has been measured -- the first paint, and any browser without ResizeObserver --
   the selected button paints its own background, so the control is never left with no selection
   visible at all. */
.ui-segmented:not(:has(.ui-segmented-pill)) button.selected { background: var(--surface); box-shadow: var(--shadow-xs); }`;

patch(file, [[old, neu], [selectedOld, selectedNew]]);
console.log('pill styled');
