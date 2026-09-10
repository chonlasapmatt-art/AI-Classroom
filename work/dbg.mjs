import fs from 'node:fs';
const s = fs.readFileSync('apps/web/src/features/assignments/AssignmentsPage.tsx','utf8');
console.log('crlf?', s.includes('\r\n'));
console.log('a', s.includes('const items = useMemo(() => calendarItemsFor(snapshot, {'));
console.log('b', s.includes('includeDrafts: isTeacher'));
console.log('c', s.includes('}), [snapshot, effectiveClassId, ownStudent?.id, subjectFilter, isTeacher]);'));
