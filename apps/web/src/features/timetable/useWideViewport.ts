import { useEffect, useState } from 'react';

/**
 * Whether there is room on this screen for a week at once.
 *
 * The timetable has two shapes rather than one shape that shrinks, and which one to open on is a
 * question about the glass in front of the person, not about their role. It is watched rather than
 * read once because a laptop window gets dragged narrow and a tablet gets turned on its side, and
 * the grid has to stop being a grid at that moment rather than at the next reload.
 */
export function useViewportAtLeast(minWidth: number): boolean {
  const query = `(min-width: ${minWidth}px)`;
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && (window.matchMedia?.(query).matches ?? false)
  );

  useEffect(() => {
    const media = window.matchMedia?.(query);
    if (!media) return;
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [query]);

  return matches;
}
