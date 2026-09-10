import { patch } from './patchlib.mjs';

patch('AGENTS.md', [
  ['That is enough to build screens, change behaviour, run all 114 test files and see the result. Most work on',
   'That is enough to build screens, change behaviour, run all 117 test files and see the result. Most work on'],
  ['npm run test        # vitest, 114 test files', 'npm run test        # vitest, 117 test files'],
  ['There are 86; the last is `202609090011`.', 'There are 87; the last is `202609100001`.']
]);

patch('docs/FINAL_SYSTEM_VALIDATION_REPORT.md', [
  ['| Migrations | 86 (last: `202609090011`) |', '| Migrations | 87 (last: `202609100001`) |'],
  ['| Test files | 114 |', '| Test files | 117 |'],
  ['| Automated tests | 1065, all passing |', '| Automated tests | 1080, all passing |'],
  ['Gates: `typecheck` PASS · `lint` PASS (`--max-warnings 0`) · `test` PASS (1065) · `build` PASS.',
   'Gates: `typecheck` PASS · `lint` PASS (`--max-warnings 0`) · `test` PASS (1080) · `build` PASS.']
]);
console.log('docs synced');
