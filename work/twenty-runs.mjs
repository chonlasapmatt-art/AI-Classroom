/**
 * Twenty consecutive runs of the whole suite.
 *
 * One green run says the code passes; twenty say the suite itself is trustworthy. A test that
 * depends on a clock, a random seed, an ordering or a race fails somewhere in twenty and passes on
 * its own -- and a flaky suite is worse than a smaller one, because nobody believes the next red.
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const runs = [];
for (let attempt = 1; attempt <= 20; attempt += 1) {
  const started = Date.now();
  const result = spawnSync('npx', ['vitest', 'run', '--reporter=basic'], {
    cwd: 'apps/web', encoding: 'utf8', shell: true, maxBuffer: 64 * 1024 * 1024
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.replace(/\u001B\[[0-9;]*m/g, '');
  const tests = /Tests\s+(.+)/.exec(output)?.[1]?.trim() ?? 'no summary';
  const files = /Test Files\s+(.+)/.exec(output)?.[1]?.trim() ?? 'no summary';
  const failed = /(\d+) failed/.exec(tests)?.[1] ?? '0';
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  runs.push({ attempt, code: result.status, files, tests, failed: Number(failed), seconds });
  console.log(`run ${String(attempt).padStart(2, '0')}  exit ${result.status}  ${seconds}s  ${tests}`);
  if (result.status !== 0) {
    writeFileSync(`work/run-${attempt}-failure.log`, output);
    console.log(`  failure output written to work/run-${attempt}-failure.log`);
  }
}

const green = runs.filter((run) => run.code === 0).length;
const totalSeconds = runs.reduce((sum, run) => sum + Number(run.seconds), 0);
console.log('');
console.log(`green runs: ${green}/20`);
console.log(`flaky tests: ${runs.reduce((sum, run) => sum + run.failed, 0)} failures across all runs`);
console.log(`mean run: ${(totalSeconds / runs.length).toFixed(1)}s`);
writeFileSync('work/twenty-runs.json', JSON.stringify(runs, null, 2));
