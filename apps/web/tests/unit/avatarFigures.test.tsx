import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  AVATAR_FIGURE_COUNT, avatarFigures, figureCategoryLabels, figureCountsByCategory,
  figureMatching, searchFigures, type FigureCategory
} from '../../src/features/avatars/avatarFigures';
import { figurePartTables, figureSlotsFor } from '../../src/features/avatars/avatarFigureParts';
import { FullBodyAvatar } from '../../src/features/avatars/FullBodyAvatar';
import {
  missingPieces, traitById, traitCounts, traitPiecePrice, traits
} from '../../src/features/avatars/avatarTraits';
import { layerOrder } from '../../src/features/avatars/avatarSchema';

afterEach(cleanup);

/** The trait ids of one layer, which is what several of these walk. */
const traitIdsByLayer: Record<string, string[]> = traits.reduce<Record<string, string[]>>((index, trait) => {
  index[trait.layer] = [...(index[trait.layer] ?? []), trait.id];
  return index;
}, {});

const traitCountsFor = (layer: string): string[] => traitIdsByLayer[layer] ?? [];

/*
 * The characters a child can be, and the pieces they are made of.
 *
 * Two things were wrong before this and they were the same thing twice. The figure drew ten fixed
 * costumes and knew nothing about the wardrobe, so every drawer in the customiser changed a portrait
 * in a class list and left the character on the stage alone. And the catalogue was a thousand busts:
 * pick one and there was nothing left to take apart. What follows holds the repair — a build is a
 * race, a layer per slot and six colours, the figure draws exactly that, and the list of finished
 * builds is long enough and varied enough to be worth calling a choice.
 */
describe('the figures a child can choose', () => {
  it('offers more than two hundred, and no two of them are the same build', () => {
    expect(AVATAR_FIGURE_COUNT).toBeGreaterThanOrEqual(200);
    // Same-looking figures are the failure mode of a generated list: a blueprint crossed with four
    // palettes is four figures only if the palette actually changes something. The signature is the
    // layers and the colours together, which is what a person sees.
    const signatures = new Set(avatarFigures.map((figure) => JSON.stringify([figure.config.layers, figure.config.tints])));
    expect(signatures.size).toBe(AVATAR_FIGURE_COUNT);
    // And no two share a name, because a name is what one child says to another.
    expect(new Set(avatarFigures.map((figure) => figure.name)).size).toBe(AVATAR_FIGURE_COUNT);
    expect(new Set(avatarFigures.map((figure) => figure.id)).size).toBe(AVATAR_FIGURE_COUNT);
  });

  it('covers every kind of character the school asked for', () => {
    const counts = figureCountsByCategory();
    for (const category of Object.keys(figureCategoryLabels) as FigureCategory[]) {
      expect(counts[category], `${category} has no figures`).toBeGreaterThan(0);
    }
    // The animals were named individually, so they are checked individually rather than as a heap.
    for (const animal of ['แมว', 'จิ้งจอก', 'แพนด้า', 'กระต่าย', 'สุนัข', 'เพนกวิน']) {
      expect(
        avatarFigures.some((figure) => figure.tags.includes(animal)),
        `no ${animal}`
      ).toBe(true);
    }
  });

  it('names only pieces that exist', () => {
    // A typo in a blueprint is a figure with a missing garment, and it would look like a rendering
    // bug rather than a data one. Every trait id in every build has to resolve.
    for (const figure of avatarFigures) {
      for (const [slot, traitId] of Object.entries(figure.config.layers ?? {})) {
        expect(layerOrder, `${figure.id} names an unknown slot ${slot}`).toContain(slot);
        expect(traitById(traitId), `${figure.id} names an unknown trait ${traitId}`).not.toBeNull();
      }
    }
  });

  it('draws every figure as a whole person, with the parts a pose needs to move', () => {
    for (const figure of avatarFigures) {
      const { container } = render(
        <FullBodyAvatar archetype={figure.body} slots={figureSlotsFor(figure.config)} tints={figure.config.tints} />
      );
      for (const part of ['head', 'torso', 'frontArm', 'backArm', 'legs']) {
        expect(container.querySelector(`[data-part="${part}"]`), `${figure.id} has no ${part}`).not.toBeNull();
      }
      cleanup();
    }
  });

  it('finds a figure by what somebody would type, in either language', () => {
    expect(searchFigures('มังกร').length).toBeGreaterThan(0);
    expect(searchFigures('dragon').length).toBeGreaterThan(0);
    expect(searchFigures('', 'scientist').every((figure) => figure.category === 'scientist')).toBe(true);
    // An empty query is the whole list rather than nothing.
    expect(searchFigures('').length).toBe(AVATAR_FIGURE_COUNT);
    expect(searchFigures('ไม่มีคำนี้อยู่จริง')).toEqual([]);
  });

  it('recognises a build it has already seen, colours included', () => {
    const violet = avatarFigures[3]!;
    expect(figureMatching(violet.config)?.id).toBe(violet.id);
    // Four figures from one blueprint share their layers and differ only in the six colours, so a
    // match on layers alone reported all four as the same one: pressing the violet knight marked the
    // blue one as worn.
    const sameLayers = avatarFigures.filter(
      (figure) => JSON.stringify(figure.config.layers) === JSON.stringify(violet.config.layers)
    );
    expect(sameLayers.length).toBeGreaterThan(1);
    for (const figure of sameLayers) expect(figureMatching(figure.config)?.id).toBe(figure.id);
    // A build nobody made is nobody's figure, which is what "แบบที่แก้เอง" means on screen.
    expect(figureMatching({ ...violet.config, tints: { ...violet.config.tints, hair: '#123456' } })).toBeNull();
  });
});

