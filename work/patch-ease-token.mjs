import { patch } from './patchlib.mjs';
const file = 'apps/web/src/design-system/tokens.css';

const old = `  --ease-out:cubic-bezier(.22,.61,.36,1); --ease-emphasized:cubic-bezier(.16,1,.3,1); --ease-spring:cubic-bezier(.34,1.56,.64,1);`;
const neu = `  --ease-out:cubic-bezier(.22,.61,.36,1); --ease-emphasized:cubic-bezier(.16,1,.3,1); --ease-spring:cubic-bezier(.34,1.56,.64,1);
  /*
   * The curve anything covering the page moves on: a dialog, a drawer, a sheet.
   *
   * It leaves at once and decelerates for the whole of the rest of its travel, with no return past
   * the target. That combination is why a sheet dragged by this curve feels attached to the finger
   * that opened it, and it is the reason overlays here do not use --ease-spring: a bounce is
   * charming on a toast, which is small and uninvited, and unserious on the dialog asking whether
   * to delete a room.
   */
  --ease-overlay:cubic-bezier(.32,.72,0,1);`;

patch(file, [[old, neu]]);
console.log('overlay curve named once');
