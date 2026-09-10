import { patch } from './patchlib.mjs';
const file = 'apps/web/src/data/teacherResponsibilities.ts';

/*
 * `subjectId` is declared `string | null | undefined`, and both absent values mean the same thing:
 * this row is on the room rather than on one of its subjects. Four checks tested `=== null` only,
 * so a link written without the key -- which is every link the preview school ships, and any row a
 * server build returns before that column existed -- read as a subject responsibility for a subject
 * with no id. The effect was an advisor who advised nothing: not the room's guardian screen, not
 * the room's marks, and, once the work list started asking the same question, not the room's work.
 */
const edits = [
  [
    `    link.subjectId === null || link.subjectId === subjectId);`,
    `    isRoomWide(link) || link.subjectId === subjectId);`
  ],
  [
    `export function teacherIsAdvisor(snapshot: SchoolSnapshot, profileId: string, classId: string): boolean {
  return teacherLinksForProfile(snapshot, profileId, classId).some((link) => link.subjectId === null);
}`,
    `export function teacherIsAdvisor(snapshot: SchoolSnapshot, profileId: string, classId: string): boolean {
  return teacherLinksForProfile(snapshot, profileId, classId).some(isRoomWide);
}`
  ],
  [
    `  const advisor = links.some((link) => link.subjectId === null);`,
    `  const advisor = links.some(isRoomWide);`
  ],
  [
    `export function teacherIsAdvisorAnywhere(snapshot: SchoolSnapshot, profileId: string): boolean {
  return teacherLinksForProfile(snapshot, profileId).some((link) => link.subjectId === null);
}`,
    `export function teacherIsAdvisorAnywhere(snapshot: SchoolSnapshot, profileId: string): boolean {
  return teacherLinksForProfile(snapshot, profileId).some(isRoomWide);
}`
  ],
  [
    `function active(link: Pick<ClassTeacher, 'deletedAt'>): boolean { return link.deletedAt === null; }`,
    `function active(link: Pick<ClassTeacher, 'deletedAt'>): boolean { return link.deletedAt === null; }

/**
 * A responsibility on the room rather than on one of its subjects.
 *
 * The field is optional and nullable, and the two absences mean the same thing -- a link with no
 * subject is an advisor's link. Comparing against \`null\` alone read an omitted key as a
 * responsibility for a subject whose id happened to be undefined, so an advisor advised nothing.
 */
function isRoomWide(link: Pick<ClassTeacher, 'subjectId'>): boolean {
  return link.subjectId === null || link.subjectId === undefined;
}`
  ]
];

patch(file, edits);
console.log('advisor links no longer need an explicit null');
