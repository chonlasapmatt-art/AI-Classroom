import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { FullBodyAvatar } from '../../src/features/avatars/FullBodyAvatar';
import { figureSlotsFor } from '../../src/features/avatars/avatarFigureParts';
import { hairFor, hairStyleIds } from '../../src/features/avatars/avatarHair';
import {
  bodyArchetypeFor, bodySlotOrder, fullBodyArchetypeList, type FullBodyArchetype
} from '../../src/features/avatars/avatarFullBody';
import { FIGURE_BOUNDS } from '../../src/features/avatars/avatarGeometry';
import type { AvatarConfigV2, AvatarRace } from '../../src/features/avatars/avatarSchema';

afterEach(cleanup);

const races: AvatarRace[] = ['human', 'dragonkin', 'demon', 'beastfolk', 'spirit', 'robot'];

/**
 * A box in grid units. Everything a drawing puts on the page reduces to one of these, which is what
 * lets a test say "nothing is above the frame" without knowing what shape said it.
 */
interface Box { left: number; top: number; right: number; bottom: number }

function boxesIn(root: Element): Box[] {
  const boxes: Box[] = [];
  for (const node of root.querySelectorAll('rect, circle, ellipse, polygon')) {
    const number = (name: string) => Number(node.getAttribute(name) ?? '0');
    if (node.tagName === 'rect') {
      boxes.push({
        left: number('x'), top: number('y'),
        right: number('x') + number('width'), bottom: number('y') + number('height')
      });
    } else if (node.tagName === 'circle') {
      const [cx, cy, r] = [number('cx'), number('cy'), number('r')];
      boxes.push({ left: cx - r, top: cy - r, right: cx + r, bottom: cy + r });
    } else if (node.tagName === 'ellipse') {
      const [cx, cy, rx, ry] = [number('cx'), number('cy'), number('rx'), number('ry')];
      boxes.push({ left: cx - rx, top: cy - ry, right: cx + rx, bottom: cy + ry });
    } else {
      const points = (node.getAttribute('points') ?? '').trim().split(/\s+/)
        .map((pair) => pair.split(',').map(Number))
        .filter((pair) => pair.length === 2 && pair.every((value) => Number.isFinite(value)));
      if (points.length === 0) continue;
      const xs = points.map((pair) => pair[0]!);
      const ys = points.map((pair) => pair[1]!);
      boxes.push({
        left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys)
      });
    }
  }
  return boxes;
}

/** Every vertex a polygon names, so a test can ask where a fringe actually ends. */
function verticesIn(root: Element): Array<[number, number]> {
  return [...root.querySelectorAll('polygon')].flatMap((node) =>
    (node.getAttribute('points') ?? '').trim().split(/\s+/)
      .map((pair) => pair.split(',').map(Number) as [number, number])
      .filter((pair) => pair.length === 2 && pair.every(Number.isFinite)));
}

/** The two eye boxes `headNeck` draws, which is what "hair over the face" has to be measured against. */
const eyeBoxes: Box[] = [
  { left: 18.25, top: 9.75, right: 22.25, bottom: 15 },
  { left: 25.75, top: 9.75, right: 29.75, bottom: 15 }
];

const inside = (x: number, y: number, box: Box) =>
  x > box.left && x < box.right && y > box.top && y < box.bottom;

function configWith(race: AvatarRace, hair: string): AvatarConfigV2 {
  return {
    archetype: 0, palette: 0, skinTone: 0, hair: 0, accessory: 0, badge: 0,
    v: 2, race, layers: { hair_headpiece: `hair_${hair}` }
  };
}

/*
 * Hair.
 *
 * Four separate complaints — hair floating above the head, hair through the face, a head poking
 * through its own hair, and ears buried under a cap — were one fault: hair was a single drawing
 * made after the face, so there was nowhere for length or volume to go except over the eyes, and
 * nothing stopping a crown being authored above the frame. These hold the shape of the fix.
 */
