import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import {
  replaceSupportTable,
  supportTable,
  validateMaintenancePolicy,
} from './maintenance-policy.mjs';

const root = process.cwd();
const mode = process.argv[2] ?? '--check';
assert(
  mode === '--check' || mode === '--write',
  'Usage: update-support-table.mjs --check|--write',
);

const policy = JSON.parse(
  await readFile(path.join(root, '.github', 'maintenance-policy.json'), 'utf8'),
);
validateMaintenancePolicy(policy);
const generated = supportTable(policy);
const documents = ['SECURITY.md', 'docs/maintenance.md'];

for (const file of documents) {
  const filePath = path.join(root, file);
  const current = await readFile(filePath, 'utf8');
  const expected = replaceSupportTable(current, generated);
  if (mode === '--write') {
    if (expected !== current) await writeFile(filePath, expected);
  } else {
    assert.equal(current, expected, `${file} support table is stale`);
  }
}

console.log(
  `Support table ${mode === '--write' ? 'updated' : 'verified'} for ${policy.stableMajor}.x and Node ${policy.nodeLines.map(({ major }) => major).join('/')}`,
);
