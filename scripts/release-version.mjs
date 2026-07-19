import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { changelogCategories, parseChangeset } from './release-policy.mjs';

const root = process.cwd();
const scriptRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const changesetDirectory = path.join(root, '.changeset');
const files = (await readdir(changesetDirectory))
  .filter((file) => file.endsWith('.md') && file !== 'README.md')
  .sort();
assert(
  files.length > 0,
  'Release versioning requires at least one pending changeset',
);

const entries = await Promise.all(
  files.map(async (file) =>
    parseChangeset(
      await readFile(path.join(changesetDirectory, file), 'utf8'),
      file,
    ),
  ),
);
const before = JSON.parse(
  await readFile(path.join(root, 'package.json'), 'utf8'),
);
const cli = path.join(
  scriptRoot,
  'node_modules',
  '@changesets',
  'cli',
  'bin.js',
);
const result = spawnSync(process.execPath, [cli, 'version'], {
  cwd: root,
  encoding: 'utf8',
  stdio: 'pipe',
});
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
assert.equal(result.status, 0, 'Changesets version command failed');

const after = JSON.parse(
  await readFile(path.join(root, 'package.json'), 'utf8'),
);
assert.notEqual(
  after.version,
  before.version,
  'Changesets did not advance the package version',
);

const groups = new Map(changelogCategories.map((category) => [category, []]));
for (const entry of entries) groups.get(entry.category).push(entry.summary);
const sections = changelogCategories
  .filter((category) => groups.get(category).length > 0)
  .map(
    (category) =>
      `### ${category}\n\n${groups
        .get(category)
        .map((summary) => `- ${summary}`)
        .join('\n')}`,
  );
const release = `## ${after.version} - ${new Date().toISOString().slice(0, 10)}\n\n${sections.join('\n\n')}\n`;
const changelogPath = path.join(root, 'CHANGELOG.md');
const changelog = await readFile(changelogPath, 'utf8');
const heading = '# Changelog\n';
assert(
  changelog.startsWith(heading),
  'CHANGELOG.md must start with # Changelog',
);
const marker = '<!-- release-notes -->';
assert(
  changelog.includes(marker),
  'CHANGELOG.md must contain the release-notes marker',
);
await writeFile(
  changelogPath,
  changelog.replace(marker, `${marker}\n\n${release.trimEnd()}`),
);
const prettier = path.join(
  scriptRoot,
  'node_modules',
  'prettier',
  'bin',
  'prettier.cjs',
);
const format = spawnSync(
  process.execPath,
  [prettier, '--write', changelogPath],
  {
    cwd: root,
    encoding: 'utf8',
    stdio: 'pipe',
  },
);
if (format.stdout) process.stdout.write(format.stdout);
if (format.stderr) process.stderr.write(format.stderr);
assert.equal(format.status, 0, 'CHANGELOG.md formatting failed');
console.log(
  `Prepared @worldhacker/kasane ${after.version} and updated CHANGELOG.md`,
);
