import { patch } from './patchlib.mjs';
const file = 'apps/web/src/design-system/tokens.css';

/*
 * The dark theme, rebuilt around two things it did not have: a ladder and a neutral.
 *
 * ── A ladder ──
 * The four grounds were #131126, #161331, #1b1834 and #201d3d. That is the whole elevation
 * vocabulary of the app inside four percent of luminance, so a card did not sit on the page, a well
 * did not sink into the card, and a table head did not lift off the rows. What separation there was
 * came from a black drop shadow, which is the one trick that does nothing on a dark ground -- there
 * is no light behind the object to occlude. The new grounds step far enough apart to be seen, and
 * elevation is carried by the surface itself plus a hairline rather than by shadow.
 *
 * ── A neutral ──
 * Every one of those greys was violet: hue 250 at eight to twelve percent saturation, baked in as a
 * literal. A school that picked the ocean preset got a violet application with blue buttons, which
 * is the one thing the brand ramp above goes to some trouble to avoid. The grounds are now close to
 * neutral with a trace of the same cool cast, so the brand is the only strongly coloured thing on
 * the page -- which is what makes a brand read as one.
 *
 * ── The ink ──
 * --ink-500 was #a49fc6 and --ink-400 was #a29bc6: two steps of a seven-step ramp separated by two
 * points of red. Secondary text and hint text were the same colour, so the hierarchy a designer had
 * written into the markup did not survive being drawn. Each step now moves, and every step down to
 * --ink-400 clears 4.5:1 on the card it is drawn on, which the suite measures rather than trusts.
 */
const oldGround = `    --canvas:#131126; --surface:#1b1834; --surface-muted:#201d3d; --surface-sunken:#161331;
    --line:#2c2850; --line-strong:#3b3668;
    --ink-900:#f4f2ff; --ink-800:#e6e3f7; --ink-700:#d3cfec; --ink-600:#b8b3d8; --ink-500:#a49fc6;
    --ink-400:#a29bc6; --ink-300:#7d7799;`;

const newGround = `    --canvas:#0f0e18; --surface:#1c1b28; --surface-muted:#23222f; --surface-sunken:#15141f;
    --line:#302f40; --line-strong:#43415a;
    --ink-900:#f7f7fb; --ink-800:#e6e6f0; --ink-700:#d0d0e0; --ink-600:#b0b0c6; --ink-500:#9898b0;
    --ink-400:#8a8aa2; --ink-300:#6f6f88;`;

const oldGroundToggle = `  --canvas:#131126; --surface:#1b1834; --surface-muted:#201d3d; --surface-sunken:#161331;
  --line:#2c2850; --line-strong:#3b3668;
  --ink-900:#f4f2ff; --ink-800:#e6e3f7; --ink-700:#d3cfec; --ink-600:#b8b3d8; --ink-500:#a49fc6;
  --ink-400:#a29bc6; --ink-300:#7d7799;`;

const newGroundToggle = `  --canvas:#0f0e18; --surface:#1c1b28; --surface-muted:#23222f; --surface-sunken:#15141f;
  --line:#302f40; --line-strong:#43415a;
  --ink-900:#f7f7fb; --ink-800:#e6e6f0; --ink-700:#d0d0e0; --ink-600:#b0b0c6; --ink-500:#9898b0;
  --ink-400:#8a8aa2; --ink-300:#6f6f88;`;

const oldChrome = `    --nav-surface:#100d24; --topbar-surface:#1b1834e6;
    --inverse-surface:#e9e6ff; --inverse-ink:#1b1834;
    --overlay:#05030fcc;
    --shadow-xs:0 1px 2px rgba(0,0,0,.4); --shadow-sm:0 2px 8px rgba(0,0,0,.45);
    --shadow-md:0 12px 30px rgba(0,0,0,.5); --shadow-lg:0 24px 60px rgba(0,0,0,.55);`;

const newChrome = `    --nav-surface:#0a0912; --topbar-surface:#1c1b28e6;
    --inverse-surface:#f0f0f7; --inverse-ink:#15141f;
    --overlay:#04040acc;
    /* On a dark ground a drop shadow occludes nothing, so elevation is a hairline of light along
       the top edge and a softer, wider shadow underneath than the light theme needs. */
    --shadow-xs:inset 0 1px 0 rgba(255,255,255,.05), 0 1px 2px rgba(0,0,0,.5);
    --shadow-sm:inset 0 1px 0 rgba(255,255,255,.05), 0 2px 10px rgba(0,0,0,.5);
    --shadow-md:inset 0 1px 0 rgba(255,255,255,.06), 0 14px 34px rgba(0,0,0,.55);
    --shadow-lg:inset 0 1px 0 rgba(255,255,255,.07), 0 28px 68px rgba(0,0,0,.6);`;

const oldChromeToggle = `  --nav-surface:#100d24; --topbar-surface:#1b1834e6;
  --inverse-surface:#e9e6ff; --inverse-ink:#1b1834;
  --overlay:#05030fcc;
  --shadow-xs:0 1px 2px rgba(0,0,0,.4); --shadow-sm:0 2px 8px rgba(0,0,0,.45);
  --shadow-md:0 12px 30px rgba(0,0,0,.5); --shadow-lg:0 24px 60px rgba(0,0,0,.55);`;

const newChromeToggle = `  --nav-surface:#0a0912; --topbar-surface:#1c1b28e6;
  --inverse-surface:#f0f0f7; --inverse-ink:#15141f;
  --overlay:#04040acc;
  /* On a dark ground a drop shadow occludes nothing, so elevation is a hairline of light along
     the top edge and a softer, wider shadow underneath than the light theme needs. */
  --shadow-xs:inset 0 1px 0 rgba(255,255,255,.05), 0 1px 2px rgba(0,0,0,.5);
  --shadow-sm:inset 0 1px 0 rgba(255,255,255,.05), 0 2px 10px rgba(0,0,0,.5);
  --shadow-md:inset 0 1px 0 rgba(255,255,255,.06), 0 14px 34px rgba(0,0,0,.55);
  --shadow-lg:inset 0 1px 0 rgba(255,255,255,.07), 0 28px 68px rgba(0,0,0,.6);`;

const oldHover = `@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { --surface-hover:#242040; --surface-glass:#1b1834e6; }
}
:root[data-theme="dark"] { --surface-hover:#242040; --surface-glass:#1b1834e6; }`;

const newHover = `@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { --surface-hover:#2b2a3a; --surface-glass:#1c1b28e6; }
}
:root[data-theme="dark"] { --surface-hover:#2b2a3a; --surface-glass:#1c1b28e6; }`;

patch(file, [
  [oldGround, newGround], [oldGroundToggle, newGroundToggle],
  [oldChrome, newChrome], [oldChromeToggle, newChromeToggle],
  [oldHover, newHover]
]);
console.log('dark theme rebuilt: a visible ladder, a near-neutral ground, an ink ramp that steps');
