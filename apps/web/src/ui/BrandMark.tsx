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
 * The drawing is decorative: the app's name is written beside it everywhere it appears, so it is
 * hidden from screen readers unless a caller passes a `title` for a place where it stands alone.
 */
export function BrandMark({ size = 44, title }: { size?: number; title?: string }) {
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
      {/* The cap. Filled white so the mark works on any of the brand's grounds. */}
      <path d="M32 14 58 25 32 36 6 25z" fill="#fff" />
      <path
        d="M32 39 18 33v10c0 4.4 6.3 7.8 14 7.8s14-3.4 14-7.8V33z"
        fill="#fff"
        opacity="0.92"
      />
      {/* The tassel, in the product's accent. */}
      <path d="M53 28v11.5" stroke="#31d6c4" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="53" cy="43.5" r="4.2" fill="#31d6c4" />
      {/* And the star the achievement screens give out. */}
      <path d="M13 40l2.2 4.5 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L5.8 45.2l5-.7z" fill="#f7c948" />
    </svg>
  );
}
