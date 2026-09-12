import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { figureSlotsFor } from '../../src/features/avatars/avatarFigureParts';
import { traits } from '../../src/features/avatars/avatarTraits';
import type { AvatarConfigV2 } from '../../src/features/avatars/avatarSchema';

/*
 * An aura is light, and light does not hold still.
 *
 * Every one of the sixteen was a drawing painted once behind the figure: a ring of fire that never
 * flickered, embers that never rose, an aurora hanging there like a printed stripe. The complaint
 * was that the figures looked stiff, and this was most of it — the moving parts of a character are
 * its limbs and its light, and only one of the two was moving.
 *
 * Two things have to line up for an aura to move, and they live in different files: the drawing has
 * to name a motion (`data-part="auraRise"`), and the stylesheet has to define it. Either one alone
 * is silent — a part with no rule simply stands still, which is the state this is here to catch.
 */

const cssPath = [
  'apps/web/src/features/avatars/FullBodyAvatar.module.css',
  'src/features/avatars/FullBodyAvatar.module.css'
].map((candidate) => resolve(candidate)).find((candidate) => existsSync(candidate))!;
const css = readFileSync(cssPath, 'utf8');

/** The five motions an aura may ask for. */
const motions = ['auraPulse', 'auraRise', 'auraSway', 'auraSpin', 'auraFlicker'];

const auraTraits = traits.filter((trait) => trait.layer === 'back_aura' && trait.id !== 'aura_none');

function markupFor(auraId: string): string {
  const config: AvatarConfigV2 = {
    archetype: 0, palette: 0, skinTone: 0, hair: 0, accessory: 0, badge: 0,
    v: 2, race: 'human', layers: { back_aura: auraId }
  };
  const slots = figureSlotsFor(config);
  return renderToStaticMarkup(<>{slots.overlay_fx}</>);
}

describe('auras that move', () => {
  it('offers a rule for every motion a drawing can name', () => {
    for (const motion of motions) {
      expect(css.includes(`.${motion}`), motion).toBe(true);
      expect(css.includes(`@keyframes ${motion}`), `@keyframes ${motion}`).toBe(true);
    }
  });

  it('gives every aura in the wardrobe something that moves', () => {
    // Named one at a time, so a failure says which aura went still rather than that one of sixteen
    // did.
    for (const trait of auraTraits) {
      const markup = markupFor(trait.id);
      expect(markup.length, trait.id).toBeGreaterThan(0);
      const moving = motions.some((motion) => markup.includes(`data-part="${motion}"`));
      expect(moving, trait.id).toBe(true);
    }
  });

  it('keeps the motion inside the aura rather than on the figure', () => {
    /*
     * The whole point of putting the motion on a child group: an aura that animated the slot itself
     * would be animating the group the compositor gives to the pose, and the first keyframe of any
     * pose would silently replace it.
     */
    const markup = markupFor('aura_ember');
    expect(markup).toContain('<g data-part="fx"');
    // The motion group is inside the part the compositor hands to the pose, never the part itself.
    expect(markup.indexOf('data-part="auraRise"')).toBeGreaterThan(markup.indexOf('data-part="fx"'));
  });

  it('costs nothing on a row of small avatars', () => {
    // The compact tier already drops the aura's drawing; it has to drop its animation too, or forty
    // leaderboard rows each hold a compositing layer for something nobody can see.
    const compactRule = /\.compact \.auraPulse[^}]+animation: none/.exec(css)?.[0] ?? '';
    expect(compactRule).toContain('animation: none');
  });

  it('stands still for somebody who asked for no motion', () => {
    // The blanket rule covers every animation on the figure, the new ones included.
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.avatar, \.avatar \* \{ animation: none/);
  });
});