/*
 * What can be changed, and how much of it there is.
 *
 * The brief asks for more than a thousand ways to decorate one character. That number is not a
 * marketing figure — it is the product of the drawers, and it is only real if every one of those
 * choices reaches the figure. The first half of this checks the arithmetic; the second checks that
 * the slots actually arrive at the drawing.
 */
describe('what a figure can be decorated with', () => {
  it('multiplies out to far more than a thousand builds', () => {
    const counts = traitCounts();
    const combinations = layerOrder
      .filter((layer) => layer !== 'body_base')
      .reduce((total, layer) => total * Math.max(counts[layer] ?? 1, 1), 1);
    expect(combinations).toBeGreaterThan(1000);
  });

  it('offers a real choice in every drawer, and the big ones are twenty deep', () => {
    const counts = traitCounts();
    for (const layer of layerOrder) {
      expect(counts[layer] ?? 0, `${layer} is empty`).toBeGreaterThan(0);
    }
    // Where the brief asks for twenty, there are twenty: the clothes, the hair and the face, which
    // are the three drawers anybody opens first.
    expect(counts.top_clothing).toBeGreaterThanOrEqual(20);
    expect(counts.hair_headpiece).toBeGreaterThanOrEqual(20);
    expect(counts.face_features).toBeGreaterThanOrEqual(20);
  });

  it('has somewhere to draw every piece the drawers offer', () => {
    /*
     * The translation from a trait id to a drawing on the 48-grid is a table, and a table with a
     * hole in it is a garment that silently does not appear. Bodies are excluded: the race decides
     * the silhouette, and `body_base` exists for the bust.
     */
    const tables: Record<string, Record<string, unknown>> = {
      top_clothing: figurePartTables.tops,
      bottom_clothing: figurePartTables.legStyles,
      back_accessory: figurePartTables.backGear,
      front_accessory: figurePartTables.heldItems,
      back_aura: figurePartTables.auras,
      front_fx: figurePartTables.effects
    };
    for (const [layer, table] of Object.entries(tables)) {
      for (const trait of traitCountsFor(layer)) {
        const base = trait.slice(trait.indexOf('_') + 1).split('__')[0]!;
        expect(table[base], `${layer}: nothing draws ${base}`).toBeTruthy();
      }
    }
    // The two composed layers: a hair shape with something worn over it, and a face with eyewear.
    for (const trait of traitCountsFor('hair_headpiece')) {
      const [shape, worn] = trait.slice(trait.indexOf('_') + 1).split('__');
      expect(figurePartTables.hairStyles[shape!], `nothing draws hair ${shape}`).toBeTruthy();
      if (worn) expect(figurePartTables.headpieces[worn], `nothing draws ${worn}`).toBeTruthy();
    }
    for (const trait of traitCountsFor('face_features')) {
      const [eyes, worn] = trait.slice(trait.indexOf('_') + 1).split('__');
      expect(figurePartTables.faceStyles[eyes!], `nothing draws eyes ${eyes}`).toBeTruthy();
      if (worn) expect(figurePartTables.eyewear[worn], `nothing draws ${worn}`).toBeTruthy();
    }
  });
});

/*
 * The premium pieces, which had prices and no till.
 *
 * `avatar_trait_price` has costed a wizard hat at 80 points since the customiser shipped, and
 * `set_own_avatar_config` refuses to save a piece nobody bought — but the only redemption function
 * priced its argument with `outfit_price`, which knows four outfits and no traits. So every priced
 * piece in the app was shown, costed, and impossible to own.
 */
describe('the pieces that cost points', () => {
  it('sells the halves rather than the combination', () => {
    const hatOnBob = traitById('hair_bob__wizardhat')!;
    const hatOnLong = traitById('hair_long__wizardhat')!;
    // One hat, one price, wearable with either haircut once it is bought.
    expect(hatOnBob.unlockKeys).toEqual(['wizardhat']);
    expect(hatOnLong.unlockKeys).toEqual(['wizardhat']);
    expect(traitPiecePrice('wizardhat')).toBe(80);
    expect(missingPieces(hatOnBob, new Set(['wizardhat']))).toEqual([]);
    expect(missingPieces(hatOnLong, new Set())).toEqual(['wizardhat']);
  });

  it('gives every priced trait a piece to buy, and every free one nothing', () => {
    for (const layer of layerOrder) {
      for (const traitId of traitCountsFor(layer)) {
        const trait = traitById(traitId)!;
        if (trait.price) {
          expect(trait.unlockKeys?.length, `${traitId} costs ${trait.price} and sells nothing`).toBeGreaterThan(0);
          const sum = (trait.unlockKeys ?? []).reduce((total, key) => total + traitPiecePrice(key), 0);
          expect(sum, `${traitId} price does not add up`).toBe(trait.price);
        } else {
          expect(trait.unlockKeys ?? [], `${traitId} is free and sells something`).toEqual([]);
        }
      }
    }
  });
});

