import { createHash } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ThemedAvatar } from '../../src/features/avatars/ThemedAvatar';
import { avatarCatalog } from '../../src/features/avatars/avatarCatalog';
import type { AvatarConfig } from '../../src/domain/types';
import pinnedFixture from '../fixtures/legacyAvatarMarkup.json';

afterEach(cleanup);

/*
 * The 160 avatars a school is already wearing.
 *
 * `students.avatar_config` holds a flat object of indexes, and `avatar_001…avatar_160` resolve to
 * looks that children chose and recognise as themselves. Any rework of the renderer has exactly one
 * hard requirement: none of them may change. A child whose avatar quietly became somebody else is
 * not a cosmetic regression — it is the app losing something they picked.
 *
 * So the drawing is pinned rather than reviewed. Every catalogue id is hashed, and twelve of them —
 * one per theme, the people and the animals — keep their whole markup in the fixture, so a failure
 * says which rectangle moved instead of only that something did.
 *
 * Regenerating is deliberate and rare:
 *     WRITE_AVATAR_FIXTURE=1 npx vitest run tests/unit/avatarLegacyRender.test.tsx --root apps/web
 * Doing that is a decision to change what existing avatars look like. It needs a reason in the
 * commit message, not a green test.
 */
const relative = 'tests/fixtures/legacyAvatarMarkup.json';
const fixturePath = existsSync(relative) ? resolve(relative) : resolve('apps/web', relative);

interface Fixture {
  hashes: Record<string, string>;
  markup: Record<string, string>;
}

/** Legacy configs that are not in the catalogue: the shapes a saved record can actually hold. */
const savedConfigs: Array<[string, AvatarConfig]> = [
  ['bare', { archetype: 0, palette: 0, skinTone: 0, hair: 0, accessory: 0, badge: 0 }],
  ['every-part', { archetype: 7, palette: 5, skinTone: 4, hair: 4, accessory: 6, badge: 3 }],
  ['animal', { archetype: 10, palette: 2, skinTone: 1, hair: 2, accessory: 1, badge: 5 }],
  ['outfit-free', { archetype: 1, palette: 3, skinTone: 2, hair: 1, accessory: 2, badge: 1, outfit: 'hoodie' }],
  ['outfit-priced', { archetype: 4, palette: 6, skinTone: 5, hair: 5, accessory: 4, badge: 2, outfit: 'labcoat' }],
  ['with-purse', {
    archetype: 2, palette: 1, skinTone: 3, hair: 3, accessory: 3, badge: 4,
    outfit: 'blazer', unlockedOutfits: ['blazer', 'apron'], spentPoints: 60
  }],
  // Out-of-range indexes reach records written by older builds, and every lookup wraps rather than
  // throwing. Pinned because "wraps" is a promise to whoever holds such a record.
  ['out-of-range', { archetype: 99, palette: 42, skinTone: 17, hair: 31, accessory: 23, badge: 12 }]
];

function markupFor(config: AvatarConfig, index: number): string {
  const { container } = render(<ThemedAvatar avatarIndex={index} config={config} size={96} />);
  const svg = container.querySelector('svg')!.outerHTML;
  cleanup();
  return svg;
}

const hash = (value: string) => createHash('sha256').update(value).digest('hex').slice(0, 16);

/** One per theme, so a broken drawing names itself rather than only failing a checksum. */
const detailed = new Set(
  [...new Set(avatarCatalog.map((avatar) => avatar.config.archetype))]
    .map((archetype) => avatarCatalog.find((avatar) => avatar.config.archetype === archetype)!.id)
);

function currentFixture(): Fixture {
  const hashes: Record<string, string> = {};
  const markup: Record<string, string> = {};
  for (const avatar of avatarCatalog) {
    const svg = markupFor(avatar.config, avatar.index);
    hashes[avatar.id] = hash(svg);
    if (detailed.has(avatar.id)) markup[avatar.id] = svg;
  }
  for (const [name, config] of savedConfigs) {
    const svg = markupFor(config, 0);
    hashes[`saved:${name}`] = hash(svg);
    markup[`saved:${name}`] = svg;
  }
  return { hashes, markup };
}

describe('avatars that already exist', () => {
  it('draws every catalogue id exactly as it was drawn before', () => {
    const now = currentFixture();
    if (process.env.WRITE_AVATAR_FIXTURE) {
      writeFileSync(fixturePath, `${JSON.stringify(now, null, 2)}\n`, 'utf8');
      return;
    }
    const pinned = pinnedFixture as Fixture;

    // Named first: a failure here shows the rectangle that moved.
    for (const [id, svg] of Object.entries(pinned.markup)) {
      expect(now.markup[id], id).toBe(svg);
    }
    // Then the rest, by checksum.
    expect(Object.keys(now.hashes).length).toBe(Object.keys(pinned.hashes).length);
    for (const [id, digest] of Object.entries(pinned.hashes)) {
      expect(now.hashes[id], `${id} is drawn differently than it was`).toBe(digest);
    }
  });

  it('still resolves all 160 catalogue ids', () => {
    expect(avatarCatalog.length).toBe(160);
    expect(avatarCatalog[0]!.id).toBe('avatar_001');
    expect(avatarCatalog[159]!.id).toBe('avatar_160');
  });
});
