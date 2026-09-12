/**
 * The product's mark, drawn rather than spelled.
 *
 * Every screen that introduces the app — the sign-in cards, the setup pages, the boot splash —
 * showed the letters "SC" on a purple square. Two letters are not a logo; they are what a logo is
 * replaced by when nobody has drawn one, and a child arriving at a school app deserves something
 * with a face on it rather than an abbreviation of English words they do not read.
 *
 * So: a mortarboard, a tassel and a star, in the same three colours the product already uses for
 * brand, accent and achievement. It is one inline SVG rather than an image so it inherits the
 * rounding and shadow of whatever it sits in, needs no network request on the first paint of the
 * sign-in screen, and stays crisp at every size from the 32px topbar to the 120px splash.
 *
 * ── What the second pass changed ──
 * The first drawing was right in its parts and flat in its execution: a white quadrilateral, a white
 * rounded block under it, a stick with a ball on the end, and a star sitting on the board's own
 * corner. Four shapes, no depth between them, and at 32 pixels the cap and the head below it merged
 * into one white blob.
 *
 * Three things fix that and none of them adds a colour. The board's underside carries a shadow, so
 * the cap reads as a plate held above a head rather than as a shape resting on another shape. The
 * tassel hangs in a curve with a knot where it leaves the board, because a straight line with a dot
 * on the end is a pin, not a cord. And the star moved off the silhouette into the space beside the
 * tassel, where it is a spark the mark throws rather than a fifth corner on the board.
 *
 * The drawing is decorative: the app's name is written beside it everywhere it appears, so it is
 * hidden from screen readers unless a caller passes a `title` for a place where it stands alone.
 */
export function BrandMark({ size = 44, title }: { size?: number; title?: string }) {
  /*
   * The cap is white and the shadow under it is the same white, dimmed.
   *
   * Not grey, and not the brand colour at low opacity: the mark sits on eight different brand
   * grounds across the themes, and any fixed dark tone is wrong on at least one of them. White at a
   * lower opacity is the same ink everywhere and darkens whatever it is over, which is what a
   * shadow does.
   */
  const ink = '#fff';
  const shade = 'rgba(255,255,255,.62)';
  const accent = '#31d6c4';
  const gold = '#f7c948';

  return (
    <svg
      className="brand-glyph"
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      role={title ? 'img' : 'presentation'}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {title && <title>{title}</title>}
      {/*
        * Everything sits inside a 6-unit margin.
        *
        * The mark is almost always in a rounded tile, and a corner radius eats the corners of the
        * box it clips: drawn to the edges of the viewBox, the tassel bob touched the right side and
        * the star was cut by the curve at 32 pixels. Pulling the outermost shapes in by six units
        * costs nothing at size and is the difference between a logo and a logo that has been
        * trimmed.
        */}

      {/* The head under the board, darker so the two never merge into one shape at small sizes. */}
      <path
        d="M32 38.5 20.5 33.6v8.1c0 3.9 5.1 7 11.5 7s11.5-3.1 11.5-7v-8.1z"
        fill={shade}
      />
      {/* The board itself: a diamond in plan, with its front-left edge caught by the light. */}
      <path d="M32 13.5 58.5 24.8 32 36.1 5.5 24.8z" fill={ink} />
      <path d="M32 13.5 58.5 24.8 32 30.4z" fill={ink} opacity=".82" />
      {/* The underside of the board, which is what makes it a plate rather than a rhombus. */}
      <path d="M32 36.1 5.5 24.8l0 1.9L32 38z" fill={shade} />

      {/*
        * The tassel: a knot on the board's right corner, a cord that falls and swings out, and the
        * bob at the end of it. Drawn as a curve rather than a straight stroke — a cord hanging from
        * a moving head is never vertical, and the curve is what makes the mark look like it is
        * being worn rather than assembled.
        */}
      <circle cx="49.8" cy="27" r="2.4" fill={accent} />
      <path
        d="M49.8 27.8c0 4.4 1.5 6.8 1.5 9.7"
        stroke={accent}
        strokeWidth="2.4"
        strokeLinecap="round"
        fill="none"
      />
      <path d="M51.3 37.5a3.8 3.8 0 1 1 0 7.6 3.8 3.8 0 0 1 0-7.6z" fill={accent} />
      {/* One highlight on the bob, which is the whole of making a flat circle read as a ball. */}
      <circle cx="50" cy="40" r="1.1" fill="#fff" opacity=".55" />

      {/*
        * The star, off the board and out to its left, where it reads as something the mark gives off.
        * Five points with the lower two longer than the upper three, which is the proportion that
        * stops a star looking like a snowflake.
        */}
      <path
        d="M15.6 39.8 18 44.7 23.4 45.5 19.5 49.3 20.4 54.7 15.6 52.1 10.8 54.7 11.7 49.3 7.8 45.5 13.2 44.7z"
        fill={gold}
      />
    </svg>
  );
}
