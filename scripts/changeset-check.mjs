import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { parseChangeset } from './release-policy.mjs';

const root = process.cwd();
const directory = path.join(root, '.changeset');
const pending = (await readdir(directory))
  .filter((file) => file.endsWith('.md') && file !== 'README.md')
  .sort();
for (const file of pending) {
  parseChangeset(await readFile(path.join(directory, file), 'utf8'), file);
}

const base = process.env.GITHUB_BASE_REF;
const head = process.env.GITHUB_HEAD_REF ?? '';
if (base && !head.startsWith('changeset-release/')) {
  const comparison = execFileSync(
    'git',
    ['diff', '--name-only', `origin/${base}...HEAD`],
    { cwd: root, encoding: 'utf8' },
  );
  const files = comparison.split(/\r?\n/u).filter(Boolean);
  const userVisible = files.some((file) =>
    /^(?:src\/|README\.md$|SECURITY\.md$|docs\/(?:api|guides|migrations|versioning)|package\.json$)/u.test(
      file,
    ),
  );
  const addedChangeset = files.some(
    (file) =>
      file.startsWith('.changeset/') &&
      file.endsWith('.md') &&
      file !== '.changeset/README.md',
  );
  assert(
    !userVisible || addedChangeset,
    'User-visible changes require a patch, minor, or major changeset',
  );
}
console.log(
  `Changeset check passed: ${pending.length} pending release classification(s)`,
);
