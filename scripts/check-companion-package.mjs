import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import {
  auditCompanionTarball,
  packCompanion,
  readCompanionManifest,
} from './companion-release-utils.mjs';

const workspace = process.cwd();
const requested = process.argv[2] ?? '.';
const packageRoot = path.resolve(workspace, requested);
const packagesRoot = path.resolve(workspace, '..');
assert.equal(
  path.basename(packagesRoot),
  'packages',
  'Companion pack check must run from a package directory',
);
assert(
  packageRoot === workspace,
  'Companion package script accepts only its current package directory',
);
const companion = Object.freeze({ root: packageRoot });
const declaredManifest = JSON.parse(
  await readFile(path.join(packageRoot, 'package.json'), 'utf8'),
);
const manifest = await readCompanionManifest({
  ...companion,
  name: declaredManifest.name,
});
const temporaryRoot = await mkdtemp(
  path.join(os.tmpdir(), 'kasane-companion-pack-'),
);

try {
  const tarball = await packCompanion(companion, temporaryRoot);
  const audit = await auditCompanionTarball(tarball, manifest);
  console.log(
    `Companion pack check passed: ${manifest.name}@${manifest.version}, ${audit.entries.length} files, sha256 ${audit.digest}`,
  );
} finally {
  await rm(temporaryRoot, { force: true, recursive: true });
}
