import { rm } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const workspace = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const dist = path.resolve(workspace, 'dist');
if (path.dirname(dist) !== workspace || path.basename(dist) !== 'dist') {
  throw new Error(`Refusing to clean unexpected build directory: ${dist}`);
}

await rm(dist, { force: true, recursive: true });

const cli = path.resolve(workspace, 'node_modules/typescript/bin/tsc');
const result = spawnSync(process.execPath, [cli, '-p', 'tsconfig.build.json'], {
  cwd: workspace,
  stdio: 'inherit',
});
if (result.error !== undefined) throw result.error;
if (result.signal !== null) {
  throw new Error(`TypeScript build terminated by ${result.signal}`);
}
process.exitCode = result.status ?? 1;
