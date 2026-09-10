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
const imports = `import { isValidAvatarId } from '../features/avatars/avatarCatalog';`;
const extra = `import { isValidAvatarId } from '../features/avatars/avatarCatalog';
import { isValidOutfitId } from '../features/avatars/avatarOutfits';
import { configFromIndex } from '../features/avatars/avatarThemes';`;
editFile('apps/web/src/data/fixtureSchoolRepository.ts', [[imports, extra]]);
editFile('apps/web/src/data/dexieSchoolRepository.ts', [[imports, extra]]);
