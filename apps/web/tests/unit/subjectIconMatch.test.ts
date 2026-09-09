import { describe, expect, it } from 'vitest';
import { subjectIconKeys } from '../../src/data/subjectCatalog';
import { matchableIcons, subjectIconForName } from '../../src/data/subjectIconMatch';
import { standardSubjects } from '../../src/data/subjectCatalog';

/*
 * The reason six of nine subjects in the live school were drawn as the same grey label.
 *
 * It was never the drawings. A subject created by typing its name into the teacher form was saved
 * with `iconKey: 'default'`, because that form has no icon picker — and that form is how a school
 * actually adds the subjects it teaches. Twenty-two distinct drawings are worth nothing if the thing
 * that creates subjects never chooses between them.
 */
describe('choosing a subject icon from its name', () => {
  it('recognises the Thai core curriculum by name', () => {
    const expected: Array<[string, string]> = [
      ['ภาษาไทย', 'language'],
      ['คณิตศาสตร์', 'math'],
      ['วิทยาศาสตร์', 'science'],
      ['วิทยาศาสตร์และเทคโนโลยี', 'science'],
      ['สังคมศึกษา ศาสนา และวัฒนธรรม', 'social'],
      ['ศิลปะ', 'art'],
      ['การงานอาชีพ', 'work'],
      ['ภาษาต่างประเทศ', 'globe']
    ];
    for (const [name, icon] of expected) expect(subjectIconForName(name), name).toBe(icon);
  });

  it('gives the compound PE subject the sport icon, not the heart', () => {
    // "สุขศึกษาและพลศึกษา" is one subject in the core curriculum and contains the whole of สุขศึกษา,
    // so the order of the rules is what decides it. Mostly sport, drawn as sport.
    expect(subjectIconForName('สุขศึกษาและพลศึกษา')).toBe('sport');
    expect(subjectIconForName('พละและพลศึกษา')).toBe('sport');
    // On its own it is still health.
    expect(subjectIconForName('สุขศึกษา')).toBe('health');
  });

  it('recognises the subjects this school actually invented', () => {
    // Every one of these was sitting on the fallback label in production.
    expect(subjectIconForName('ออกแบบกราฟิก')).toBe('art');
    expect(subjectIconForName('คอมพิวเตอร์')).toBe('computer');
    expect(subjectIconForName('การงานอาชีพ')).toBe('work');
    expect(subjectIconForName('วิทยาศาสตร์')).toBe('science');
  });

  it('recognises the electives a Thai school actually offers', () => {
    const expected: Array<[string, string]> = [
      ['วิทยาการคำนวณ', 'code'],
      ['หุ่นยนต์เบื้องต้น', 'robot'],
      ['ปัญญาประดิษฐ์และหุ่นยนต์', 'robot'],
      ['ลูกเสือ-เนตรนารี', 'star'],
      ['ยุวกาชาด', 'star'],
      ['ห้องสมุดและการค้นคว้า', 'book'],
      ['ภาษาจีน', 'globe'],
      ['ภาษาเกาหลี', 'globe'],
      ['เศรษฐศาสตร์', 'social'],
      ['อาเซียนศึกษา', 'social'],
      ['บัญชีเบื้องต้น', 'work'],
      ['คอมพิวเตอร์ธุรกิจ', 'computer'],
      ['ดาราศาสตร์', 'science'],
      ['ว่ายน้ำ', 'sport'],
      ['เพศศึกษา', 'health'],
      ['ดุริยางค์', 'music'],
      ['นาฏศิลป์ไทย', 'drama'],
      ['ถ่ายภาพ', 'art']
    ];
    for (const [name, icon] of expected) expect(subjectIconForName(name), name).toBe(icon);
  });

  it('reads what a subject is before the country it belongs to', () => {
    // A Thai school names its own version of a subject by suffixing ไทย, and the rule for ภาษาไทย
    // matches on ไทย alone — so every one of these was a pencil until the arts were read first.
    expect(subjectIconForName('ดนตรีไทย')).toBe('music');
    expect(subjectIconForName('นาฏศิลป์ไทย')).toBe('drama');
    expect(subjectIconForName('จิตรกรรมไทย')).toBe('art');
    expect(subjectIconForName('มวยไทย')).toBe('sport');
    // And the language itself is still the language.
    expect(subjectIconForName('ภาษาไทย')).toBe('language');
    expect(subjectIconForName('วรรณคดีไทย')).toBe('language');
  });

  it('does not read the two letters of AI out of an English subject name', () => {
    // "Thai" contains "ai". A bare two-letter rule would have drawn a robot on every English-named
    // Thai class in the school, which is how a matcher like this normally goes wrong.
    expect(subjectIconForName('Thai Language')).toBe('language');
    expect(subjectIconForName('Thai Studies')).toBe('language');
    expect(subjectIconForName('AI and Robotics')).toBe('robot');
    // The generic word belongs to the foreign-language area only when it is qualified: "Thai
    // Language" is the English name the seed itself carries for ภาษาไทย, and a bare `language`
    // rule handed it to the globe.
    expect(subjectIconForName('Foreign Languages')).toBe('globe');
  });

  it('gives computing science the code icon and robotics the robot', () => {
    // Both are technology, and the rule for เทคโนโลยี used to swallow both.
    expect(subjectIconForName('วิทยาการคำนวณ')).toBe('code');
    expect(subjectIconForName('เทคโนโลยี')).toBe('code');
    expect(subjectIconForName('หุ่นยนต์')).toBe('robot');
  });

  it('reads a name however somebody typed it', () => {
    expect(subjectIconForName('  คณิตศาสตร์  ')).toBe('math');
    expect(subjectIconForName('Graphic Design')).toBe('art');
    expect(subjectIconForName('graphicdesign')).toBe('art');
    expect(subjectIconForName('COMPUTER')).toBe('computer');
  });

  it('separates the sciences that have their own drawing', () => {
    expect(subjectIconForName('ฟิสิกส์')).toBe('atom');
    expect(subjectIconForName('เคมี')).toBe('atom');
    expect(subjectIconForName('ชีววิทยา')).toBe('leaf');
    // The general subject keeps the flask.
    expect(subjectIconForName('วิทยาศาสตร์')).toBe('science');
  });

  it('falls back to the label rather than guessing wrongly', () => {
    // A guess is only useful while it is right. A name nothing recognises gets the honest answer,
    // and the picker on the subject screen is still there.
    expect(subjectIconForName('tyfyuiy')).toBe('default');
    expect(subjectIconForName('')).toBe('default');
    expect(subjectIconForName('   ')).toBe('default');
  });

  it('only ever names an icon the renderer knows', () => {
    for (const icon of matchableIcons) expect(subjectIconKeys, icon).toContain(icon);
  });

  it('agrees with the seeded catalogue about every standard subject', () => {
    // The seeds carry a hand-chosen icon. Where the matcher disagrees with a hand-chosen one, the
    // matcher is wrong — these are the eight names it will meet most often.
    for (const seed of standardSubjects) {
      expect(subjectIconForName(seed.name), seed.name).toBe(seed.iconKey);
    }
  });

  it('agrees with the catalogue in English too', () => {
    // The seeds carry an English name as well, and a school that teaches in English types that one.
    for (const seed of standardSubjects) {
      expect(subjectIconForName(seed.nameEn), seed.nameEn).toBe(seed.iconKey);
    }
  });
});
