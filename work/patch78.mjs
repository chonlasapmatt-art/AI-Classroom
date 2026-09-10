import { readFileSync, writeFileSync } from 'node:fs';
const p = 'apps/web/tests/unit/avatarOutfitsAndHonours.test.tsx';
const raw = readFileSync(p, 'utf8');
const crlf = raw.includes('\r\n');
let src = crlf ? raw.replace(/\r\n/g, '\n') : raw;
src = src.replace(`import type { SchoolSnapshot } from '../../src/data/schoolRepository';`,
`import { FixtureSchoolRepository } from '../../src/data/fixtureSchoolRepository';
import type { SchoolSnapshot } from '../../src/data/schoolRepository';`);
writeFileSync(p, crlf ? src.replace(/\n/g, '\r\n') : src);
console.log('patched ' + p);
