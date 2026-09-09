/**
 * Subject icons as inline SVG.
 *
 * Text glyphs were unreliable here: every font gives them different metrics, so the same icon sat
 * too high in a chip and overflowed a round frame.
 *
 * Every icon below is drawn inside the same optical box — x and y stay between 5 and 19 on a 24×24
 * grid — with one stroke weight. That shared box is what makes the set look evenly sized and sit
 * centred in a chip, a rounded tile or a notification circle without per-icon nudging.
 */
import { isSubjectIconKey, type SubjectIconKey } from '../../data/subjectCatalog';

function paths(key: SubjectIconKey) {
  switch (key) {
    case 'language': // pencil on a writing line
      return (
        <>
          <path d="M6 19h12" />
          <path d="M8 16.4 15.4 9a1.8 1.8 0 0 1 2.6 2.6l-7.4 7.4-3.2.6z" />
          <path d="M13.8 10.6 16.4 13.2" />
        </>
      );
    /*
     * The four operations in a square, which is what a Thai primary maths book has on its cover.
     * The previous drawing was a plus, a minus and two long rules stacked — at 20px that read as a
     * paragraph of lines rather than as arithmetic.
     */
    case 'math':
      return (
        <>
          <path d="M5.4 9.6h5.2M8 7v5.2" />
          <path d="M13.6 7.4l4.8 4.8M18.4 7.4l-4.8 4.8" />
          <path d="M6 17.2h12" />
          <circle cx="12" cy="14.6" r="1" fill="currentColor" stroke="none" />
          <circle cx="12" cy="19.4" r="1" fill="currentColor" stroke="none" />
        </>
      );
    case 'science': // flask
      return (
        <>
          <path d="M9.6 5h4.8" />
          <path d="M10.6 5v5.6L6.9 16.6a1.8 1.8 0 0 0 1.5 2.4h7.2a1.8 1.8 0 0 0 1.5-2.4l-3.7-6V5" />
          <path d="M8.6 14.6h6.8" />
        </>
      );
    case 'social': // two people
      return (
        <>
          <circle cx="10" cy="9.2" r="2.6" />
          <path d="M5.6 18.4a4.4 4.4 0 0 1 8.8 0" />
          <path d="M15.6 7.6a2.4 2.4 0 0 1 0 4.4" />
          <path d="M18.4 18.4a4 4 0 0 0-2.2-3.4" />
        </>
      );
    /*
     * A person running, not a ball.
     * The ball was a circle with two curved seams and a meridian — at icon size, the same drawing as
     * the globe two places along in the picker, which is the one thing a set of icons must not do.
     * A figure in motion is unmistakably พลศึกษา and shares nothing with any other icon here.
     */
    case 'sport':
      return (
        <>
          <circle cx="14.6" cy="6.6" r="1.7" />
          <path d="M8.2 19.4l2.6-4 3-1.6-1.2-3.4" />
          <path d="M12.6 10.4 9 12l-.8 2.6" />
          <path d="m12.6 10.4 3.2 1.2 1.4 3.4" />
          <path d="m15.8 11.6 1.8 6.4" />
        </>
      );
    case 'art': // palette
      return (
        <>
          <path d="M12 5a7 7 0 0 0 0 14c1.2 0 1.8-.8 1.8-1.6 0-1.1-1-1.4-1-2.3 0-.7.6-1.3 1.4-1.3h1.2A3.6 3.6 0 0 0 19 10.2C19 7.3 15.9 5 12 5z" />
          <circle cx="9.1" cy="10.6" r="1" />
          <circle cx="12" cy="8.6" r="1" />
          <circle cx="15" cy="10.4" r="1" />
        </>
      );
    /*
     * A toolbox rather than a spanner crossed with a screwdriver: two thin diagonal tools at 20px
     * were three unrelated strokes, and การงานอาชีพ is the whole box of them anyway.
     */
    case 'work':
      return (
        <>
          <rect x="4.8" y="9.6" width="14.4" height="9.4" rx="2" />
          <path d="M9.4 9.6V7.8a1.6 1.6 0 0 1 1.6-1.6h2a1.6 1.6 0 0 1 1.6 1.6v1.8" />
          <path d="M4.8 13.4h14.4" />
          <path d="M10.6 12.2h2.8v2.4h-2.8z" />
        </>
      );
    case 'globe': // globe with meridians
      return (
        <>
          <circle cx="12" cy="12" r="7" />
          <path d="M5 12h14" />
          <path d="M12 5c2 2.2 3 4.5 3 7s-1 4.8-3 7c-2-2.2-3-4.5-3-7s1-4.8 3-7z" />
        </>
      );
    case 'book': // open book
      return (
        <>
          <path d="M12 8.2C10.6 7 9 6.4 6.8 6.4H5.4v11h1.4c2.2 0 3.8.6 5.2 1.8 1.4-1.2 3-1.8 5.2-1.8h1.4v-11h-1.4c-2.2 0-3.8.6-5.2 1.8z" />
          <path d="M12 8.2v11" />
        </>
      );
    case 'music': // note
      return (
        <>
          <path d="M10 17.4V7.4l8-1.6v9.4" />
          <circle cx="7.8" cy="17.4" r="2.2" />
          <circle cx="15.8" cy="15.6" r="2.2" />
        </>
      );
    case 'code': // angle brackets around a slash
      return (
        <>
          <path d="M9 8.6 5.6 12 9 15.4" />
          <path d="M15 8.6 18.4 12 15 15.4" />
          <path d="M13.2 6.6 10.8 17.4" />
        </>
      );
    /*
     * Two orbits, not three, and tilted apart far enough to stay two.
     * Three overlapping ellipses at 20px filled the middle of the box with crossings and read as a
     * smudge; the nucleus is drawn solid so the centre is a dot rather than another outline.
     */
    case 'atom':
      return (
        <>
          <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
          <ellipse cx="12" cy="12" rx="7" ry="2.9" transform="rotate(-28 12 12)" />
          <ellipse cx="12" cy="12" rx="7" ry="2.9" transform="rotate(28 12 12)" />
        </>
      );
    case 'leaf': // leaf on its stem
      return (
        <>
          <path d="M6 18.6c0-6 4-12 12.4-12.6.6 7.4-3.6 12-8.4 12a4 4 0 0 1-4-4z" />
          <path d="M6.6 19c2.6-3.6 5.6-6.2 9.4-8" />
        </>
      );
    case 'map': // folded map
      return (
        <>
          <path d="M5 7.6 9.6 6v11.4L5 19z" />
          <path d="M9.6 6 14.4 7.6v11.4L9.6 17.4z" />
          <path d="M14.4 7.6 19 6v11.4L14.4 19z" />
        </>
      );
    case 'history': // hourglass
      return (
        <>
          <path d="M7.4 5.4h9.2" />
          <path d="M7.4 18.6h9.2" />
          <path d="M8.6 5.4c0 3.2 3.4 4.4 3.4 6.6s-3.4 3.4-3.4 6.6" />
          <path d="M15.4 5.4c0 3.2-3.4 4.4-3.4 6.6s3.4 3.4 3.4 6.6" />
        </>
      );
    /*
     * A heart with a cross in it. The pulse line ran edge to edge behind the heart and crossed its
     * outline twice, which at this size is a heart with a scribble over it.
     */
    case 'health':
      return (
        <>
          <path d="M12 19 6.4 13.4a3.6 3.6 0 0 1 5.6-4.5 3.6 3.6 0 0 1 5.6 4.5z" />
          <path d="M12 11.2v4.4M9.8 13.4h4.4" />
        </>
      );
    case 'computer': // monitor on a stand
      return (
        <>
          <rect x="4.6" y="5.6" width="14.8" height="9.6" rx="2" />
          <path d="M9.6 19h4.8" />
          <path d="M12 15.2V19" />
        </>
      );
    /*
     * One mask, drawn large. Two overlapping masks with four eye dots came out as a pair of goggles;
     * a single smiling mask with its ribbons is unmistakable and has room for its own features.
     */
    case 'drama':
      return (
        <>
          <path d="M6.4 6.6h11.2v5.6a5.6 5.6 0 0 1-11.2 0z" />
          <path d="M9.4 9.6h.02M14.6 9.6h.02" />
          <path d="M9.8 13.6c1.4 1.2 3 1.2 4.4 0" />
          <path d="M6.4 7.8 3.6 6.2M17.6 7.8l2.8-1.6" />
        </>
      );
    case 'compass': // compass rose with a needle
      return (
        <>
          <circle cx="12" cy="12" r="7" />
          <path d="M14.8 9.2 13.2 13.2 9.2 14.8 10.8 10.8z" />
        </>
      );
    case 'lotus': // lotus in bloom
      return (
        <>
          <path d="M12 6.4c1.8 1.8 2.6 3.6 2.6 5.6S13.8 15.8 12 17.6c-1.8-1.8-2.6-3.6-2.6-5.6s.8-3.8 2.6-5.6z" />
          <path d="M9.4 12c-1.6-1-3.2-1.4-4.8-1.2.2 3.4 2.6 6 6 6.6" />
          <path d="M14.6 12c1.6-1 3.2-1.4 4.8-1.2-.2 3.4-2.6 6-6 6.6" />
        </>
      );
    case 'star': // five-pointed star
      return <path d="M12 5.4l2 4.3 4.6.6-3.4 3.2.9 4.7-4.1-2.3-4.1 2.3.9-4.7L5.4 10.3l4.6-.6z" />;
    /*
     * The fallback is a label with its hole punched, not a blank rounded square: a subject with no
     * icon chosen still looks like a named thing rather than like a drawing that failed to load.
     */
    case 'default':
    default:
      return (
        <>
          <path d="M5.4 11.2V6.6a1.2 1.2 0 0 1 1.2-1.2h4.6l7.4 7.4a1.6 1.6 0 0 1 0 2.3l-4.3 4.3a1.6 1.6 0 0 1-2.3 0z" />
          <circle cx="9.2" cy="9.2" r="1.3" />
        </>
      );
  }
}

export function SubjectIcon({ iconKey, size = 18, title }: { iconKey: string; size?: number; title?: string }) {
  const key: SubjectIconKey = isSubjectIconKey(iconKey) ? iconKey : 'default';
  return (
    <svg
      className="subject-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? 'img' : 'presentation'}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {title && <title>{title}</title>}
      {paths(key)}
    </svg>
  );
}
