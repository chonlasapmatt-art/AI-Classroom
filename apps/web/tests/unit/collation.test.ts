import { describe, expect, it } from 'vitest';
import { byName, compareClassNames, compareLabels, compareNames, sortKeyFor } from '../../src/data/collation';

const sorted = (values: string[], compare: (a: string, b: string) => number) => [...values].sort(compare);

/*
 * The order every list in this product is read in.
 *
 * Three separate things were wrong with sorting a Thai school's lists by the default comparison, and
 * each of them was visible on the first screen anybody opened: numbers inside names sorted as text,
 * Thai was compared by code point rather than by alphabet, and every name filed under its honorific.
 */
describe('sorting Thai names and rooms', () => {
  it('counts the numbers inside a room name as numbers', () => {
    // ป.10/1 sat between ป.1/2 and ป.2/1 under a plain comparison, because "1" precedes "2" and the
    // 0 is never reached. A room list that jumps ป.1, ป.10, ป.2 is a list a teacher reads twice.
    expect(sorted(['ป.10/1', 'ป.2/1', 'ป.1/2', 'ป.1/1'], compareClassNames))
      .toEqual(['ป.1/1', 'ป.1/2', 'ป.2/1', 'ป.10/1']);
  });

  it('runs a whole school from ป.1/1 down to the last room', () => {
    const rooms = ['ม.1/1', 'ป.6/4', 'ป.1/2', 'ป.1/10', 'ป.1/1', 'ป.2/1'];
    expect(sorted(rooms, compareClassNames)).toEqual(['ป.1/1', 'ป.1/2', 'ป.1/10', 'ป.2/1', 'ป.6/4', 'ม.1/1']);
  });

  it('files a name under the name rather than under its title', () => {
    // Staff stored as "ครูสมฤทัย", "ครูอนันต์", "ครูกมล" all sort under ค otherwise, which is no
    // order at all.
    expect(sortKeyFor('ครูสมฤทัย ปัญญาดี')).toBe('สมฤทัย ปัญญาดี');
    expect(sortKeyFor('เด็กหญิงกมล ใจดี')).toBe('กมล ใจดี');
    expect(sorted(['ครูอนันต์', 'ครูกมล', 'ครูสมฤทัย'], compareNames)).toEqual(['ครูกมล', 'ครูสมฤทัย', 'ครูอนันต์']);
  });

  it('strips the longer title first, so นางสาว does not leave สาว behind', () => {
    // "นางสาว" contains "นาง", and removing the shorter one would file every young woman under ส.
    expect(sortKeyFor('นางสาวกมล')).toBe('กมล');
    expect(sortKeyFor('นางกมล')).toBe('กมล');
    expect(sortKeyFor('เด็กชายกมล')).toBe('กมล');
  });

  it('keeps a name that is only a title', () => {
    // Stripping to nothing would make every such row sort first and identically.
    expect(sortKeyFor('ครู')).toBe('ครู');
  });

  it('puts leading vowels where the alphabet puts them', () => {
    // เ แ โ ใ ไ start a great many Thai words and sit high in the code page, so a code-point sort
    // pushes them to the end. The alphabet does not.
    expect(sorted(['ไพโรจน์', 'อนันต์', 'กมล'], compareNames)).toEqual(['กมล', 'ไพโรจน์', 'อนันต์']);
  });

  it('sorts Latin names A to Z beside the Thai ones', () => {
    expect(sorted(['Mr. Brown', 'Dr. Adams', 'Ms. Clark'], compareNames)).toEqual(['Dr. Adams', 'Mr. Brown', 'Ms. Clark']);
  });

  it('leaves a label alone, because a room is not a person', () => {
    // compareLabels does not strip: a subject legitimately beginning with one of those syllables
    // keeps it.
    expect(sortKeyFor('ครูศาสตร์')).toBe('ศาสตร์');
    expect(sorted(['ครูศาสตร์', 'กมล'], compareLabels)).toEqual(['กมล', 'ครูศาสตร์']);
  });

  it('orders student codes with the numbers counted', () => {
    expect(sorted(['S-10', 'S-2', 'S-1', 'S-100'], compareLabels)).toEqual(['S-1', 'S-2', 'S-10', 'S-100']);
  });

  it('sorts a list of records without disturbing the original', () => {
    const people = [{ name: 'ครูอนันต์' }, { name: 'ครูกมล' }];
    expect(byName(people, (person) => person.name).map((person) => person.name)).toEqual(['ครูกมล', 'ครูอนันต์']);
    expect(people.map((person) => person.name)).toEqual(['ครูอนันต์', 'ครูกมล']);
  });

  it('separates two names that differ only by their title, rather than calling them equal', () => {
    // Both reduce to the same sort key, and a comparison that returned 0 would let either order
    // stand — the same list in a different order on a second render.
    expect(compareNames('นายกมล', 'นางกมล')).not.toBe(0);
  });
});
