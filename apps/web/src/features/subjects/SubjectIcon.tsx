/**
 * Subject icons, drawn in the subject's own colour.
 *
 * The set was line art: one stroke weight, one colour, hairlines at 1.6. It survived at 22px in a
 * medallion and dissolved at 13px in a calendar chip, and every subject's badge was the same grey
 * drawing with the colour only in the tile behind it.
 *
 * These are filled instead of stroked, in three tones:
 *
 *   * the mass of the drawing in `currentColor`, which the medallion, the chip and the picker all
 *     set to the subject's own colour, so a subject is recognisable by its badge before anybody
 *     reads the name;
 *   * a lighter tone of the same colour for the part behind — mixed with the page's surface rather
 *     than with white, so it lightens on a light theme and darkens on a dark one;
 *   * and one small accent, the same amber and teal the product's mark uses, on the detail that
 *     makes the drawing what it is: the pencil's tip, the flask's bubble, the compass's north.
 *
 * Filled shapes hold their shape at 13px where a 1.6 hairline does not, so the same drawing now
 * works from the calendar chip up to the 46px medallion.
 *
 * ── The box ──
 * Every icon is drawn inside x,y ∈ [4, 20] on a 24×24 grid, centred on (12, 12). That is not a
 * style note: the icons sit in square frames that centre their contents, so an icon whose drawing
 * is not centred on the grid sits visibly off-centre in its tile, and several of the old ones were
 * — the mask's ribbons ran to x=3.6, the note's tail to y=19.6. `subjectIconBox.test.tsx` measures
 * every icon's geometry and fails if anything leaves the box or the centre drifts.
 */
import type { ReactElement } from 'react';
import type { SubjectIconKey } from '../../data/subjectCatalog';
import { subjectIconKeyFor } from '../../data/subjectIconMatch';

/*
 * The two tones the drawings are built from, each overridable by whatever frame holds the icon.
 *
 * On a card the icon is drawn in the subject's colour on the page, so the lighter tone is that
 * colour mixed with the page and the knocked-out parts are the page itself. Inside the glass
 * medallion the whole relationship inverts — white ink on a saturated tile — and those two defaults
 * would turn every soft shape and every cut-out into the same near-white blob: the plus inside the
 * maths tile disappeared, and the globe became a plain white circle. So the frame gets to say.
 */
/** The lighter half of the drawing. Defaults to the subject's colour mixed with the page. */
const soft = 'var(--subject-icon-soft, color-mix(in srgb, currentColor 32%, var(--color-surface, #fff)))';
/** A knocked-out highlight: whatever is behind the drawing, showing through it. */
const cut = 'var(--subject-icon-cut, var(--color-surface, #fff))';
/** The two accents the product's mark already uses, so the icons belong to the same family. */
const warm = '#f7c948';
const cool = '#31d6c4';

/*
 * Annotated `ReactElement` rather than left to inference, and with no `default:` label.
 *
 * That pair is what makes the set a registry rather than a switch with a hole in it: add a key to
 * `SubjectIconKey` and forget the drawing, and control reaches the end of this function returning
 * `undefined`, which the annotation refuses — the build fails naming the file. With a `default:`
 * catching everything, the same mistake compiled and shipped a subject silently wearing the
 * fallback, which is precisely the failure the whole set exists to avoid.
 */
