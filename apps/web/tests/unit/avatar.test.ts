import { describe, expect, it } from 'vitest';
import { avatarArchetypes, avatarIdentity, avatarPalettes, normalizeAvatarIndex } from '../../src/features/avatars/avatarCatalog';
describe('avatar identity',()=>{it('provides at least 144 stable combinations',()=>expect(avatarArchetypes.length*avatarPalettes.length).toBeGreaterThanOrEqual(144));it('maps deterministically without using a name',()=>{expect(avatarIdentity(73)).toEqual(avatarIdentity(73));expect(normalizeAvatarIndex(144)).toBe(0);});});
