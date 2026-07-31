import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  changelogCategories,
  parseChangeset,
  parseVersion,
} from './release-policy.mjs';

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
const packageLocations = new Map([
  ['@worldhacker/kasane', root],
  [
    '@worldhacker/kasane-source-testkit',
    path.join(root, 'packages', 'source-testkit'),
  ],
  ['@worldhacker/kasane-watch', path.join(root, 'packages', 'watch')],
]);
const affectedPackages = [
  ...new Set(entries.map((entry) => entry.packageName)),
];
for (const packageName of affectedPackages) {
  assert(
    packageLocations.has(packageName),
    `No release location is configured for ${packageName}`,
  );
}
const beforeByPackage = new Map(
  await Promise.all(
    affectedPackages.map(async (packageName) => {
      const location = packageLocations.get(packageName);
      const manifest = JSON.parse(
        await readFile(path.join(location, 'package.json'), 'utf8'),
      );
      assert.equal(manifest.name, packageName);
      return [packageName, manifest];
    }),
  ),
);
const preState = await readFile(
  path.join(changesetDirectory, 'pre.json'),
  'utf8',
)
  .then((source) => JSON.parse(source))
  .catch((error) => {
    if (error?.code === 'ENOENT') return null;
    throw error;
  });
const promotionEntries = entries.filter(
  (entry) => entry.metadata.Promotion === '1.0',
);
if (promotionEntries.length > 0) {
  assert.equal(
    promotionEntries.length,
    1,
    'Only one 1.0 promotion Changeset is allowed',
  );
  const before = beforeByPackage.get('@worldhacker/kasane');
  assert(before, 'Promotion: 1.0 requires a core package Changeset');
  const beforeVersion = parseVersion(before.version);
  const entersReleaseCandidate =
    beforeVersion.major === 0 &&
    preState?.mode === 'pre' &&
    preState.tag === 'rc';
  const exitsReleaseCandidate =
    beforeVersion.major === 1 &&
    beforeVersion.minor === 0 &&
    beforeVersion.patch === 0 &&
    beforeVersion.prerelease?.startsWith('rc.') === true &&
    preState?.mode === 'exit' &&
    preState.tag === 'rc';
  assert(
    entersReleaseCandidate || exitsReleaseCandidate,
    'Promotion: 1.0 requires entering the 1.0 RC line from 0.x or exiting an approved 1.0.0 RC',
  );
  assert.equal(
    preState.tag,
    'rc',
    'Promotion: 1.0 requires Changesets RC prerelease mode',
  );
}
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

const afterByPackage = new Map(
  await Promise.all(
    affectedPackages.map(async (packageName) => {
      const location = packageLocations.get(packageName);
      return [
        packageName,
        JSON.parse(await readFile(path.join(location, 'package.json'), 'utf8')),
      ];
    }),
  ),
);
const coreBefore = beforeByPackage.get('@worldhacker/kasane');
let coreAfter = afterByPackage.get('@worldhacker/kasane');
if (coreBefore && coreAfter) {
  const beforeChannel = parseVersion(coreBefore.version).prerelease?.split(
    '.',
  )[0];
  const generated = parseVersion(coreAfter.version);
  if (
    preState?.mode === 'pre' &&
    preState.tag === 'rc' &&
    beforeChannel !== 'rc' &&
    generated.major === 1 &&
    generated.minor === 0 &&
    generated.patch === 0 &&
    generated.prerelease?.startsWith('rc.')
  ) {
    coreAfter = { ...coreAfter, version: '1.0.0-rc.1' };
    afterByPackage.set('@worldhacker/kasane', coreAfter);
    await writeFile(
      path.join(root, 'package.json'),
      `${JSON.stringify(coreAfter, null, 2)}\n`,
    );
  }
}
for (const packageName of affectedPackages) {
  assert.notEqual(
    afterByPackage.get(packageName).version,
    beforeByPackage.get(packageName).version,
    `Changesets did not advance ${packageName}`,
  );
}

const changelogPaths = [];
for (const packageName of affectedPackages) {
  const packageEntries = entries.filter(
    (entry) => entry.packageName === packageName,
  );
  const groups = new Map(changelogCategories.map((category) => [category, []]));
  for (const entry of packageEntries) {
    groups.get(entry.category).push(entry.summary);
  }
  const sections = changelogCategories
    .filter((category) => groups.get(category).length > 0)
    .map(
      (category) =>
        `### ${category}\n\n${groups
          .get(category)
          .map((summary) => `- ${summary}`)
          .join('\n')}`,
    );
  const version = afterByPackage.get(packageName).version;
  const release = `## ${version} - ${new Date().toISOString().slice(0, 10)}\n\n${sections.join('\n\n')}\n`;
  const changelogPath = path.join(
    packageLocations.get(packageName),
    'CHANGELOG.md',
  );
  const changelog = await readFile(changelogPath, 'utf8');
  const heading = '# Changelog\n';
  assert(
    changelog.startsWith(heading),
    `${packageName} CHANGELOG.md must start with # Changelog`,
  );
  const marker = '<!-- release-notes -->';
  assert(
    changelog.includes(marker),
    `${packageName} CHANGELOG.md must contain the release-notes marker`,
  );
  await writeFile(
    changelogPath,
    changelog.replace(marker, `${marker}\n\n${release.trimEnd()}`),
  );
  changelogPaths.push(changelogPath);
}
const prettier = path.join(
  scriptRoot,
  'node_modules',
  'prettier',
  'bin',
  'prettier.cjs',
);
const format = spawnSync(
  process.execPath,
  [prettier, '--write', ...changelogPaths],
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
  `Prepared ${affectedPackages
    .map(
      (packageName) =>
        `${packageName} ${afterByPackage.get(packageName).version}`,
    )
    .join(', ')} and updated package changelogs`,
);