function paths(key: SubjectIconKey): ReactElement {
  switch (key) {
    case 'language': // a pencil over the line it is writing
      return (
        <>
          <rect x="5" y="17.8" width="14" height="1.7" rx=".85" fill={soft} />
          <rect x="9.5" y="4.6" width="5" height="9" rx="1.4" fill="currentColor" />
          <rect x="9.5" y="6.4" width="5" height="1.5" fill={cut} />
          <path d="M9.5 13.2h5l-2.5 3.4z" fill={warm} />
        </>
      );
    case 'math': // a key off an arithmetic keypad: the plus, and the sign that is only ever maths
      return (
        <>
          <rect x="4.4" y="4.4" width="15.2" height="15.2" rx="4.2" fill={soft} />
          <rect x="6.8" y="9.9" width="7.4" height="1.9" rx=".95" fill="currentColor" />
          <rect x="9.55" y="7.15" width="1.9" height="7.4" rx=".95" fill="currentColor" />
          <path d="M15 14.2 17.8 17M17.8 14.2 15 17" stroke={warm} strokeWidth="1.9" strokeLinecap="round" />
        </>
      );
    case 'science': // a flask with something still in it
      return (
        <>
          <rect x="10.1" y="4.2" width="3.8" height="1.7" rx=".85" fill="currentColor" />
          <path d="M10.5 5.6h3v4.7l4.2 6.9a1.8 1.8 0 0 1-1.5 2.7H7.8a1.8 1.8 0 0 1-1.5-2.7l4.2-6.9z" fill={soft} />
          <path d="M8.3 13.9h7.4l2 3.3a1.8 1.8 0 0 1-1.5 2.7H7.8a1.8 1.8 0 0 1-1.5-2.7z" fill="currentColor" />
          <circle cx="13.7" cy="16.9" r="1.1" fill={cool} />
        </>
      );
    case 'social': // two people, the nearer one whole
      return (
        <>
          <circle cx="15.8" cy="8.6" r="2.5" fill={soft} />
          <path d="M11.6 18.4a4.2 4.2 0 0 1 8.4 0z" fill={soft} />
          <circle cx="9.6" cy="8.9" r="3.1" fill="currentColor" />
          <path d="M4.4 19.2a5.2 5.2 0 0 1 10.4 0z" fill="currentColor" />
        </>
      );
    case 'sport': // a figure running, which shares nothing with the globe two places along
      return (
        <>
          <rect x="4.6" y="18.4" width="14.8" height="1.5" rx=".75" fill={soft} />
          <circle cx="14.9" cy="6.3" r="2.1" fill={warm} />
          <g stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none">
            <path d="M14 9.4 11.6 12.6" />
            <path d="M11.6 12.6 14.4 14.6 13.8 18" />
            <path d="M11.6 12.6 8.7 13.9 6.9 17.2" />
            <path d="M14 9.4 17.3 10.7" />
          </g>
          <path d="M11.9 10.6 8.8 9.5" stroke={soft} strokeWidth="2.2" strokeLinecap="round" />
        </>
      );
    case 'art': // a palette, with paint on it
      return (
        <>
          <path d="M12 4.4a7.6 7.6 0 0 0 0 15.2c1.3 0 2-.9 2-1.8 0-1.2-1.1-1.5-1.1-2.5 0-.8.6-1.4 1.5-1.4h1.3a3.9 3.9 0 0 0 3.9-3.9c0-3.2-3.4-5.6-7.6-5.6z" fill={soft} />
          <circle cx="8.8" cy="10.4" r="1.5" fill="currentColor" />
          <circle cx="12" cy="8.2" r="1.5" fill={warm} />
          <circle cx="15.4" cy="10.2" r="1.5" fill={cool} />
        </>
      );
    case 'work': // the whole toolbox, not two crossed tools that read as three strokes
      return (
        <>
          <path d="M9.2 9.4V7.8A1.8 1.8 0 0 1 11 6h2a1.8 1.8 0 0 1 1.8 1.8v1.6h-1.9V7.9h-1.8v1.5z" fill="currentColor" />
          <rect x="4.4" y="9.4" width="15.2" height="9.8" rx="2.2" fill={soft} />
          <rect x="4.4" y="12.6" width="15.2" height="1.7" fill="currentColor" />
          <rect x="10.3" y="11.4" width="3.4" height="4.1" rx="1" fill={warm} />
        </>
      );
    case 'globe': // a globe with its meridians
      return (
        <>
          <circle cx="12" cy="12" r="7.6" fill={soft} />
          <rect x="6.3" y="7.7" width="11.4" height="1.3" rx=".65" fill={cut} />
          <rect x="6.3" y="15" width="11.4" height="1.3" rx=".65" fill={cut} />
          <rect x="4.4" y="11.2" width="15.2" height="1.6" fill="currentColor" />
          <path d="M12 4.4c2.2 2.4 3.3 4.9 3.3 7.6S14.2 17.2 12 19.6c-2.2-2.4-3.3-4.9-3.3-7.6S9.8 6.8 12 4.4zm0 2.6c-1.2 1.6-1.8 3.3-1.8 5s.6 3.4 1.8 5c1.2-1.6 1.8-3.3 1.8-5s-.6-3.4-1.8-5z" fill="currentColor" />
        </>
      );
    case 'book': // an open book on its spine
      return (
        <>
          <path d="M4.4 6.1h2.2c2.3 0 4 .7 5.4 1.9v10.9c-1.4-1.2-3.1-1.8-5.4-1.8H4.4z" fill={soft} />
          <path d="M19.6 6.1h-2.2c-2.3 0-4 .7-5.4 1.9v10.9c1.4-1.2 3.1-1.8 5.4-1.8h2.2z" fill="currentColor" />
          <rect x="11.2" y="7.4" width="1.6" height="11.5" rx=".8" fill={warm} />
        </>
      );
    case 'music': // two notes under one beam
      return (
        <>
          <path d="M9.6 6.4 18 4.9a.9.9 0 0 1 1.1.9v2L9.6 9.5z" fill={warm} />
          <rect x="8.2" y="6.2" width="1.7" height="10.4" rx=".85" fill="currentColor" />
          <rect x="17.4" y="4.8" width="1.7" height="9.6" rx=".85" fill="currentColor" />
          <ellipse cx="7" cy="16.9" rx="2.5" ry="2.2" fill="currentColor" />
          <ellipse cx="15.6" cy="14.7" rx="2.6" ry="2.2" fill={soft} />
        </>
      );
    case 'code': // angle brackets around a slash
      return (
        <>
          <rect x="4.4" y="4.6" width="15.2" height="14.8" rx="3.6" fill={soft} />
          <path d="M9.6 8.9 7 12l2.6 3.1a1 1 0 0 1-1.5 1.3l-3.1-3.7a1 1 0 0 1 0-1.3l3.1-3.7a1 1 0 0 1 1.5 1.3z" fill="currentColor" />
          <path d="M14.4 8.9 17 12l-2.6 3.1a1 1 0 0 0 1.5 1.3l3.1-3.7a1 1 0 0 0 0-1.3l-3.1-3.7a1 1 0 0 0-1.5 1.3z" fill="currentColor" />
          <rect x="11.15" y="7.4" width="1.7" height="9.2" rx=".85" transform="rotate(14 12 12)" fill={warm} />
        </>
      );
    case 'atom': // a nucleus and two orbits, tilted far enough apart to stay two
      return (
        <>
          <ellipse cx="12" cy="12" rx="7" ry="3.2" transform="rotate(-30 12 12)" fill="none" stroke={soft} strokeWidth="1.8" />
          <ellipse cx="12" cy="12" rx="7" ry="3.2" transform="rotate(30 12 12)" fill="none" stroke={soft} strokeWidth="1.8" />
          <circle cx="12" cy="12" r="2.4" fill="currentColor" />
          {/* On the orbit, not beside it: the electron sits at t=0 of the -30° ellipse. */}
          <circle cx="18.06" cy="8.5" r="1.2" fill={cool} />
        </>
      );
    case 'leaf': // a leaf on its stem
      return (
        <>
          <path d="M18.9 5.1c.6 8.1-3.9 13.4-9.2 13.4a4.3 4.3 0 0 1-4.3-4.3C5.4 12.1 7.3 5.7 18.9 5.1z" fill="currentColor" />
          <path d="M16.3 9.1a.85.85 0 0 1 .4 1.6c-3.7 1.8-6.5 4.3-9.1 7.9a.85.85 0 1 1-1.4-1c2.8-3.9 5.9-6.6 10.1-8.5z" fill={cut} />
          <path d="M18.9 5.1c-4.1.2-6.9 1.2-8.8 2.6 2.6.3 4.9 1.4 6.6 3.1.9-1.7 1.5-3.6 2.2-5.7z" fill={soft} />
        </>
      );
    case 'map': // a folded map with a pin on it
      return (
        <>
          <path d="M4.4 7.3 9 5.4v11.9l-4.6 1.9z" fill={soft} />
          <path d="M9 5.4 15 7.3v11.9L9 17.3z" fill="currentColor" />
          <path d="M15 7.3 19.6 5.4v11.9L15 19.2z" fill={soft} />
          <path d="M15.8 9.4a2.6 2.6 0 0 1 2.6 2.6c0 1.9-2.6 4.6-2.6 4.6s-2.6-2.7-2.6-4.6a2.6 2.6 0 0 1 2.6-2.6z" fill={warm} />
        </>
      );
    case 'history': // an hourglass with the sand still running
      return (
        <>
          <rect x="6.6" y="4.4" width="10.8" height="1.8" rx=".9" fill="currentColor" />
          <rect x="6.6" y="17.8" width="10.8" height="1.8" rx=".9" fill="currentColor" />
          <path d="M8.2 6.2h7.6c0 3-3.1 4.6-3.1 5.8s3.1 2.8 3.1 5.8H8.2c0-3 3.1-4.6 3.1-5.8S8.2 9.2 8.2 6.2z" fill={soft} />
          <path d="M9.9 15.9c.5-1.2 2.1-2 2.1-2s1.6.8 2.1 2z" fill={warm} />
        </>
      );
    case 'health': // a heart with a cross in it
      return (
        <>
          <g transform="translate(0 -1.2)">
            <path d="M12 19.6 5.7 13.3a4 4 0 0 1 6.3-5 4 4 0 0 1 6.3 5z" fill="currentColor" />
            <path d="M11.1 9.9h1.8v2.1H15v1.8h-2.1V16h-1.8v-2.2H9V12h2.1z" fill={cut} />
          </g>
        </>
      );
    case 'computer': // a monitor on its stand
      return (
        <>
          <rect x="4.4" y="4.9" width="15.2" height="10.6" rx="2.2" fill="currentColor" />
          <rect x="6.4" y="6.9" width="11.2" height="6.6" rx="1" fill={soft} />
          <rect x="11.1" y="15.5" width="1.8" height="2.6" fill="currentColor" />
          <rect x="8" y="17.7" width="8" height="1.8" rx=".9" fill="currentColor" />
        </>
      );
    /*
     * A robot's head, for หุ่นยนต์ / ปัญญาประดิษฐ์ / วิทยาการคำนวณ.
     *
     * The nearest drawing in the set is the monitor, so the two are separated on silhouette rather
     * than on detail: the monitor is a wide screen standing on a foot, this is a narrower head with
     * an aerial above it and ears either side. At 13px the aerial is the whole difference, which is
     * why it is the one shape carrying an accent.
     */
    case 'robot':
      return (
        <>
          <circle cx="12" cy="5.8" r="1.3" fill={warm} />
          <rect x="11.2" y="6.6" width="1.6" height="2" fill="currentColor" />
          <rect x="4" y="11.3" width="1.5" height="3.2" rx=".75" fill={soft} />
          <rect x="18.5" y="11.3" width="1.5" height="3.2" rx=".75" fill={soft} />
          <rect x="4.6" y="8" width="14.8" height="9.6" rx="3" fill="currentColor" />
          <rect x="6.8" y="10.1" width="10.4" height="5.4" rx="1.8" fill={cut} />
          <circle cx="9.6" cy="12.8" r="1.35" fill="currentColor" />
          <circle cx="14.4" cy="12.8" r="1.35" fill="currentColor" />
          <rect x="10" y="16" width="4" height="1" rx=".5" fill={cut} />
          <rect x="8.6" y="17.6" width="6.8" height="1.9" rx=".95" fill={soft} />
        </>
      );
    case 'drama': // one mask, drawn large, with its ribbon
      return (
        <>
          <path d="M18.4 6.2 19.6 5.6l.4 1.4-1.4.8zM5.6 6.2 4.4 5.6 4 7l1.4.8z" fill={cool} />
          <path d="M5.2 5.4h13.6v6.4a6.8 6.8 0 0 1-13.6 0z" fill="currentColor" />
          <circle cx="9.2" cy="9.6" r="1.15" fill={cut} />
          <circle cx="14.8" cy="9.6" r="1.15" fill={cut} />
          <path d="M9.1 13.2a4.6 4.6 0 0 0 5.8 0 .85.85 0 0 1 1.1 1.3 6.3 6.3 0 0 1-8 0 .85.85 0 0 1 1.1-1.3z" fill={cut} />
        </>
      );
    case 'compass': // a compass rose, north picked out
      return (
        <>
          <circle cx="12" cy="12" r="7.6" fill={soft} />
          <path d="M15.6 8.4 13.7 13.7 8.4 15.6l1.9-5.3z" fill={cut} />
          <path d="M15.6 8.4 13.7 13.7 12 12z" fill={warm} />
          <path d="M8.4 15.6 10.3 10.3 12 12z" fill="currentColor" />
        </>
      );
    case 'lotus': // a lotus in bloom
      return (
        <>
          <path d="M9.2 12.1c-1.7-1.1-3.4-1.5-5.1-1.3.2 4.1 3.1 7.2 7.1 7.8z" fill={soft} />
          <path d="M14.8 12.1c1.7-1.1 3.4-1.5 5.1-1.3-.2 4.1-3.1 7.2-7.1 7.8z" fill={soft} />
          <path d="M12 4.9c2 2 2.9 4.1 2.9 6.3s-.9 4.3-2.9 6.3c-2-2-2.9-4.1-2.9-6.3S10 6.9 12 4.9z" fill="currentColor" />
          <circle cx="12" cy="11.4" r="1.4" fill={warm} />
        </>
      );
    case 'star': // a five-pointed star
      return (
        <>
          <path d="M12 4.4l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4-3.9-3.8 5.4-.8z" fill={warm} />
          <path d="M12 7.9l1.4 2.9 3.2.5-2.3 2.2.5 3.2-2.8-1.5-2.8 1.5.5-3.2-2.3-2.2 3.2-.5z" fill="currentColor" />
        </>
      );
    /*
     * The fallback: four tiles, not a price label.
     *
     * It used to be a luggage tag with its hole punched, and a tag means one thing — a price — which
     * is the wrong thing to say about a school subject. Six of nine subjects in the live school were
     * wearing it, so the drawing that says "we do not know what this is yet" is on screen more than
     * most of the real ones and has to be neutral rather than merely different.
     *
     * Four tiles in a checkerboard say "a category" without claiming which. It survives 13px, where
     * a tag's punched hole closes up, and its silhouette is shared with nothing else in the set —
     * the maths and code keys are one large rounded square, this is four small ones.
     */
    case 'default':
      return (
        <>
          <rect x="4.5" y="4.5" width="6.6" height="6.6" rx="2.1" fill="currentColor" />
          <rect x="12.9" y="4.5" width="6.6" height="6.6" rx="2.1" fill={soft} />
          <rect x="4.5" y="12.9" width="6.6" height="6.6" rx="2.1" fill={soft} />
          <rect x="12.9" y="12.9" width="6.6" height="6.6" rx="2.1" fill="currentColor" />
          <circle cx="7.8" cy="7.8" r="1.5" fill={warm} />
          <circle cx="16.2" cy="16.2" r="1.5" fill={cut} />
        </>
      );
  }
}

export interface SubjectIconProps {
  /** The stored key. Wins whenever it names a drawing: it is somebody's deliberate choice. */
  iconKey?: string;
  /** A subject's name, read only when no stored key names a drawing. */
  subject?: string;
  size?: number;
  /** Named for a reader, rather than hidden from one. Only pass it where no name is on screen. */
  title?: string;
  className?: string;
}

export function SubjectIcon({ iconKey, subject, size = 18, title, className }: SubjectIconProps) {
  const key = subjectIconKeyFor(iconKey, subject);
  return (
    <svg
      className={className ? `subject-icon ${className}` : 'subject-icon'}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      role={title ? 'img' : 'presentation'}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {title && <title>{title}</title>}
      {paths(key)}
    </svg>
  );
}
