import { patch } from './patchlib.mjs';
patch('apps/web/src/design-system/screens.css', [[
  `.whats-new-close {
  margin-inline-start: auto; flex: none;
  min-block-size: 44px; min-inline-size: 44px; padding: 0 var(--space-3);
  border: 1px solid var(--color-border); border-radius: var(--radius-md);
  background: var(--color-surface-muted, transparent);
  color: var(--color-text-secondary); font: inherit; cursor: pointer;
  transition: background var(--duration-fast) var(--ease-out), color var(--duration-fast) var(--ease-out);
}
.whats-new-close:hover { background: color-mix(in srgb, var(--color-primary) 10%, transparent); color: var(--color-text-primary); }`,
  `/*
 * Quiet until it is wanted.
 *
 * It was a bordered box on a filled ground, sitting at the top right at roughly the weight of the
 * headline beside it — so the loudest thing on a panel about what changed was the way out of it.
 * The target stays 44×44, because it is meant to be hit on a phone; what goes is the border and the
 * fill, which return on hover and focus. Dismissal is always available and never the point.
 */
.whats-new-close {
  margin-inline-start: auto; flex: none;
  display: grid; place-items: center;
  min-block-size: 44px; min-inline-size: 44px; padding: 0 var(--space-3);
  border: 1px solid transparent; border-radius: var(--radius-md);
  background: transparent;
  color: var(--color-text-muted); font: inherit; font-size: var(--text-sm); cursor: pointer;
  transition:
    background var(--duration-fast) var(--ease-out),
    border-color var(--duration-fast) var(--ease-out),
    color var(--duration-fast) var(--ease-out);
}
.whats-new-close:hover {
  border-color: var(--color-border);
  background: color-mix(in srgb, var(--color-primary) 10%, transparent);
  color: var(--color-text-primary);
}
.whats-new-close:focus-visible { outline: none; box-shadow: var(--focus-ring); color: var(--color-text-primary); }`
]]);
console.log('close button steps back');
