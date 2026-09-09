import { relative } from 'node:path';

/**
 * What a commit has to survive.
 *
 * Two commits in a row shipped an unused import. `eslint --max-warnings 0` treats that as an error,
 * so the whole CI pipeline went red for something a two-second check catches — and nothing local
 * said a word before the push.
 *
 * The shape matters. lint-staged appends the staged filenames to a string command, which is right
 * for eslint (lint exactly what is being committed) and wrong for everything else here:
 *
 *   * **eslint has to run where its config is.** The flat config lives in `apps/web`, and eslint
 *     resolves it from the working directory — run from the repository root it finds nothing and
 *     fails with a migration notice, which blocks the commit for the wrong reason and teaches
 *     whoever hits it that the hook is broken rather than that their code is.
 *   * **tsc has to see the project.** A type error is rarely in the file that caused it — removing an
 *     export breaks its importers, not itself — so asking TypeScript about a handful of files gives
 *     a confident wrong answer.
 *   * **the documentation counts are about the tree**, not about the files in the commit. Staging a
 *     migration is the trigger; counting every migration is the check.
 */
const web = 'apps/web';

export default {
  '*.{ts,tsx}': (files) => {
    const inWeb = files.filter((file) => file.replace(/\\/g, '/').includes(`/${web}/`));
    if (inWeb.length === 0) return [];
    const relatives = inWeb.map((file) => relative(web, file).replace(/\\/g, '/'));
    return [`npm exec --workspace @smart-classroom/web -- eslint --max-warnings 0 ${relatives.join(' ')}`];
  },
  'apps/web/src/**/*.{ts,tsx}': () => 'npm run typecheck',
  '{AGENTS.md,docs/FINAL_SYSTEM_VALIDATION_REPORT.md,supabase/migrations/*,supabase/functions/**,apps/web/tests/**}':
    () => 'npm run check:docs'
};
