import { patch } from './patchlib.mjs';
const file = 'apps/web/src/design-system/screens.css';

/* ── The panel ── */
patch(file, [
  [
    `.whats-new {
  pointer-events: auto;
  inline-size: min(560px, 100%);
  max-block-size: min(74vh, 680px); overflow: auto;
  display: grid; gap: var(--space-3);
  padding: var(--space-5);`,
    `.whats-new {
  pointer-events: auto;
  inline-size: min(560px, 100%);
  max-block-size: min(74vh, 680px); overflow: auto;
  display: grid; gap: var(--space-4);
  padding: var(--space-5);`
  ],
  [
    `.whats-new-eyebrow {
  color: var(--color-primary); font-size: var(--text-xs);
  font-weight: var(--weight-heavy); letter-spacing: .08em;
}
.whats-new-head strong { font-size: var(--text-md); color: var(--color-text-primary); }`,
    `/*
 * Thai does not take letter-spacing.
 *
 * The eyebrow carried .08em, which is the treatment small capitals want in Latin and damage in
 * Thai: a syllable here is a consonant with its vowel and tone marks hung above and below it, and
 * tracking pulls those clusters apart until each mark reads as floating between two letters rather
 * than belonging to one. The line is set apart by colour, weight and size instead, which is what
 * was wanted from it.
 */
.whats-new-eyebrow {
  color: var(--color-primary); font-size: var(--text-xs);
  font-weight: var(--weight-heavy); letter-spacing: 0;
  font-variant-numeric: tabular-nums;
}
/*
 * The headline gets the size, and less leading rather than more.
 *
 * Display text needs tighter leading than body text — the eye travels a short line and the gap that
 * keeps paragraphs readable makes a two-line headline read as two separate sentences.
 */
.whats-new-head strong {
  font-size: var(--text-lg); line-height: 1.35;
  color: var(--color-text-primary); text-wrap: balance;
}`
  ],
  [
    `.whats-new-list li, .release-change-list li {
  display: flex; align-items: flex-start; gap: var(--space-2);
  font-size: var(--text-sm); color: var(--color-text-secondary); line-height: 1.5;
}`,
    `/*
 * 1.75, because the script stacks.
 *
 * 1.5 is the right leading for Latin body text and too tight for Thai, which hangs vowels above a
 * consonant and tone marks above those — three levels on a single line. At 1.5 the marks of one
 * line sit against the descenders of the line above, and a paragraph of it reads as a grey mass
 * rather than as lines. This is the one number in the file that most changes how much of a notice
 * somebody actually reads.
 */
.whats-new-list li, .release-change-list li {
  display: flex; align-items: flex-start; gap: var(--space-3);
  font-size: var(--text-sm); color: var(--color-text-secondary); line-height: 1.75;
}`
  ],
  [
    `  border-radius: 999px; text-align: center;
  font-size: var(--text-xs); font-weight: var(--weight-heavy); letter-spacing: .02em;
  color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 14%, transparent);`,
    `  border-radius: 999px; text-align: center;
  /* No tracking, for the same reason as the eyebrow: these are Thai words, not Latin small caps.
     The pill is offset from the text it labels by ground and colour, which is enough. */
  font-size: var(--text-xs); font-weight: var(--weight-strong); letter-spacing: 0;
  line-height: 1.7;
  color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 14%, transparent);`
  ],
  [
    `.whats-new-foot { display: grid; gap: var(--space-2); }
.whats-new-foot > span:first-child { color: var(--color-text-muted); font-size: var(--text-xs); }`,
    `.whats-new-foot {
  display: grid; gap: var(--space-2);
  padding-block-start: var(--space-3);
  /* A hairline instead of another gap: the footer is a different kind of sentence from the list
     above it, and equal spacing everywhere is what made the panel read as one undifferentiated
     column. */
  border-block-start: 1px solid var(--color-border);
}
.whats-new-foot > span:first-child {
  color: var(--color-text-muted); font-size: var(--text-xs); line-height: 1.65;
  /* The countdown counts down, and proportional digits make the whole sentence twitch each second. */
  font-variant-numeric: tabular-nums;
}

/* "ดูอีก N รายการ" — the way out of a four-line summary, and the thing that stops the clock. */
.whats-new-more {
  justify-self: start;
  min-block-size: 44px; padding: 0 var(--space-4);
  border: 1px solid color-mix(in srgb, var(--color-primary) 32%, var(--color-border));
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-primary) 8%, transparent);
  color: var(--color-primary); font: inherit; font-size: var(--text-sm);
  font-weight: var(--weight-strong); cursor: pointer;
  transition: background var(--duration-fast) var(--ease-out), border-color var(--duration-fast) var(--ease-out);
}
.whats-new-more:hover { background: color-mix(in srgb, var(--color-primary) 16%, transparent); }
.whats-new-more:focus-visible { outline: none; box-shadow: var(--focus-ring); }`
  ]
]);
console.log('typography: no tracking on Thai, leading that fits the script, a real rhythm');
