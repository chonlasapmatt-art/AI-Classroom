import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useRememberedClass } from '../../src/app/useRememberedClass';

/*
 * The room a device was last working in.
 *
 * A teacher with five rooms was choosing the same one on every screen: the register opened on
 * whichever room sorted first, then the gradebook did, then the timetable. What the rule has to get
 * right is the order — an address and a person's own room both beat a memory — and what it must not
 * do is strand somebody on a room that no longer exists.
 */

const rooms = [{ id: 'class-1' }, { id: 'class-2' }, { id: 'class-3' }];

beforeEach(() => { window.localStorage.clear(); });

describe('the room a screen opens on', () => {
  it('starts on the first room when nothing has been chosen yet', () => {
    const { result } = renderHook(() => useRememberedClass(rooms));
    expect(result.current[0]).toBe('class-1');
  });

  it('carries a choice to the next screen that asks', () => {
    const first = renderHook(() => useRememberedClass(rooms));
    act(() => first.result.current[1]('class-3'));
    expect(first.result.current[0]).toBe('class-3');

    // A different screen, mounting fresh, with no idea what the last one did.
    const second = renderHook(() => useRememberedClass(rooms));
    expect(second.result.current[0]).toBe('class-3');
  });

  it('lets an address and an own room win over the memory', () => {
    const chooser = renderHook(() => useRememberedClass(rooms));
    act(() => chooser.result.current[1]('class-3'));

    // Following "go and register this room" asks for that room, not for the last one.
    const linked = renderHook(() => useRememberedClass(rooms, 'class-2'));
    expect(linked.result.current[0]).toBe('class-2');
  });

  it('ignores a remembered room that is no longer there', () => {
    const chooser = renderHook(() => useRememberedClass(rooms));
    act(() => chooser.result.current[1]('class-3'));

    // The room was deleted, or this person moved to a school that never had it.
    const { result } = renderHook(() => useRememberedClass([{ id: 'class-9' }]));
    expect(result.current[0]).toBe('class-9');
  });

  it('ignores an address that names a room this person may not see', () => {
    const { result } = renderHook(() => useRememberedClass(rooms, 'class-somebody-elses'));
    expect(result.current[0]).toBe('class-1');
  });
});
