import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AvatarFrame } from '../../src/features/avatars/AvatarFrame';
import { FullBodyAvatar } from '../../src/features/avatars/FullBodyAvatar';
import { cropForSize, cropViewBox } from '../../src/features/avatars/avatarGeometry';

afterEach(cleanup);

const here = dirname(fileURLToPath(import.meta.url));
const frameStyles = readFileSync(
  resolve(here, '../../src/features/avatars/AvatarFrame.module.css'), 'utf8'
);
const poseStyles = readFileSync(
  resolve(here, '../../src/features/avatars/FullBodyAvatar.module.css'), 'utf8'
);

/** The sizes the product actually asks for, plus the ends of the range the brief names. */
const sizes = [24, 32, 34, 36, 40, 44, 48, 56, 64, 72, 80, 88, 96, 112, 128, 176, 256];

/*
 * The frame.
 *
 * "The avatar is out of its frame" was reported against a dozen screens and was one fault in all of
 * them: there was no frame. Each screen wrote a rule against whatever element the avatar happened to
 * be — `> svg` here, `.ui-avatar-photo` there — so nothing clipped a pose that translates, nothing
 * survived the drawing changing from a photograph to a figure, and no two screens rounded the corner
 * the same way.
 */
describe('the frame every avatar sits in', () => {
  it('clips, so nothing a pose does lands on the row above', () => {
    /*
     * The jump translates the figure by ten units and the cheer throws both arms past the top of the
     * grid. With `overflow: visible` — which is what the drawing carried — both of those paint
     * outside the element and onto whatever is beside it.
     */
    expect(frameStyles).toMatch(/\.frame\s*\{[^}]*overflow:\s*hidden/);
    expect(poseStyles).toMatch(/\.avatar\s*\{[^}]*overflow:\s*hidden/);
    // And the one deliberate exception is named rather than implied.
    expect(poseStyles).toContain('.spill { overflow: visible; }');
  });

  it('is exactly the size it was asked for, at every size the product uses', () => {
    for (const size of sizes) {
      const { container } = render(
        <AvatarFrame size={size}><FullBodyAvatar archetype="student" size={size} /></AvatarFrame>
      );
      const frame = container.firstElementChild as HTMLElement;
      expect(frame.style.width, `${size}`).toBe(`${size}px`);
      expect(frame.style.height, `${size}`).toBe(`${size}px`);
      cleanup();
    }
  });

  it('hangs a badge outside the clip rather than inside it', () => {
    // A badge inside a circular frame is cut into a crescent by the frame's own radius, which reads
    // as a rendering fault rather than as a design.
    const { container } = render(
      <AvatarFrame size={48} statusBadge={<span>1</span>}>
        <FullBodyAvatar archetype="student" size={48} />
      </AvatarFrame>
    );
    const wrapper = container.firstElementChild!;
    const badge = container.querySelector('[data-avatar-badge]')!;
    expect(wrapper.contains(badge)).toBe(true);
    // The badge is a sibling of the clipping frame, not a descendant of it.
    const frame = wrapper.firstElementChild!;
    expect(frame.contains(badge)).toBe(false);
  });

  it('takes its ground and its border from the design system rather than from a literal', () => {
    // An avatar frame with a hardcoded white ground is an avatar frame that glows in a dark card.
    expect(frameStyles).toContain('background: var(--surface-sunken)');
    expect(frameStyles).toContain('var(--line-strong)');
    expect(frameStyles).not.toMatch(/background:\s*#[0-9a-f]{3,8}/i);
  });
});

/*
 * The crop.
 *
 * One drawing, four windows, and one rule deciding which window a given size gets. The rule used to
 * be a single threshold repeated at fourteen call sites, which is fourteen rules.
 */
describe('how much of the figure is in shot', () => {
  it('shows a face where there is room for a face and a person where there is room for a person', () => {
    expect(cropForSize(24)).toBe('portrait');
    expect(cropForSize(34)).toBe('portrait');
    expect(cropForSize(40)).toBe('bust');
    expect(cropForSize(56)).toBe('bust');
    expect(cropForSize(64)).toBe('half');
    expect(cropForSize(88)).toBe('half');
    expect(cropForSize(112)).toBe('full');
    expect(cropForSize(256)).toBe('full');
  });

  it('never crops tighter as the frame gets bigger', () => {
    const order = ['portrait', 'bust', 'half', 'full'];
    let seen = -1;
    for (const size of sizes) {
      const rank = order.indexOf(cropForSize(size));
      expect(rank, `${size} crops tighter than a smaller frame`).toBeGreaterThanOrEqual(seen);
      seen = rank;
    }
  });

  it('keeps the head in every crop, which is the one thing every crop is for', () => {
    // The head is x 15–33, y 4–19 with hair from y 0. A crop that does not contain it is a crop of
    // somebody's shirt.
    for (const [mode, viewBox] of Object.entries(cropViewBox)) {
      const [x, y, width, height] = viewBox.split(' ').map(Number);
      expect(x!, mode).toBeLessThanOrEqual(15);
      expect(x! + width!, mode).toBeGreaterThanOrEqual(33);
      expect(y!, mode).toBe(0);
      expect(y! + height!, mode).toBeGreaterThanOrEqual(19);
    }
  });

  it('mirrors the figure only when something asked it to, and never inside a keyframe', () => {
    /*
     * The run looked like it turned round twice a second. A pose must not decide which way its
     * subject faces: the mirror is one transform, applied once, outside every animation.
     */
    const { container } = render(<FullBodyAvatar archetype="athlete" animation="run" facing="left" />);
    const mirrored = container.querySelector('svg > g');
    expect(mirrored?.getAttribute('transform')).toBe('translate(48,0) scale(-1,1)');
    cleanup();

    const { container: plain } = render(<FullBodyAvatar archetype="athlete" animation="run" />);
    expect(plain.querySelector('svg > g')?.getAttribute('transform')).toBeNull();

    // No keyframe anywhere flips the figure on an axis, which is the only way a loop could turn it.
    expect(poseStyles).not.toMatch(/scaleX\(-/);
    expect(poseStyles).not.toMatch(/scale\(-/);
  });

  it('gives the ground contact a walk and a run need to stop reading as a treadmill', () => {
    // A cycle with a fixed shadow is a figure sliding along on a puddle: the shadow tightening on
    // the contact frames is what says a foot arrived.
    expect(poseStyles).toContain('.walk .shadow { animation: shadowStep 0.6s var(--ease-drift) infinite; }');
    expect(poseStyles).toContain('.run .shadow { animation: shadowStride 0.4s var(--ease-drift) infinite; }');
  });

  it('starts the wave from below and lets it come back down', () => {
    // A cycle whose first frame is already overhead has no lift in it, and its loop point is a
    // snap from over the head straight back to over the head.
    const wave = poseStyles.slice(poseStyles.indexOf('@keyframes waveArm'));
    const first = /0%\s*\{\s*transform: rotate\((-?[\d.]+)deg\)/.exec(wave)?.[1];
    const last = /100%\s*\{\s*transform: rotate\((-?[\d.]+)deg\)/.exec(wave)?.[1];
    expect(Number(first)).toBeLessThan(60);
    expect(last).toBe(first);
  });

  it('never lets the spell effect blink out entirely', () => {
    // Six frames from opacity 0 to 1 and back, once a second, is a strobe rather than a spell.
    const rune = poseStyles.slice(
      poseStyles.indexOf('@keyframes runeOpen'),
      poseStyles.indexOf('}', poseStyles.indexOf('100%', poseStyles.indexOf('@keyframes runeOpen')))
    );
    const opacities = [...rune.matchAll(/opacity: ([\d.]+)/g)].map((match) => Number(match[1]));
    expect(opacities.length).toBeGreaterThan(4);
    for (const opacity of opacities) expect(opacity).toBeGreaterThanOrEqual(0.25);
  });
});
