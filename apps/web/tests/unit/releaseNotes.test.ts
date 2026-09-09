import { describe, expect, it } from 'vitest';
import {
  changesIn, compareVersions, noteFor, notesBetween, releaseNotes, type ReleaseNote
} from '../../src/app/releaseNotes';
import { version as packageVersion } from '../../package.json';

/*
 * The notes are the only account a school gets of what changed.
 *
 * Everything else about an update is machinery — a service worker swaps, a version string moves —
 * and none of it tells the teacher who pressed the button what they now have. These are checked
 * like data rather than like prose because the failure they guard against is silent: a version that
 * ships with no entry shows an empty notice, which reads as "nothing changed".
 */
const sample: ReleaseNote[] = [
  { version: '2.0.0', date: '2026-01-01', headline: 'สอง', changes: [{ kind: 'feature', text: 'ข' }] },
  { version: '1.2.0', date: '2025-12-01', headline: 'หนึ่งจุดสอง', changes: [{ kind: 'fix', text: 'ก' }] },
  { version: '1.1.0', date: '2025-11-01', headline: 'หนึ่งจุดหนึ่ง', changes: [{ kind: 'feature', text: 'ค' }] }
];

describe('release notes', () => {
  it('orders versions by number, not by string', () => {
    // '3.10.0' sorts before '3.9.0' as text, which would hide the newer release.
    expect(compareVersions('3.10.0', '3.9.0')).toBeGreaterThan(0);
    expect(compareVersions('3.2.1', '3.2.1')).toBe(0);
    expect(compareVersions('4.0.0', '3.99.99')).toBeGreaterThan(0);
    // Unreadable strings compare equal rather than throwing: not knowing the order is a reason to
    // say less, never a reason to crash the shell that draws the notice.
    expect(compareVersions('nightly', '3.2.1')).toBe(0);
  });

  it('reports every version a device skipped, not only the newest', () => {
    // A tablet switched off for a fortnight is several versions behind, and the change it will
    // notice first is rarely in the newest one.
    const skipped = notesBetween('1.0.0', '2.0.0', sample);
    expect(skipped.map((note) => note.version)).toEqual(['2.0.0', '1.2.0', '1.1.0']);
  });

  it('says nothing on a device that has never run the app', () => {
    // There is no "since" to report, and greeting somebody with repairs to screens they have not
    // seen is noise.
    expect(notesBetween(null, '2.0.0', sample)).toEqual([]);
  });

  it('says nothing when the device is already current or ahead', () => {
    expect(notesBetween('2.0.0', '2.0.0', sample)).toEqual([]);
    expect(notesBetween('2.1.0', '2.0.0', sample)).toEqual([]);
  });

  it('excludes the version the device was already running', () => {
    const skipped = notesBetween('1.1.0', '2.0.0', sample);
    expect(skipped.map((note) => note.version)).toEqual(['2.0.0', '1.2.0']);
  });

  it('flattens a run of versions into one list in the order they will be read', () => {
    expect(changesIn(notesBetween('1.0.0', '2.0.0', sample)).map((change) => change.text))
      .toEqual(['ข', 'ก', 'ค']);
  });

  it('finds one version by name', () => {
    expect(noteFor('1.2.0', sample)?.headline).toBe('หนึ่งจุดสอง');
    expect(noteFor('9.9.9', sample)).toBeNull();
  });
});

describe('the notes this build ships with', () => {
  it('describes the version being released', () => {
    // The guard that matters. A version bumped without an entry shows an empty notice after the
    // reload, which a school reads as "nothing changed" — worse than not having asked them to
    // update at all.
    expect(releaseNotes[0]?.version, 'newest release note').toBe(packageVersion);
  });

  it('is sorted newest first', () => {
    for (let index = 1; index < releaseNotes.length; index += 1) {
      expect(compareVersions(releaseNotes[index - 1]!.version, releaseNotes[index]!.version))
        .toBeGreaterThan(0);
    }
  });

  it('says something readable about every version', () => {
    for (const note of releaseNotes) {
      expect(note.headline.trim().length, note.version).toBeGreaterThan(0);
      expect(note.changes.length, note.version).toBeGreaterThan(0);
      for (const change of note.changes) {
        expect(['feature', 'fix'], `${note.version} · ${change.text}`).toContain(change.kind);
        expect(change.text.trim().length, note.version).toBeGreaterThan(0);
      }
    }
  });
});
