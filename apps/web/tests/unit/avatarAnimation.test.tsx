import { readFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EnhancedPixelAvatar } from '../../src/features/avatars/EnhancedPixelAvatar';
import { blinkListenerCount, blinkTiming, onBlink } from '../../src/features/avatars/avatarBlink';
import { animationLabels, avatarAnimations } from '../../src/features/avatars/avatarThemes';
import type { AvatarConfigV2 } from '../../src/features/avatars/avatarSchema';

afterEach(cleanup);

const config: AvatarConfigV2 = {
  archetype: 0, palette: 0, skinTone: 0, hair: 0, accessory: 0, badge: 0,
  v: 2, race: 'spirit', layers: { face_features: 'face_smile' }
};

const cssPath = ['apps/web/src/features/avatars/ThemedAvatar.module.css', 'src/features/avatars/ThemedAvatar.module.css']
  .map((candidate) => resolve(candidate))
  .find((candidate) => existsSync(candidate))!;
const css = readFileSync(cssPath, 'utf8');

describe('the poses', () => {
  it('names every pose in Thai', () => {
    for (const pose of avatarAnimations) {
      expect(animationLabels[pose]?.trim().length, pose).toBeGreaterThan(0);
    }
  });

  it('has a class for every pose it offers', () => {
    // A pose with no rule falls back to idle and silently does nothing, which looks like the
    // preview being broken rather than the pose being missing.
    for (const pose of avatarAnimations) {
      expect(css.includes(`.${pose} `), pose).toBe(true);
    }
  });

  it('moves in whole frames, never by easing', () => {
    /*
     * The rule that keeps an 8-bit figure 8-bit. Every action pose steps; a sprite that eases
     * between frames renders at fractional positions and stops reading as pixels.
     */
    for (const pose of ['walk', 'run', 'jump', 'attack', 'cheer', 'cast']) {
      const rule = new RegExp(`\\.${pose} \\.figure \\{ animation: [^;]+;`).exec(css)?.[0] ?? '';
      expect(rule, pose).toContain('steps(');
      expect(rule, `${pose} must not ease`).not.toMatch(/ease|linear|cubic-bezier/);
    }
  });

  it('holds still for somebody who asked for less motion', () => {
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(reduced).toContain('animation: none');
  });
});

describe('the shared blink', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { vi.runOnlyPendingTimers(); vi.useRealTimers(); });

  it('runs one timer for however many avatars are on screen', () => {
    // Forty avatars on a leaderboard, one schedule. Forty timers is the shape of thing that makes a
    // mid-range tablet stutter, and nobody can see whether two avatars blinked together.
    const stops = Array.from({ length: 40 }, () => onBlink(() => {}));
    expect(blinkListenerCount()).toBe(40);
    for (const stop of stops) stop();
    expect(blinkListenerCount()).toBe(0);
  });

  it('closes the eyes and opens them again', () => {
    const seen: boolean[] = [];
    const stop = onBlink((closed) => seen.push(closed));
    act(() => { vi.advanceTimersByTime(blinkTiming.MAX_GAP_MS + blinkTiming.CLOSED_MS + 10); });
    expect(seen).toContain(true);
    expect(seen[seen.length - 1]).toBe(false);
    stop();
  });

  it('stops entirely when the last avatar leaves', () => {
    const stop = onBlink(() => {});
    stop();
    expect(blinkListenerCount()).toBe(0);
    // Nothing left to fire: advancing time must not throw or resurrect the schedule.
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(blinkListenerCount()).toBe(0);
  });

  it('blinks while idle and not while doing something else', () => {
    const idle = render(<EnhancedPixelAvatar config={config} animation="idle" size={48} />);
    expect(blinkListenerCount()).toBe(1);
    idle.unmount();
    expect(blinkListenerCount()).toBe(0);

    render(<EnhancedPixelAvatar config={config} animation="cast" size={48} />);
    expect(blinkListenerCount()).toBe(0);
  });
});

describe('what a race does while standing still', () => {
  it('marks the body with its race so the idle quirk can find it', () => {
    const { container } = render(<EnhancedPixelAvatar config={config} size={48} />);
    const className = container.querySelector('svg')!.getAttribute('class') ?? '';
    expect(className).toContain('spirit');
  });
});
