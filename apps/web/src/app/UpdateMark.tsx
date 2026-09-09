import type { UpdateKind } from './appUpdate';

/**
 * The emblem on the update prompt, drawn rather than borrowed.
 *
 * The prompt was using two icons out of the interface set — a tick and the sync arrows — at 22px in
 * a 46px frame. They are the right glyphs for a table row or a toolbar and the wrong ones here: this
 * card appears perhaps once a fortnight, is the only thing on screen asking to interrupt a lesson,
 * and had the visual weight of a list icon. It is the one place in the app that should look drawn.
 *
 * So each kind gets its own chunky, flat-filled emblem in the same register as the product's mark:
 *
 *   * a version update is an arrow rising off a plate with two sparks — something arriving, lifting
 *     the app up;
 *   * a patch is a plaster laid across the same optical box — a small repair, and nothing more.
 *
 * The shapes carry the difference, not the colour: the two are told apart at a glance with the
 * screen in greyscale, which is what the eyebrow above them says in words as well.
 *
 * Everything is painted from `--update-accent`, the same custom property the card's band and its
 * border already follow, so the emblem tracks the school's brand colour through all eight themes
 * and both modes without a second palette to keep in step. The lighter tone is mixed with the card's
 * own surface rather than with white, which is what keeps it a highlight in dark mode instead of a
 * bright patch. The mark is decorative — the heading beside it says everything it says — so it is
 * hidden from the accessibility tree.
 */
export function UpdateMark({ kind, size = 40 }: { kind: UpdateKind; size?: number }) {
  // Mixed against the card, not against white: on a dark surface the "lighter" tone has to get
  // darker, or the highlight becomes the brightest thing on the screen.
  const accent = 'var(--update-accent)';
  const light = 'color-mix(in srgb, var(--update-accent) 42%, var(--color-surface))';
  // The sparks sit on the tinted tile rather than on the card, so they need to be nearer the accent
  // than the plate is or they disappear into their own background.
  const spark = 'color-mix(in srgb, var(--update-accent) 72%, var(--color-surface))';
  const gloss = 'color-mix(in srgb, var(--color-surface) 62%, transparent)';

  return (
    <svg
      className="update-glyph"
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      role="presentation"
      aria-hidden="true"
      focusable="false"
    >
      {kind === 'patch' ? (
        <g transform="rotate(-38 20 20)">
          {/* The plaster: one rounded strip, with the pad picked out darker and three holes in it
              punched in the card's own colour so they read as holes rather than as dots. */}
          <rect x="5.6" y="15.4" width="28.8" height="9.2" rx="4.6" fill={light} />
          <rect x="14.4" y="15.4" width="11.2" height="9.2" rx="2.6" fill={accent} />
          <circle cx="17.6" cy="18.4" r="1.05" fill="var(--color-surface)" />
          <circle cx="22.4" cy="18.4" r="1.05" fill="var(--color-surface)" />
          <circle cx="20" cy="21.8" r="1.05" fill="var(--color-surface)" />
          {/* A single highlight along the top edge, which is what makes a flat shape look moulded. */}
          <rect x="8.2" y="16.8" width="8.4" height="1.8" rx=".9" fill={gloss} />
        </g>
      ) : (
        <>
          {/* The plate the new version lands on, narrower than the arrow is tall so the arrow stays
              the subject and the plate stays the ground. */}
          <rect x="9.2" y="28.6" width="21.6" height="5" rx="2.5" fill={light} />
          {/* The arrow: a chunky head over the shaft, drawn as two shapes so the head keeps its
              weight at 40px instead of tapering into a stroke. */}
          <path
            d="M20 5.6a2.4 2.4 0 0 1 1.83.85l6.6 7.74A1.8 1.8 0 0 1 27.06 17.1h-14.12a1.8 1.8 0 0 1-1.37-2.95l6.6-7.74A2.4 2.4 0 0 1 20 5.6z"
            fill={accent}
          />
          <rect x="16.7" y="15.8" width="6.6" height="11" rx="2.6" fill={accent} />
          <rect x="18.15" y="9.2" width="1.9" height="5.4" rx=".95" fill={gloss} />
          {/* Two sparks, unequal and off-axis, because a symmetrical pair reads as a mistake. */}
          <circle cx="31.4" cy="9.6" r="2.4" fill={spark} />
          <circle cx="8.8" cy="13" r="1.6" fill={spark} />
        </>
      )}
    </svg>
  );
}