describe('the hair system', () => {
  it('draws every style on every race, and answers for a style it has never heard of', () => {
    for (const race of races) {
      for (const id of [...hairStyleIds, 'a-style-from-a-later-build', undefined]) {
        const { front } = hairFor(id as string | undefined, race);
        const { container } = render(<svg>{front}</svg>);
        expect(container.querySelectorAll('rect, polygon, circle, ellipse').length, `${race}/${id}`)
          .toBeGreaterThan(0);
        cleanup();
      }
    }
  });

  it('keeps every part of every style inside the frame', () => {
    /*
     * The ceiling is y 0 because the frame's own top edge is 0. A bun at y −1, a mohawk at −3 and an
     * afro at −6 all looked correct on a stage that does not clip and were sheared off everywhere
     * else in the product — and once the frames clip, what is above the ceiling is simply gone.
     */
    for (const race of races) {
      for (const id of hairStyleIds) {
        const { back, front } = hairFor(id, race);
        const { container } = render(<svg>{back}{front}</svg>);
        for (const box of boxesIn(container)) {
          expect(box.top, `${race}/${id} reaches y ${box.top}`).toBeGreaterThanOrEqual(FIGURE_BOUNDS.ceiling);
          expect(box.left, `${race}/${id} reaches x ${box.left}`).toBeGreaterThanOrEqual(FIGURE_BOUNDS.left);
          expect(box.right, `${race}/${id} reaches x ${box.right}`).toBeLessThanOrEqual(FIGURE_BOUNDS.right);
        }
        cleanup();
      }
    }
  });

  it('never hangs the front of a style in an eye', () => {
    // What a fringe is allowed to do is hang at the temples. The old one dropped two triangles at
    // x 17 and x 27 — the sockets are x 18.25–22.25 and x 25.75–29.75 — so every avatar in the
    // school wore its hair through its own eyes.
    for (const race of races) {
      for (const id of hairStyleIds) {
        const { front } = hairFor(id, race);
        const { container } = render(<svg>{front}</svg>);
        for (const [x, y] of verticesIn(container)) {
          for (const eye of eyeBoxes) {
            expect(inside(x, y, eye), `${race}/${id} ends a strand at ${x},${y}`).toBe(false);
          }
        }
        for (const box of container.querySelectorAll('rect')) {
          const top = Number(box.getAttribute('y'));
          const bottom = top + Number(box.getAttribute('height'));
          const left = Number(box.getAttribute('x'));
          const right = left + Number(box.getAttribute('width'));
          const overlapsAnEye = eyeBoxes.some((eye) =>
            left < eye.right && right > eye.left && top < eye.bottom && bottom > eye.top);
          expect(overlapsAnEye, `${race}/${id} covers an eye with a ${left},${top} block`).toBe(false);
        }
        cleanup();
      }
    }
  });

  it('leaves no gap between the hair and the skull it sits on', () => {
    // The skull is x 15–33 from y 4. A cap flush with it shows a line of lit skin between the two,
    // which is the stray outline round the head; a cap narrower than it shows scalp at the temples.
    for (const race of races) {
      const { front } = hairFor('short', race);
      const { container } = render(<svg>{front}</svg>);
      const covering = boxesIn(container).filter((box) => box.top <= 4 && box.bottom >= 4);
      expect(covering.length, race).toBeGreaterThan(0);
      expect(Math.min(...covering.map((box) => box.left)), race).toBeLessThanOrEqual(15);
      expect(Math.max(...covering.map((box) => box.right)), race).toBeGreaterThanOrEqual(33);
      cleanup();
    }
  });

  it('puts length behind the figure and the cap in front of it', () => {
    // A plait that goes in front is a plait over the chin, which is where the long styles were.
    for (const id of ['long', 'ponytail', 'twintail', 'braid', 'afro', 'wavy', 'bob', 'curly']) {
      const { back } = hairFor(id, 'human');
      expect(back, `${id} has no length behind it`).not.toBeNull();
    }
    // And a cut with no length does not invent any.
    for (const id of ['short', 'buzz', 'mohawk', 'bun', 'fur']) {
      expect(hairFor(id, 'human').back, `${id} hangs something behind it`).toBeNull();
    }
  });

  it('files the two halves in the two slots, in that order', () => {
    const slots = figureSlotsFor(configWith('human', 'long'));
    expect(slots.hair_back, 'nothing went behind').toBeTruthy();
    expect(slots.hair_headwear, 'nothing went in front').toBeTruthy();
    expect(bodySlotOrder.indexOf('hair_back')).toBeLessThan(bodySlotOrder.indexOf('head_neck'));
    expect(bodySlotOrder.indexOf('head_neck')).toBeLessThan(bodySlotOrder.indexOf('hair_headwear'));
  });

  it('keeps an animal its ears whatever it has on its head', () => {
    /*
     * Ears used to be drawn inside the head, under the hair. That is fine for the ten hand-fitted
     * costumes, whose hair is cut around their own ears, and wrong for every figure a child
     * assembles: any of twelve cuts over any of six races, and an afro over a cat is a cat with no
     * ears at all. The compositor draws them after the hair instead.
     */
    for (const id of hairStyleIds) {
      const slots = figureSlotsFor(configWith('beastfolk', id));
      const { container } = render(<svg>{slots.hair_headwear}{slots.headwear}</svg>);
      const parts = [...container.querySelectorAll('[data-part]')]
        .map((node) => node.getAttribute('data-part'));
      expect(parts, `${id} loses the ears`).toContain('ears');
      // Worn and grown are two steps of the pipeline now, and the worn one is later: ears and horns
      // go over the fringe, because a fringe over a horn is a fringe hanging in mid-air.
      expect(parts.indexOf('hair'), `${id} draws ears under the hair`)
        .toBeLessThan(parts.indexOf('ears'));
      expect(bodySlotOrder.indexOf('hair_headwear')).toBeLessThan(bodySlotOrder.indexOf('headwear'));
      cleanup();
    }
  });

  it('keeps a hat, a halo and a pair of horns inside the frame over any cut', () => {
    /*
     * The combinations are where this goes wrong: each of these was authored against a bare skull
     * and looked correct there, and a wizard's hat over a mohawk is a crown on a crown. Seventy-two
     * hairstyles exist because twelve cuts multiply by six things worn on them, so this is the
     * multiplication rather than a spot check.
     */
    const worn = ['hornscurved', 'hornsdragon', 'beastears', 'wizardhat', 'halo'];
    for (const race of races) {
      for (const hair of ['short', 'bun', 'mohawk', 'afro', 'long', 'curly']) {
        for (const piece of worn) {
          const slots = figureSlotsFor({
            archetype: 0, palette: 0, skinTone: 0, hair: 0, accessory: 0, badge: 0, v: 2, race,
            layers: { hair_headpiece: `hair_${hair}__${piece}` }
          });
          const { container } = render(<svg>{slots.hair_back}{slots.hair_headwear}</svg>);
          for (const box of boxesIn(container)) {
            expect(box.top, `${race}/${hair}/${piece} reaches y ${box.top}`)
              .toBeGreaterThanOrEqual(FIGURE_BOUNDS.ceiling);
            expect(box.left, `${race}/${hair}/${piece} reaches x ${box.left}`)
              .toBeGreaterThanOrEqual(FIGURE_BOUNDS.left);
            expect(box.right, `${race}/${hair}/${piece} reaches x ${box.right}`)
              .toBeLessThanOrEqual(FIGURE_BOUNDS.right);
          }
          cleanup();
        }
      }
    }
  });

  it('draws a whole person for a record that says nothing about hair at all', () => {
    /*
     * Most saved avatars predate the hair drawer, and a bare skull is not an acceptable answer for
     * one. It used to be answered with a fallback cut, which had to be wrong for four of the six —
     * a cap over a cat's ears, a cap on a robot's plate. The character answers now: the fur between
     * a cat's ears, a visor, a helm, a head of hair for the ones that have one.
     *
     * Measured on the composed figure rather than on one slot, because the answer legitimately
     * arrives in different slots for different characters, and what matters is that the head is not
     * bare on the screen.
     */
    for (const race of races) {
      const config: AvatarConfigV2 = {
        archetype: 0, palette: 0, skinTone: 0, hair: 0, accessory: 0, badge: 0, v: 2, race,
        layers: { top_clothing: 'top_uniform' }
      };
      const body = bodyArchetypeFor(config)!;
      const { container } = render(
        <FullBodyAvatar archetype={body} slots={figureSlotsFor(config)} />
      );
      const onHead = ['hair', 'headwear', 'ears'].some((part) => container.querySelector(`[data-part="${part}"]`));
      expect(onHead, `${race} has a bare head`).toBe(true);
      cleanup();
    }
  });

  it('fits a chosen cut to the head it is going on, not to the race field', () => {
    /*
     * A cut is authored against a fit and never scaled to a skull, so the only way to put the same
     * bob on a fox and on a child is to hand it the right fit. The wardrobe used to read the race
     * field, which is `human` for everybody who has not touched it — so every one of the
     * forty-one characters wore the human cap, including the muzzled and the manufactured.
     */
    const cut = (bodyArchetype: FullBodyArchetype) => figureSlotsFor({
      archetype: 0, palette: 0, skinTone: 0, hair: 0, accessory: 0, badge: 0, v: 2,
      bodyArchetype,
      layers: { hair_headpiece: 'hair_bob' }
    });

    const child = render(<svg>{cut('student')!.hair_headwear}</svg>);
    const human = boxesIn(child.container);
    cleanup();
    const beast = render(<svg>{cut('fox')!.hair_headwear}</svg>);
    const muzzled = boxesIn(beast.container);
    cleanup();

    // The cap is the part the fit moves: whatever covers the hairline at y 4. A muzzled head wears
    // a shallower one, and measuring the whole drawing would be measuring the locks instead.
    const capBottom = (boxes: Box[]) =>
      Math.max(...boxes.filter((box) => box.top <= 4 && box.bottom >= 4).map((box) => box.bottom));
    expect(capBottom(muzzled), 'a fox wears the human cut').toBeLessThan(capBottom(human));
  });
});

/*
 * The rest of the figure, held to the same boundary.
 *
 * Hair was where it went wrong most visibly, but the rule is the figure's: a part that draws outside
 * the grid is a part that is either clipped or painted onto the row above.
 */
describe('the figure inside its frame', () => {
  it('keeps every costume inside the grid it is drawn on', () => {
    for (const archetype of fullBodyArchetypeList) {
      const { container } = render(<FullBodyAvatar archetype={archetype.id} />);
      for (const box of boxesIn(container.querySelector('svg')!)) {
        expect(box.top, `${archetype.id} draws at y ${box.top}`).toBeGreaterThanOrEqual(FIGURE_BOUNDS.ceiling);
        expect(box.left, `${archetype.id} draws at x ${box.left}`).toBeGreaterThanOrEqual(FIGURE_BOUNDS.left);
        expect(box.right, `${archetype.id} reaches x ${box.right}`).toBeLessThanOrEqual(FIGURE_BOUNDS.right);
        expect(box.bottom, `${archetype.id} reaches y ${box.bottom}`).toBeLessThanOrEqual(FIGURE_BOUNDS.floor);
      }
      cleanup();
    }
  });
});
