import { describe, expect, it } from 'vitest';
import { updateCopy, updateKindFor } from '../../src/app/appUpdate';

describe('which kind of update is waiting', () => {
  it('calls a third-number bump a patch', () => {
    expect(updateKindFor('3.2.1', '3.2.2')).toBe('patch');
    expect(updateKindFor('3.2.1', '3.2.14')).toBe('patch');
  });

  it('calls a minor or major bump new work', () => {
    expect(updateKindFor('3.2.1', '3.3.0')).toBe('feature');
    expect(updateKindFor('3.2.1', '4.0.0')).toBe('feature');
  });

  it('says nothing specific when the versions cannot be compared', () => {
    // A prompt that promises "just a fix" for something that added a screen is worse than a prompt
    // that only says a new version exists, so an unreadable version stays unknown.
    expect(updateKindFor('3.2.1', null)).toBe('unknown');
    expect(updateKindFor('3.2.1', 'nightly')).toBe('unknown');
    expect(updateKindFor('nightly', '3.2.2')).toBe('unknown');
  });

  it('does not call a downgrade or a rebuild of the same version an update', () => {
    expect(updateKindFor('3.2.1', '3.2.1')).toBe('unknown');
    expect(updateKindFor('3.2.1', '3.2.0')).toBe('unknown');
    expect(updateKindFor('3.2.1', '3.1.9')).toBe('unknown');
  });

  it('tolerates a build suffix on either side', () => {
    expect(updateKindFor('3.2.1', '3.2.2-rc.1')).toBe('patch');
    expect(updateKindFor('3.2.1+build.7', '3.3.0')).toBe('feature');
  });
});

describe('what each prompt says', () => {
  it('gives the two kinds the same shape and different words', () => {
    // The card, the buttons and the placement are identical by design; only the wording differs,
    // because that is the only thing that actually differs to the person deciding when to press it.
    for (const kind of ['patch', 'feature', 'unknown'] as const) {
      expect(updateCopy[kind].eyebrow.length).toBeGreaterThan(0);
      expect(updateCopy[kind].title.length).toBeGreaterThan(0);
      expect(updateCopy[kind].action.length).toBeGreaterThan(0);
    }
    expect(updateCopy.patch.action).not.toBe(updateCopy.feature.action);
    expect(updateCopy.patch.eyebrow).not.toBe(updateCopy.feature.eyebrow);
  });
});
