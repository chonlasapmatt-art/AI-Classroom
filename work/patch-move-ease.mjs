import { patch } from './patchlib.mjs';

patch('apps/web/src/design-system/tokens.css', [[
  `  --ease-overlay:cubic-bezier(.32,.72,0,1);`,
  `  --ease-overlay:cubic-bezier(.32,.72,0,1);
  /*
   * The curve for something crossing the screen from one place to another: a selection pill, a tab
   * marker, a row changing position.
   *
   * Symmetrical — it accelerates away and decelerates in — because that is what reads as travel. A
   * decelerate-only curve is right for something arriving from nowhere and wrong here: --ease-
   * emphasized put the segmented pill 95% of the way across in its first 60ms, so it appeared to
   * jump and then creep, which is the worst of both and measurably what it did.
   */
  --ease-move:cubic-bezier(.4,0,.2,1);`
]]);

patch('apps/web/src/design-system/components.css', [[
  `  transition:
    transform var(--duration-normal) var(--ease-emphasized),
    width var(--duration-normal) var(--ease-emphasized),
    height var(--duration-normal) var(--ease-emphasized);`,
  `  transition:
    transform 240ms var(--ease-move),
    width 240ms var(--ease-move),
    height 240ms var(--ease-move);`
]]);
console.log('the pill travels rather than jumping and creeping');
