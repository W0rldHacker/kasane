import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const docsRoot = path.join(root, 'docs');
const failures = [];

const read = (file) => readFile(path.join(root, file), 'utf8');

function collect(pattern, text, group = 1) {
  return [...text.matchAll(pattern)].map((match) => match[group]);
}

function duplicates(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([value]) => value);
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}

async function markdownFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await markdownFiles(entryPath)));
    else if (entry.isFile() && entry.name.endsWith('.md'))
      files.push(entryPath);
  }
  return files;
}

const requirements = await read('docs/requirements.md');
const scope = await read('docs/scope.md');
const assumptions = await read('docs/assumptions.md');
const traceability = await read('docs/traceability.md');

const requirementRows = [
  ...requirements.matchAll(
    /^\| `(REQ-[A-Z]+-\d{3})` \| `([^`]+)` \| `(P\d)` \| ([^|]+) \| ([^|]+) \| ([^|]+) \| ([^|]+) \|$/gmu,
  ),
];
assert(requirementRows.length > 0, 'No normative requirement rows found');
assert(
  duplicates(requirementRows.map((match) => match[1])).length === 0,
  'Requirement IDs must be unique',
);

const mandatory = requirementRows.filter((match) =>
  ['P0', 'P1'].includes(match[3]),
);
const mandatoryTraceRows = [
  ...traceability.matchAll(
    /^\| `(REQ-[A-Z]+-\d{3})` \| `(P[01])` \| ([^|]+) \| ([^|]+) \| ([^|]+) \| `([^`]+)` \|$/gmu,
  ),
];
const traceById = new Map(mandatoryTraceRows.map((match) => [match[1], match]));

for (const row of mandatory) {
  const id = row[1];
  const trace = traceById.get(id);
  assert(Boolean(trace), `${id} is missing from the mandatory trace matrix`);
  if (!trace) continue;
  assert(trace[2] === row[3], `${id} priority differs in traceability`);
  assert(/`[A-Z]+-\d{3}`/u.test(trace[3]), `${id} has no owner task`);
  assert(/`TS-[A-Z]+`/u.test(trace[4]), `${id} has no test suite`);
}

assert(
  mandatoryTraceRows.length === mandatory.length,
  'Mandatory requirement/trace row counts differ',
);
assert(
  mandatoryTraceRows.every(
    (row) => !row[1].startsWith('REQ-OPT-') && !row[1].startsWith('REQ-POST-'),
  ),
  'Optional or post-1.0 requirement appears in a core gate',
);

for (const [label, values] of [
  ['decision', collect(/^\| `(DEC-\d{3})` \|/gmu, assumptions)],
  ['assumption', collect(/^\| `(ASM-\d{3})` \|/gmu, assumptions)],
  ['non-goal', collect(/^\| `(NG-\d{3})` \|/gmu, scope)],
  ['test suite', collect(/^\| `(TS-[A-Z]+)` \|/gmu, traceability)],
]) {
  assert(values.length > 0, `No ${label} IDs found`);
  assert(duplicates(values).length === 0, `Duplicate ${label} IDs found`);
}

const auditStart = traceability.indexOf('## Security owner audit');
const auditEnd = traceability.indexOf('## Automated baseline checks');
const securityAudit = traceability.slice(auditStart, auditEnd);
for (const id of requirementRows
  .map((row) => row[1])
  .filter((id) => id.startsWith('REQ-SEC-'))) {
  assert(
    securityAudit.includes(`| \`${id}\` |`),
    `${id} missing security audit`,
  );
}

const baselineText = requirements + scope + assumptions + traceability;
const taskReferences = collect(
  /`((?:FOUND|ARCH|ERR|MODEL|MERGE|PROV|SNAP|SRC|SEC|VAL|DIFF|OBS|TYPE|PKG|QA|PERF|DOC|CI|REL|MAINT|POST)-\d{3})`/gu,
  baselineText,
);
assert(taskReferences.length > 0, 'No canonical task references found');

for (const baseline of [
  'requirements.md',
  'scope.md',
  'assumptions.md',
  'traceability.md',
]) {
  const text = await read(`docs/${baseline}`);
  for (const other of [
    'requirements.md',
    'scope.md',
    'assumptions.md',
    'traceability.md',
  ]) {
    if (baseline !== other) {
      assert(text.includes(`./${other}`), `${baseline} does not link ${other}`);
    }
  }
}

const adrFiles = (await readdir(path.join(docsRoot, 'adr')))
  .filter((file) => /^\d{4}-.+\.md$/u.test(file))
  .sort();
adrFiles.forEach((file, index) => {
  const expected = String(index + 1).padStart(4, '0');
  assert(file.startsWith(expected), `ADR sequence gap before ${file}`);
});
for (const file of adrFiles) {
  const text = await read(`docs/adr/${file}`);
  assert(text.includes('- Status: Accepted'), `${file} is not accepted`);
}

for (const file of await markdownFiles(docsRoot)) {
  const text = await readFile(file, 'utf8');
  for (const match of text.matchAll(/\[[^\]]+\]\(([^)]+)\)/gu)) {
    let target = match[1]?.trim();
    if (!target || /^(?:https?:|mailto:|#)/u.test(target)) continue;
    if (target.startsWith('<') && target.endsWith('>')) {
      target = target.slice(1, -1);
    }
    target = target.split('#', 1)[0];
    if (!target) continue;
    const resolved = path.resolve(
      path.dirname(file),
      decodeURIComponent(target),
    );
    try {
      await stat(resolved);
    } catch {
      failures.push(
        `Broken local link: ${path.relative(root, file)} -> ${target}`,
      );
    }
  }
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    `Docs check passed: ${requirementRows.length} requirements, ` +
      `${mandatory.length} mandatory rows, ${adrFiles.length} accepted ADRs`,
  );
}
