import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const sourceRoot = path.join(root, 'src');
const failures = [];

const pureZones = new Set([
  'merge',
  'normalize',
  'paths',
  'provenance',
  'redaction',
]);

const importPattern =
  /\b(?:import|export)\s+(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/gu;

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(entryPath)));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(entryPath);
    }
  }

  return files;
}

function sourceZone(file) {
  const relative = path.relative(sourceRoot, file).split(path.sep);
  if (relative.length === 1) return 'public';
  if (relative[0] === 'secrets' && relative[1]?.startsWith('redact')) {
    return 'redaction';
  }
  return relative[0];
}

function resolvesToZone(file, specifier, zone) {
  if (!specifier.startsWith('.')) return false;
  const resolved = path.resolve(path.dirname(file), specifier);
  const relative = path.relative(sourceRoot, resolved).split(path.sep);
  return relative[0] === zone;
}

for (const file of await walk(sourceRoot)) {
  const zone = sourceZone(file);
  const source = await readFile(file, 'utf8');

  for (const match of source.matchAll(importPattern)) {
    const specifier = match[1];
    if (!specifier) continue;

    if (pureZones.has(zone) && specifier.startsWith('node:')) {
      failures.push(`${path.relative(root, file)} imports ${specifier}`);
    }

    if (zone === 'merge' && resolvesToZone(file, specifier, 'sources')) {
      failures.push(`${path.relative(root, file)} imports sources from merge`);
    }

    if (
      zone === 'sources' &&
      ['merge', 'provenance', 'snapshot', 'validation'].some((target) =>
        resolvesToZone(file, specifier, target),
      )
    ) {
      failures.push(
        `${path.relative(root, file)} imports a forbidden core stage`,
      );
    }

    if (zone === 'public' && /(?:^|\/)internal(?:\/|$)/u.test(specifier)) {
      failures.push(`${path.relative(root, file)} exposes src/internal`);
    }
  }
}

const packageJson = JSON.parse(
  await readFile(path.join(root, 'package.json'), 'utf8'),
);

if (Object.keys(packageJson.dependencies ?? {}).length > 0) {
  failures.push('Runtime dependencies require an accepted exception ADR');
}

for (const exportPath of Object.keys(packageJson.exports ?? {})) {
  if (/internal|watch|provider/u.test(exportPath)) {
    failures.push(`Forbidden public export: ${exportPath}`);
  }
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    `Architecture check passed (${(await walk(sourceRoot)).length} files)`,
  );
}
