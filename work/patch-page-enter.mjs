import { patch } from './patchlib.mjs';
const file = 'apps/web/src/design-system/global.css';

const old = `.page-content > * { animation:page-enter var(--duration-page) var(--ease-emphasized) both; }
.page-content > *:nth-child(2) { animation-delay:50ms; }
.page-content > *:nth-child(3) { animation-delay:100ms; }
.page-content > *:nth-child(4) { animation-delay:150ms; }
.page-content > *:nth-child(5) { animation-delay:180ms; }
@keyframes page-enter { from { opacity:0; transform:translateY(12px); filter:blur(2px); } to { opacity:1; transform:none; filter:blur(0); } }`;

const neu = `/*
 * The page arriving, one band after another.
 *
 * ── Why the blur went ──
 * This animated \`filter: blur(2px)\` to zero on every direct child of every screen. A blur is not a
 * composited property: the browser rasterises the element and re-blurs it on each of the twenty or
 * so frames, for each of the five bands, on every navigation. It was the most expensive thing in
 * the interface and it bought a softness nobody could name afterwards. What is left is transform
 * and opacity, which the compositor does on its own thread and which cost the same whether one
 * element is moving or fifty.
 *
 * ── Why it is quicker, and staggered more finely ──
 * 320ms is a page transition's budget for the whole page, not for each band inside it; with a
 * 180ms stagger on top the last card finished half a second after the click. 240ms with 45ms
 * between bands puts the last one under 0.42s, and the shorter step is what makes it read as one
 * page settling rather than as five things arriving separately.
 */
.page-content > * { animation:page-enter 240ms var(--ease-emphasized) both; }
.page-content > *:nth-child(2) { animation-delay:45ms; }
.page-content > *:nth-child(3) { animation-delay:90ms; }
.page-content > *:nth-child(4) { animation-delay:130ms; }
.page-content > *:nth-child(5) { animation-delay:160ms; }
/* Everything past the fifth band shares the last delay: a stagger that keeps counting turns a long
   screen into a wave, and the tenth card would arrive after the reader had got there. */
.page-content > *:nth-child(n+6) { animation-delay:180ms; }
@keyframes page-enter { from { opacity:0; transform:translateY(10px) scale(.995); } to { opacity:1; transform:none; } }`;

patch(file, [[old, neu]]);
console.log('page bands arrive on transform and opacity alone');
