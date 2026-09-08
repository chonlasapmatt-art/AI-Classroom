import { useCallback, useEffect, useState } from 'react';
import { recall, remember } from './deviceMemory';

const key = 'last-class';

/**
 * The room this device was last working in, shared by every screen that asks for one.
 *
 * A teacher with five rooms was picking the same one over and over: the register opened on whichever
 * room sorted first, then the gradebook opened on that same first room, then the timetable, then the
 * board at the front of the class. Four screens, one room, four pickers — and the picker is never
 * the thing anybody came to do.
 *
 * So the choice is remembered on the device and every screen starts there. What it does not do is
 * override the two things that are more specific than a memory: a room named in the address (the
 * register links to the timetable with the room it was showing) and the room a student or guardian
 * belongs to, which is not a preference at all. A remembered room that no longer exists — a class
 * deleted, a person moved to another school — falls through to the first one rather than showing an
 * empty screen.
 */
export function useRememberedClass(
  classes: { id: string }[],
  preferred?: string | null
): readonly [string, (id: string) => void] {
  const [chosen, setChosen] = useState<string>(() => recall(key) ?? '');

  const known = (id: string | null | undefined) => Boolean(id) && classes.some((row) => row.id === id);
  const selected = (known(preferred) && preferred) || (known(chosen) && chosen) || classes[0]?.id || '';

  useEffect(() => {
    if (selected && selected !== recall(key)) remember(key, selected);
  }, [selected]);

  const select = useCallback((id: string) => {
    setChosen(id);
    if (id) remember(key, id);
  }, []);

  return [selected, select] as const;
}
