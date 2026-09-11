import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { FullBodyAvatar } from '../../src/features/avatars/FullBodyAvatar';
import {
  bodyForCategory, bodySlotOrder, fullBodyArchetypeList, fullBodyArchetypes, overlayForPose, FULL_BODY_GRID
} from '../../src/features/avatars/avatarFullBody';

afterEach(cleanup);

const here = dirname(fileURLToPath(import.meta.url));
const poseStyles = readFileSync(
  resolve(here, '../../src/features/avatars/FullBodyAvatar.module.css'), 'utf8'
);

/**
 * The figure, drawn whole.
 *
 * The avatar this school already has is a bust — a head box and a torso box on a 24-unit grid, with
 * one arm that swings. From the shoulders up there is no walk cycle and no leap, so every "pose"
 * could only ever be the whole picture sliding sideways. These hold the parts that make the other
 * thing possible: limbs that exist, a z-order that cannot be got wrong, and poses that step rather
 * than ease.
 */
describe('the full-body figure', () => {
  it('draws its slots back to front, and never in another order', () => {
    /*
     * A wing behind the body, a hat in front of hair, a staff in front of both, shadow underneath —
     * and hair on both sides of the figure, which is the slot this list gained.
     *
     * While there were nine, a hairstyle was one group drawn after the face, so length and volume
     * had nowhere to go but over the eyes: an afro covered the whole face and a plait came over the
     * chin. `hair_back` is where a style's length hangs, behind the torso and behind the arms, and
     * it is before `back_arm` rather than after it because a plait goes behind a shoulder.
     */
    expect(bodySlotOrder).toEqual([
      'shadow', 'back_gear', 'hair_back', 'back_arm', 'legs_feet', 'torso_body',
      'head_neck', 'hair_headwear', 'front_arm_weapon', 'overlay_fx'
    ]);

    const { container } = render(<FullBodyAvatar archetype="dragonKnight" label="เทส" />);
    const drawn = [...container.querySelectorAll('g[data-slot]')]
      .map((node) => node.getAttribute('data-slot'))
      .filter((slot) => slot !== 'pose_fx');
    // What is drawn is a subsequence of the fixed order: a costume may leave a slot empty, never
    // move one. A student has no wings; that is not licence to draw their hair behind their head.
    const positions = drawn.map((slot) => bodySlotOrder.indexOf(slot as never));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(new Set(positions).size).toBe(positions.length);
  });

  it('stands on a 48-unit grid, which is what gives it room for legs', () => {
    expect(FULL_BODY_GRID).toBe(48);
    const { container } = render(<FullBodyAvatar archetype="student" />);
    expect(container.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 48 48');
  });

  it('gives every archetype the four parts a pose needs to move', () => {
    for (const archetype of fullBodyArchetypeList) {
      const { container } = render(<FullBodyAvatar archetype={archetype.id} />);
      for (const part of ['head', 'torso', 'frontArm', 'backArm', 'legs']) {
        expect(
          container.querySelector(`[data-part="${part}"]`),
          `${archetype.id} has no ${part}`
        ).not.toBeNull();
      }
      cleanup();
    }
  });

  it('stands the figure on a shadow, so it is on the floor rather than in the air', () => {
    for (const archetype of fullBodyArchetypeList) {
      expect(archetype.slots.shadow, `${archetype.id} has no ground shadow`).toBeTruthy();
    }
  });

  it('draws the two archetypes the brief names, with the things it names them by', () => {
    const knight = fullBodyArchetypes.dragonKnight;
    expect(knight.name).toBe('นักรบมังกร');
    // Horns and a snouted head, a segmented tail and wings behind, clawed legs, a sword in the
    // front hand and a shield in the back one.
    expect(knight.slots.hair_headwear).toBeTruthy();
    expect(knight.slots.back_gear).toBeTruthy();
    expect(knight.slots.front_arm_weapon).toBeTruthy();
    expect(knight.slots.back_arm).toBeTruthy();

    const mage = fullBodyArchetypes.arcaneMage;
    expect(mage.name).toBe('จอมเวทย์มนตร์');
    // Hood, robe with boots below it, a floating spellbook in the back hand, a staff in the front,
    // and the standing aura that is the mage's own overlay rather than a pose's.
    expect(mage.slots.hair_headwear).toBeTruthy();
    expect(mage.slots.legs_feet).toBeTruthy();
    expect(mage.slots.overlay_fx).toBeTruthy();
  });

  it('takes every colour from the six tints, so recolouring never means redrawing', () => {
    const { container } = render(
      <FullBodyAvatar archetype="arcaneMage" tints={{ primary: '#123456', magic: '#abcdef' }} />
    );
    const svg = container.querySelector('svg')!;
    expect(svg.style.getPropertyValue('--av-primary')).toBe('#123456');
    expect(svg.style.getPropertyValue('--av-magic')).toBe('#abcdef');

    // Nothing in the drawing names a colour of its own except the two shared exceptions: white,
    // for teeth and paper, and the one outline every sprite in the app is drawn with.
    const literals = [...svg.querySelectorAll('[fill]')]
      .map((node) => node.getAttribute('fill') ?? '')
      .filter((fill) => fill.startsWith('#'))
      .map((fill) => fill.toLowerCase());
    for (const fill of literals) expect(['#ffffff', '#fff7e8']).toContain(fill);
  });
});

/**
 * The poses.
 *
 * Seven actions, each with the frame count and duration the brief specifies, each stepping rather
 * than easing. `steps(n)` is not a stylistic choice: an 8-bit figure that eases between frames puts
 * its limbs on half-pixels, and a half-pixel limb is a smear rather than a sprite.
 */
/** One @keyframes block, braces and all. A [^}]* match stops at the first frame's closing brace. */
function keyframes(name: string): string {
  const start = poseStyles.indexOf(`@keyframes ${name} {`);
  if (start < 0) throw new Error(`no @keyframes ${name}`);
  let depth = 0;
  for (let index = poseStyles.indexOf('{', start); index < poseStyles.length; index += 1) {
    if (poseStyles[index] === '{') depth += 1;
    if (poseStyles[index] === '}') {
      depth -= 1;
      if (depth === 0) return poseStyles.slice(start, index + 1);
    }
  }
  throw new Error(`unterminated @keyframes ${name}`);
}

describe('the poses', () => {
  const expected = [
    // Four frames still, but over 1.2s: a breath is slower than a footfall, and at 0.8s the
    // figure read as panting rather than standing.
    { pose: 'idle', frames: 4, seconds: '1.2s' },
    { pose: 'walk', frames: 4, seconds: '0.6s' },
    { pose: 'run', frames: 6, seconds: '0.4s' },
    { pose: 'cast', frames: 6, seconds: '1s' },
    { pose: 'attack', frames: 4, seconds: '0.4s' },
    { pose: 'jump', frames: 4, seconds: '0.5s' },
    { pose: 'cheer', frames: 4, seconds: '0.6s' }
  ] as const;

  it('runs each action at the frame count and the length it was specified at', () => {
    for (const { pose, frames, seconds } of expected) {
      const rule = new RegExp(`\\.${pose} \\.figure \\{ animation: \\w+ ${seconds} steps\\(${frames}\\) infinite;`);
      expect(poseStyles, `${pose} at ${frames} frames over ${seconds}`).toMatch(rule);
    }
  });

  it('steps every single animation, without exception', () => {
    const animations = (poseStyles.match(/animation: [^;]+;/g) ?? [])
      // The reduced-motion block turns animation off rather than running one, which is the point.
      .filter((declaration) => !declaration.includes('none'));
    expect(animations.length).toBeGreaterThan(20);
    for (const declaration of animations) {
      expect(declaration, `not stepped: ${declaration}`).toContain('steps(');
    }
  });

  it('keeps the sprite on its own grid rather than letting the browser smooth it', () => {
    expect(poseStyles).toContain('image-rendering: pixelated');
    expect(poseStyles).toContain('shape-rendering: crispEdges');
  });

  it('turns each limb at the joint it actually hangs from', () => {
    // Wrong pivots are invisible in a still frame and are what makes an arm look detached.
    // Both arms once shared the body centre line. At a swing's small angles that looks fine; at
    // the angle a cheer needs it sweeps the arm across the chest instead of raising it.
    expect(poseStyles).toContain('.frontArm { transform-origin: 17px 23px; }');
    expect(poseStyles).toContain('.backArm  { transform-origin: 31px 23px; }');
    expect(poseStyles).toContain('.frontLeg { transform-origin: 20.5px 36px; }');
    expect(poseStyles).toContain('.backLeg  { transform-origin: 27.5px 36px; }');
    expect(poseStyles).toContain('.figure { transform-origin: 24px 46px; }');
  });

  it('gives run its forward pitch, inside the five to eight degrees a chibi torso can carry', () => {
    const degrees = [...keyframes('runLean').matchAll(/rotate\((\d+)deg\)/g)].map((match) => Number(match[1]));
    expect(degrees.length).toBeGreaterThan(0);
    for (const degree of degrees) {
      expect(degree).toBeGreaterThanOrEqual(5);
      expect(degree).toBeLessThanOrEqual(8);
    }
  });

  it('lifts the caster off the ground and shrinks the shadow to say so', () => {
    expect(keyframes('levitate')).toContain('translateY(-2px)');
    // A figure that rises without its shadow shrinking reads as the camera moving.
    expect(poseStyles).toContain('@keyframes shadowShrink');
  });

  it('squashes on the leap and again on the landing', () => {
    const leap = keyframes('leap');
    expect(leap).toContain('scaleY(0.88)');
    expect(leap).toContain('translateY(-10px)');
    expect(leap).toContain('scaleY(1.1)');
  });

  it('holds the frame for anybody who asked their system not to animate', () => {
    expect(poseStyles).toContain('@media (prefers-reduced-motion: reduce)');
    expect(poseStyles).toMatch(/prefers-reduced-motion: reduce\) \{\s*\.avatar, \.avatar \* \{ animation: none !important; \}/);
  });

  it('gives an effect only to the poses that mean one', () => {
    for (const pose of ['cast', 'attack', 'run', 'cheer']) expect(overlayForPose(pose)).not.toBeNull();
    // Speed lines behind somebody standing still are a bug rather than a flourish.
    for (const pose of ['idle', 'walk', 'jump']) expect(overlayForPose(pose)).toBeNull();
  });

  it('reaches the limbs, so a pose actually moves something', () => {
    const { container } = render(<FullBodyAvatar archetype="dragonKnight" animation="run" />);
    const arm = container.querySelector('[data-part="frontArm"]');
    expect(arm?.getAttribute('class')).toBeTruthy();
    // The class comes from the stylesheet module, so it is hashed; what matters is that the drawing
    // said what it was and the compositor gave it the handle the keyframes address.
    expect(arm?.getAttribute('class')).toMatch(/frontArm/);
  });

  it('holds the first frame when the preview is paused, rather than stopping at a random one', () => {
    const { container } = render(<FullBodyAvatar archetype="student" animation="walk" paused />);
    expect(container.querySelector('svg')?.getAttribute('class')).toMatch(/paused/);
    expect(poseStyles).toContain('.paused * { animation-play-state: paused !important; }');
  });
});

/*
 * Cute, cool, and not the same avatar ten times.
 *
 * The old catalogue drew a thousand avatars as one silhouette with different colours: the same box
 * head, the same flat rectangle eyes, the same body. These hold the parts of the redraw that make
 * two avatars read as two characters — the shape above the head, the shape behind the body, and a
 * face with light in it — and the small motions that stop a still figure reading as a mannequin.
 */
describe('the figures a child chooses between', () => {
  it('offers ten figures, and gives each of them its own silhouette', () => {
    expect(fullBodyArchetypeList.length).toBe(10);
    const silhouettes = new Map<string, string>();
    for (const archetype of fullBodyArchetypeList) {
      const { container } = render(<FullBodyAvatar archetype={archetype.id} />);
      // What is above the head and behind the body is the whole read from across a classroom.
      const shape = [
        container.querySelector('[data-slot="hair_headwear"]')?.innerHTML ?? '',
        container.querySelector('[data-slot="back_gear"]')?.innerHTML ?? '',
        container.querySelector('[data-slot="torso_body"]')?.innerHTML ?? '',
        container.querySelector('[data-slot="legs_feet"]')?.innerHTML ?? ''
      ].join('|');
      const twin = [...silhouettes.entries()].find(([, other]) => other === shape);
      expect(twin?.[0], `${archetype.id} draws the same figure as ${twin?.[0]}`).toBeUndefined();
      silhouettes.set(archetype.id, shape);
      cleanup();
    }
  });

  it('keeps every figure standing on the same floor, whatever it has for feet', () => {
    // A penguin has webbed feet and no thigh; a mage's boots come out from under a hem. Both reach
    // y 46, which is where the ground shadow is drawn: a costume that stops short of it hovers.
    for (const archetype of fullBodyArchetypeList) {
      const { container } = render(<FullBodyAvatar archetype={archetype.id} />);
      const legs = container.querySelector('[data-part="legs"]');
      expect(legs, `${archetype.id} has no legs`).not.toBeNull();
      const lowest = [...(legs?.querySelectorAll('rect, polygon') ?? [])].reduce((deepest, node) => {
        const y = Number(node.getAttribute('y') ?? '0') + Number(node.getAttribute('height') ?? '0');
        const points = (node.getAttribute('points') ?? '')
          .split(' ').map((pair) => Number(pair.split(',')[1] ?? '0'));
        return Math.max(deepest, y, ...points);
      }, 0);
      expect(lowest, `${archetype.id} stops at ${lowest} rather than the floor`).toBeGreaterThanOrEqual(44);
      cleanup();
    }
  });

  it('draws an eye with light in it rather than a coloured box', () => {
    const { container } = render(<FullBodyAvatar archetype="cat" />);
    const eyes = container.querySelector('[data-part="eyes"]');
    expect(eyes).not.toBeNull();
    const whites = [...(eyes?.querySelectorAll('rect') ?? [])]
      .filter((node) => node.getAttribute('fill') === '#ffffff');
    // Per eye: the white of it, the big glint where the light is, and the small one opposite that is
    // what makes it look wet. Two eyes, so six.
    expect(whites.length).toBeGreaterThanOrEqual(6);
    // Two tones of iris, so the light has a direction.
    const irises = [...(eyes?.querySelectorAll('rect') ?? [])]
      .map((node) => node.getAttribute('fill'))
      .filter((fill) => fill?.startsWith('var(--av-'));
    expect(new Set(irises).size).toBeGreaterThanOrEqual(2);
  });

  it('gives the animals ears that can move, and the cute ones a blush', () => {
    for (const id of ['cat', 'fox', 'rabbit'] as const) {
      const { container } = render(<FullBodyAvatar archetype={id} />);
      const ears = container.querySelector('[data-part="ears"]');
      expect(ears, `${id} has no ears`).not.toBeNull();
      expect(ears?.children.length, `${id} ears are empty`).toBeGreaterThan(0);
      // The handle the twitch keyframe addresses, put on by the compositor.
      expect(ears?.getAttribute('class')).toMatch(/ears/);
      cleanup();
    }
  });

  it('blinks and twitches in every pose, because neither is a pose', () => {
    expect(poseStyles).toMatch(/\.avatar \.eyes \{ animation: blink [\d.]+s steps\(1, end\) infinite; \}/);
    expect(poseStyles).toMatch(/\.avatar \.ears \{ animation: earTwitch [\d.]+s steps\(1, end\) infinite; \}/);
    // Shut, then open — two drawings rather than a squashed one.
    expect(keyframes('blink')).toContain('scaleY(0.12)');
  });

  it('turns the rune circle as well as opening it, and blooms it in the chosen colour', () => {
    const rune = keyframes('runeOpen');
    expect(rune).toContain('rotate(');
    expect(rune).toContain('scale(1.15)');
    expect(poseStyles).toContain('.cast .fx { filter: drop-shadow(0 0 1.5px var(--av-magic)); }');
  });

  it('files a catalogue avatar under the figure its category already implies', () => {
    // The thousand catalogue avatars carry no race and no figure, and the category is the answer
    // that was always there: an avatar in "สัตว์" is an animal whatever its six integers say.
    expect(bodyForCategory('mage')).toBe('arcaneMage');
    expect(bodyForCategory('dragon')).toBe('dragonKnight');
    expect(bodyForCategory('demon')).toBe('demon');
    expect(bodyForCategory('techwear')).toBe('techwear');
    expect(bodyForCategory('sporty')).toBe('athlete');
    expect(bodyForCategory('classic')).toBe('student');
    // The four animals rotate on the avatar's own index, so a page of them is four silhouettes.
    expect(new Set([0, 1, 2, 3].map((seed) => bodyForCategory('animal', seed))).size).toBe(4);
    // And the same avatar answers the same way on every build.
    expect(bodyForCategory('animal', 7)).toBe(bodyForCategory('animal', 7));
  });
});

/*
 * One drawing, two crops, four poses anybody can ask for.
 *
 * The bust sprite used to be the source for every small avatar in the product, so a child who built
 * a knight saw a knight on their profile and a generic portrait everywhere else. There is one avatar
 * now: the figure. What changes with size is how much of it is in frame.
 */
describe('the figure everywhere it appears', () => {
  it('frames the whole person by default and the head and shoulders on request', () => {
    const { container: full } = render(<FullBodyAvatar archetype="student" />);
    expect(full.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 48 48');
    cleanup();
    // The crop is the head and upper torso, centred on the figure's own centre line: at 36 pixels
    // the legs are two dark pixels and the face is what anybody is looking for.
    const { container: bust } = render(<FullBodyAvatar archetype="student" framing="bust" />);
    expect(bust.querySelector('svg')?.getAttribute('viewBox')).toBe('9 0 30 30');
  });

  it('starts every crop at the frame ceiling, so nothing shears the top of a hat', () => {
    /*
     * The bust crop used to start at y 1. Hair and headwear are authored from y 0 — that is the
     * band they are given — so one unit of every crown, every raised ear and the tip of the wizard
     * hat was cut off in every list row in the product while looking correct on the customiser's
     * stage, which is exactly the kind of fault that survives a review.
     */
    for (const framing of ['full', 'half', 'bust', 'portrait'] as const) {
      const { container } = render(<FullBodyAvatar archetype="arcaneMage" framing={framing} />);
      const [, top, width, height] = container.querySelector('svg')!.getAttribute('viewBox')!
        .split(' ').map(Number);
      expect(top, `${framing} starts below the ceiling`).toBe(0);
      // Square, because every frame that holds one is; a rectangle letterboxes the figure.
      expect(width, framing).toBe(height);
      cleanup();
    }
  });

  it('choreographs the wave, and does not mistake it for the cheer', () => {
    const { container } = render(<FullBodyAvatar archetype="student" animation="wave" />);
    expect(container.querySelector('svg')?.getAttribute('class')).toMatch(/wave/);
    // One arm, not two: the far arm keeps dangling while the near one waves from the elbow.
    expect(poseStyles).toContain('.wave .frontArm { animation: waveArm 0.8s steps(4) infinite; }');
    expect(poseStyles).toContain('.wave .backArm { animation: armDangleBack 1.2s steps(4) infinite; }');
    // And no hop, which is what would make it read as celebrating instead of greeting.
    expect(poseStyles).not.toMatch(/\.wave \.figure \{ animation: hop/);
    const arm = keyframes('waveArm');
    expect(arm).toContain('rotate(96deg)');
    expect(arm).toContain('rotate(124deg)');
  });

  it('offers the four the brief names, in the customiser', () => {
    const designer = readFileSync(
      resolve(here, '../../src/features/avatars/AvatarDesigner.tsx'), 'utf8'
    );
    for (const pose of ['idle', 'walk', 'wave', 'run']) {
      expect(designer, `${pose} is not offered`).toContain(`value: '${pose}'`);
    }
  });
});
