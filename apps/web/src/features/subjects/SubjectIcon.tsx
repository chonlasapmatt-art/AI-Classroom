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
    case 'math': // plus over an equals sign
      return (
        <>
          <path d="M6.4 9.2h5.4M9.1 6.5v5.4" />
          <path d="M14.6 9.2h3.2" />
          <path d="M6.4 15.4h11.2" />
          <path d="M6.4 18.4h11.2" />
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
    case 'sport': // ball with seams
      return (
        <>
          <circle cx="12" cy="12" r="7" />
          <path d="M12 5v14" />
          <path d="M6.2 8.6c3.8 1.7 7.8 1.7 11.6 0" />
          <path d="M6.2 15.4c3.8-1.7 7.8-1.7 11.6 0" />
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
    case 'work': // spanner and screwdriver
      return (
        <>
          <path d="M13.8 8.4a3 3 0 0 0 3.8 3.8L19 13.6l-5.4 5.4-1.6-1.6" />
          <path d="M7.4 5.6 10.4 8.6 8.2 10.8 5.2 7.8z" />
          <path d="M6 19l4.6-4.6" />
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
    case 'default':
    default: // rounded tile
      return <rect x="5.6" y="5.6" width="12.8" height="12.8" rx="3.4" />;
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
