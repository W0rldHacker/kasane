import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const selector = process.argv[2];
if (process.argv.length > 3) {
  throw new Error('test:types accepts at most one suite name');
}
if (selector !== undefined && !/^[a-z][a-z0-9-]*$/u.test(selector)) {
  throw new Error(`Invalid type-test suite name: ${selector}`);
}

const cli = path.resolve('node_modules/tsd/dist/cli.js');
const arguments_ = [cli];
if (selector !== undefined) {
  arguments_.push('--files', `test/types/${selector}.test-d.ts`);
}

const result = spawnSync(process.execPath, arguments_, {
  cwd: process.cwd(),
  stdio: 'inherit',
});
process.exitCode = result.status ?? 1;
