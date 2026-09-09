import data from './releaseNotes.json';

/**
 * What each version changed, in the words a school would use.
 *
 * The app could already tell a person that an update existed and whether it was a fix or new work.
 * It could not tell them what the work *was*, which is the only part anybody actually wants: "มี
 * เวอร์ชันใหม่" asks a teacher to interrupt a lesson for an unnamed benefit, and after the reload the
 * screen looks slightly different with no explanation of why. Both of those are answered from here.
 *
 * ── Why the notes ship with the build ──
 * The obvious home for release notes is the operations console, which already records every release
 * an operator publishes. That is the wrong home for this: those rows are readable by platform
 * operators, and the person who needs to know what changed is the student whose timetable moved. So
 * the notes are a file in the repository, compiled into the build they describe, and readable by
 * everybody with no permission involved.
 *
 * They are also copied into `version.json` at build time, because the banner that offers the update
 * is drawn by the *old* build — it has no way to know what the new one contains unless the new one
 * says so over the wire. That is the same file the prompt already reads to tell a patch from a
 * feature, so this costs one fetch that was happening anyway.
 *
 * ── Writing an entry ──
 * One line per change, in the second person, naming what a person can now do — not the component
 * that was refactored to let them. `kind` is 'feature' for something new and 'fix' for something
 * that was wrong: those two deserve different words, because "we fixed the thing that was losing
 * your register" and "there is a new screen" are not the same news.
 */
export type ReleaseChangeKind = 'feature' | 'fix';

export interface ReleaseChange {
  kind: ReleaseChangeKind;
  text: string;
}

export interface ReleaseNote {
  version: string;
  /** ISO date, for the heading. The build time is a different fact and lives on the settings page. */
  date: string;
  headline: string;
  changes: ReleaseChange[];
}

const versionPattern = /^(\d+)\.(\d+)\.(\d+)/;

/*
 * Sorted here rather than trusted from the file: the order is what "everything since your version"
 * is computed from, and a file edited by hand is exactly the kind of place a version lands in the
 * wrong row. Declared after the pattern it uses, because a `const` is not hoisted the way the
 * function below it is.
 */
export const releaseNotes: ReleaseNote[] = (data.notes as ReleaseNote[])
  .slice()
  .sort((a, b) => compareVersions(b.version, a.version));

/** Positive when `a` is newer than `b`, negative when older, 0 when equal or unreadable. */
export function compareVersions(a: string, b: string): number {
  const left = versionPattern.exec(a.trim());
  const right = versionPattern.exec(b.trim());
  if (!left || !right) return 0;
  for (let index = 1; index <= 3; index += 1) {
    const difference = Number(left[index]) - Number(right[index]);
    if (difference !== 0) return difference;
  }
  return 0;
}

/**
 * Everything that changed between the version somebody was running and the one they have now.
 *
 * A device that has been switched off for a fortnight is several versions behind, and telling it
 * only about the newest one hides the change it is most likely to notice. `from` being null is the
 * first run on this device: there is no "since" to report, and greeting somebody who has never used
 * the app with a list of repairs to a screen they have not seen is noise, so it returns nothing.
 */
export function notesBetween(from: string | null, to: string, notes = releaseNotes): ReleaseNote[] {
  if (!from) return [];
  if (compareVersions(to, from) <= 0) return [];
  return notes.filter((note) =>
    compareVersions(note.version, from) > 0 && compareVersions(note.version, to) <= 0);
}

/** The notes for one version, when it has any. */
export function noteFor(version: string, notes = releaseNotes): ReleaseNote | null {
  return notes.find((note) => compareVersions(note.version, version) === 0) ?? null;
}

/** Every change in a run of versions, newest first, flattened for a list that has to stay short. */
export function changesIn(notes: ReleaseNote[]): ReleaseChange[] {
  return notes.flatMap((note) => note.changes);
}
