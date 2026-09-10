import { readFileSync, writeFileSync } from 'node:fs';
function editFile(file, pairs) {
  const raw = readFileSync(file, 'utf8');
  const crlf = raw.includes('\r\n');
  let src = crlf ? raw.replace(/\r\n/g, '\n') : raw;
  for (const [from, to] of pairs) {
    if (!src.includes(from)) { console.error('MISS in ' + file + ': ' + from.slice(0, 70)); process.exit(1); }
    src = src.replace(from, to);
  }
  writeFileSync(file, crlf ? src.replace(/\n/g, '\r\n') : src);
  console.log('patched ' + file);
}

// The contract.
editFile('apps/web/src/data/schoolRepository.ts', [
[`  saveOwnAvatar(actorProfileId: string, role: 'teacher' | 'student' | 'parent', avatarId: string): Promise<void>;`,
`  saveOwnAvatar(actorProfileId: string, role: 'teacher' | 'student' | 'parent', avatarId: string): Promise<void>;
  /**
   * The clothes on one's own avatar.
   *
   * Only a student has clothes to change — an outfit is stored in \`students.avatar_config\`, which is
   * the only avatar record that has one — and only their own row is ever written. It merges into the
   * configuration a teacher may have set, so nothing else about the drawing is lost.
   */
  saveOwnOutfit(actorProfileId: string, outfitId: string): Promise<void>;`]
]);

// The cloud path: the same security-definer shape the avatar itself uses.
editFile('apps/web/src/data/dexieSchoolRepository.ts', [
[`  async saveSubmission(input: SubmissionInput): Promise<void> {`,
`  async saveOwnOutfit(actorProfileId: string, outfitId: string): Promise<void> {
    if (!isValidOutfitId(outfitId)) throw new Error('ไม่พบชุดที่เลือก');
    const timestamp = nowIso();
    await this.rpc('set_own_outfit', { p_school_id: this.schoolId, p_outfit: outfitId });
    const student = await db.students.where({ schoolId: this.schoolId, profileId: actorProfileId }).first();
    if (student) {
      await db.students.put({
        ...student,
        avatarConfig: { ...(student.avatarConfig ?? configFromIndex(student.avatarIndex)), outfit: outfitId },
        updatedAt: timestamp
      });
    }
  }

  async saveSubmission(input: SubmissionInput): Promise<void> {`]
]);

// The fixture path, which is what Preview Mode and the tests run on.
editFile('apps/web/src/data/fixtureSchoolRepository.ts', [
[`  async saveOwnAvatar(actorProfileId: string, role: 'teacher' | 'student' | 'parent', avatarId: string): Promise<void> {`,
`  async saveOwnOutfit(actorProfileId: string, outfitId: string): Promise<void> {
    if (!isValidOutfitId(outfitId)) throw new Error('ไม่พบชุดที่เลือก');
    const student = this.data.students.find((item) => item.profileId === actorProfileId);
    if (!student) throw new Error('เปลี่ยนชุดได้เฉพาะอวตารของตัวเองเท่านั้น');
    this.data.students = this.upsert(this.data.students, {
      ...student,
      avatarConfig: { ...(student.avatarConfig ?? configFromIndex(student.avatarIndex)), outfit: outfitId },
      updatedAt: nowIso()
    });
    this.emit();
  }

  async saveOwnAvatar(actorProfileId: string, role: 'teacher' | 'student' | 'parent', avatarId: string): Promise<void> {`]
]);

// A saved outfit rides on top of whichever avatar is being drawn.
editFile('apps/web/src/features/avatars/ProfileAvatar.tsx', [
[`  const chosen = configForAvatarId(avatarId);
  const config = chosen ?? avatarConfig ?? null;`,
`  /*
   * The clothes follow the person, not the drawing they picked.
   *
   * An avatar chosen from the catalogue brings its whole look with it, which would throw away the
   * outfit the student chose the moment they changed avatar. The outfit is the one part of a saved
   * configuration that outlives that choice, so it is laid over the catalogue's own.
   */
  const chosen = configForAvatarId(avatarId);
  const base = chosen ?? avatarConfig ?? null;
  const config = base && avatarConfig?.outfit ? { ...base, outfit: avatarConfig.outfit } : base;`]
]);
