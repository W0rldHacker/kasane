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

function escapeRegularExpression(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
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

function namedExports(source) {
  const names = new Set();
  for (const match of source.matchAll(/export(?:\s+type)?\s*\{([^}]+)\}/gu)) {
    for (const item of (match[1] ?? '').split(',')) {
      const name = item
        .replace(/\/\*[\s\S]*?\*\//gu, '')
        .trim()
        .replace(/^type\s+/u, '')
        .split(/\s+as\s+/u, 1)[0];
      if (name) names.add(name);
    }
  }
  return names;
}

function importedNames(declaration) {
  return declaration
    .split(',')
    .map(
      (item) =>
        item
          .trim()
          .replace(/^type\s+/u, '')
          .split(/\s+as\s+/u, 1)[0],
    )
    .filter(Boolean);
}

function mergeMatrixMarkdown(matrix) {
  const header = `| Existing \\ incoming | ${matrix.incomingKinds
    .map((kind) => `\`${kind}\``)
    .join(' | ')} |`;
  const separator = `| ${Array.from(
    { length: matrix.incomingKinds.length + 1 },
    () => '---',
  ).join(' | ')} |`;
  const rows = matrix.defaultRows.map(
    (row) =>
      `| \`${row.existing}\` | ${row.outcomes
        .map((outcome) => `\`${outcome}\``)
        .join(' | ')} |`,
  );
  return [header, separator, ...rows].join('\n');
}

const apiDefaults = [
  [
    '`kasane`',
    '`cwd`',
    '`process.cwd()`',
    'Captured once per invocation; relative configured paths resolve against it',
  ],
  [
    '`kasane`',
    '`fingerprintKey`',
    'none',
    'Secret fingerprints use unkeyed SHA-256',
  ],
  ['`kasane`', '`freeze`', '`true`', 'Snapshot-owned value is deeply frozen'],
  [
    '`kasane`',
    '`limits`',
    '`DEFAULT_KASANE_LIMITS`',
    'Depth 64, nodes 100,000, string bytes 1,000,000, file bytes 10,000,000',
  ],
  [
    '`kasane`',
    '`merge`',
    'no rules',
    'Object/object merges recursively; other defined pairs replace',
  ],
  ['`kasane`', '`onEvent`', 'none', 'No lifecycle metrics are published'],
  [
    '`kasane`',
    '`provenance`',
    '`origin-only`',
    'Current origin and tombstones are retained without prior history',
  ],
  [
    '`kasane`',
    '`secrets`',
    'no paths',
    'Only layer and `secretValue` annotations apply',
  ],
  ['`kasane`', '`signal`', 'none', 'No external cancellation signal'],
  [
    '`kasane`',
    '`validate`',
    'none',
    'Final normalized value is not runtime-validated',
  ],
  [
    'all layers',
    '`enabled`',
    '`true`',
    'Descriptor participates in preflight, loading, and merge',
  ],
  [
    '`value` / `file` / `env`',
    '`secret`',
    '`false`',
    'Incoming descendants are public unless another annotation applies',
  ],
  ['`file`', '`optional`', '`false`', 'Missing file is a source error'],
  [
    '`file`',
    '`parse`',
    '`JSON.parse`',
    'Complete bounded UTF-8 text is parsed as JSON',
  ],
  ['`env`', '`case`', '`lower`', 'Prefix-mode path segments are lowercased'],
  ['`env`', '`coerce`', '`false`', 'Environment values remain strings'],
  [
    '`env`',
    '`map`',
    'none',
    'Prefix mode selects variables instead of explicit-map mode',
  ],
  [
    '`env`',
    '`prefix`',
    'empty string',
    'Prefix mode considers every variable when no map is supplied',
  ],
  [
    '`env`',
    '`separator`',
    '`__`',
    'Prefix-mode variable names split into path segments on two underscores',
  ],
  [
    '`env`',
    '`source`',
    '`process.env`',
    'Environment is snapshotted for the invocation',
  ],
  [
    '`secret`',
    'sensitivity',
    'all descendants',
    'Secret loader output is always annotated secret',
  ],
];

function apiDefaultsMarkdown() {
  return [
    '| Surface | Option | Default | Semantic note |',
    '| --- | --- | --- | --- |',
    ...apiDefaults.map((row) => `| ${row.join(' | ')} |`),
  ].join('\n');
}

const requirements = await read('docs/requirements.md');
const scope = await read('docs/scope.md');
const assumptions = await read('docs/assumptions.md');
const traceability = await read('docs/traceability.md');
const mergeMatrix = JSON.parse(await read('test/fixtures/merge-matrix.json'));

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
const adrIndex = await read('docs/adr/README.md');
const indexedAdrs = new Map(
  [
    ...adrIndex.matchAll(
      /^\| \[ADR-(\d{4})\]\(\.\/([^)]+)\) \| (Accepted|Superseded) \|/gmu,
    ),
  ].map((match) => [match[2], match[3]]),
);
for (const file of adrFiles) {
  const text = await read(`docs/adr/${file}`);
  const status = text.match(/^- Status: (Accepted|Superseded)$/mu)?.[1];
  assert(status !== undefined, `${file} has no accepted ADR lifecycle status`);
  assert(
    indexedAdrs.get(file) === status,
    `${file} status differs in ADR index`,
  );
  if (status === 'Superseded') {
    assert(
      /^- Superseded by: ADR-\d{4}$/mu.test(text),
      `${file} has no superseding ADR`,
    );
  }
}
assert(indexedAdrs.size === adrFiles.length, 'ADR index/file counts differ');

const guideFiles = await markdownFiles(path.join(docsRoot, 'guides'));
const documentationFiles = [
  path.join(root, 'README.md'),
  path.join(root, 'SECURITY.md'),
  path.join(root, 'CONTRIBUTING.md'),
  path.join(root, 'CODE_OF_CONDUCT.md'),
  path.join(root, 'examples', 'README.md'),
  ...(await markdownFiles(docsRoot)),
];

for (const file of documentationFiles) {
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

assert(
  Array.isArray(mergeMatrix.incomingKinds) &&
    mergeMatrix.incomingKinds.length === 8,
  'Merge matrix fixture must contain eight incoming kinds',
);
assert(
  Array.isArray(mergeMatrix.defaultRows) &&
    mergeMatrix.defaultRows.length === 7 &&
    mergeMatrix.defaultRows.every(
      (row) =>
        Array.isArray(row.outcomes) &&
        row.outcomes.length === mergeMatrix.incomingKinds.length,
    ),
  'Merge matrix fixture must contain all 56 default cells',
);

const expectedMergeMatrix = mergeMatrixMarkdown(mergeMatrix);
let mergeMatrixBlocks = 0;
for (const file of documentationFiles) {
  const text = await readFile(file, 'utf8');
  for (const match of text.matchAll(
    /<!-- merge-matrix:start -->\r?\n([\s\S]*?)\r?\n<!-- merge-matrix:end -->/gu,
  )) {
    mergeMatrixBlocks += 1;
    assert(
      match[1]?.trim() === expectedMergeMatrix,
      `Merge matrix drift: ${path.relative(root, file)}`,
    );
  }
}
assert(
  mergeMatrixBlocks === 2,
  'Expected verified merge matrices in the normative document and user guide',
);

const apiReference = await read('docs/api.md');
const defaultBlocks = [
  ...apiReference.matchAll(
    /<!-- api-defaults:start -->\r?\n([\s\S]*?)\r?\n<!-- api-defaults:end -->/gu,
  ),
];
assert(defaultBlocks.length === 1, 'Expected one generated API defaults table');
assert(
  defaultBlocks[0]?.[1]?.trim() === apiDefaultsMarkdown(),
  'Public API defaults table is stale or incorrect',
);

for (const [file, fragments] of [
  [
    'src/kasane.ts',
    [
      'options.cwd ?? invocationCwd',
      'createMergeRuleIndex([])',
      'createSecretPathMatcher(invocationOptions.secrets)',
    ],
  ],
  [
    'src/snapshot/snapshot.ts',
    ['options.freeze === false ? detached : deepFreezeConfigNode(detached)'],
  ],
  [
    'src/provenance/history.ts',
    ["DEFAULT_PROVENANCE_MODE: ProvenanceMode = 'origin-only'"],
  ],
  ['src/security/limits.ts', ['DEFAULT_MAX_SOURCE_BYTES = 10_000_000']],
  [
    'src/normalize/limits.ts',
    ['maxDepth: 64', 'maxNodes: 100_000', 'maxStringLength: 1_000_000'],
  ],
  [
    'src/layers/preflight.ts',
    ['enabled: enabledValue !== false', 'secret: secretValue === true'],
  ],
  [
    'src/layers/file.ts',
    [
      'const optional = options.optional === true',
      'const parse = options.parse ?? parseJson',
    ],
  ],
  [
    'src/layers/env.ts',
    [
      "casing: casing ?? 'lower'",
      'coerce: coerce ?? false',
      "prefix: prefix ?? ''",
      "separator: separator ?? '__'",
      '?? process.env',
    ],
  ],
  ['src/layers/secret.ts', ['secret: true']],
]) {
  const source = await read(file);
  for (const fragment of fragments) {
    assert(
      source.includes(fragment),
      `Default evidence drift: ${file} -> ${fragment}`,
    );
  }
}

const snippetFiles = [
  path.join(root, 'README.md'),
  path.join(root, 'CONTRIBUTING.md'),
  path.join(root, 'docs', 'api.md'),
  path.join(root, 'docs', 'architecture.md'),
  ...guideFiles,
];
const rootExports = namedExports(await read('src/index.ts'));
const standardSchemaExports = namedExports(
  await read('src/standard-schema.ts'),
);
const publicApiGuide = await read('docs/guides/public-api.md');
for (const [document, text] of [
  ['docs/api.md', apiReference],
  ['docs/guides/public-api.md', publicApiGuide],
]) {
  for (const [specifier, exports] of [
    ['@worldhacker/kasane', rootExports],
    ['@worldhacker/kasane/standard-schema', standardSchemaExports],
  ]) {
    for (const name of exports) {
      assert(
        new RegExp(`\`${escapeRegularExpression(name)}(?:\`|\\W)`, 'u').test(
          text,
        ),
        `Undocumented public export in ${document}: ${specifier}#${name}`,
      );
    }
  }
}
let importSnippets = 0;
let doctests = 0;

for (const file of snippetFiles) {
  const markdown = await readFile(file, 'utf8');
  for (const block of markdown.matchAll(
    /```(?:js|mjs|ts|typescript)\r?\n([\s\S]*?)```/gu,
  )) {
    const code = block[1] ?? '';
    for (const imported of code.matchAll(
      /import\s+(?:type\s+)?\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/gu,
    )) {
      importSnippets += 1;
      const specifier = imported[2];
      if (
        specifier !== '@worldhacker/kasane' &&
        !specifier.startsWith('@worldhacker/kasane/')
      ) {
        importSnippets -= 1;
        continue;
      }
      const available =
        specifier === '@worldhacker/kasane'
          ? rootExports
          : specifier === '@worldhacker/kasane/standard-schema'
            ? standardSchemaExports
            : undefined;
      assert(
        available !== undefined,
        `Unsupported Kasane import in ${path.relative(root, file)}: ${specifier}`,
      );
      if (available === undefined) continue;
      for (const name of importedNames(imported[1] ?? '')) {
        assert(
          available.has(name),
          `Unknown public export in ${path.relative(root, file)}: ${specifier}#${name}`,
        );
      }
    }
  }

  for (const match of markdown.matchAll(
    /<!-- doctest:([^ >]+) -->\s*```(?:js|mjs|ts|typescript)\r?\n([\s\S]*?)```/gu,
  )) {
    doctests += 1;
    const referenced = path.resolve(root, match[1]);
    try {
      const source = await readFile(referenced, 'utf8');
      assert(
        (match[2] ?? '').trimEnd() === source.trimEnd(),
        `Doctest drift: ${path.relative(root, file)} -> ${match[1]}`,
      );
    } catch {
      failures.push(
        `Missing doctest source: ${path.relative(root, file)} -> ${match[1]}`,
      );
    }
  }
}

assert(importSnippets >= 10, 'Expected public-import checks for user guides');
assert(doctests >= 1, 'Expected at least one executable README doctest');

if (failures.length > 0) {
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    `Docs check passed: ${requirementRows.length} requirements, ` +
      `${mandatory.length} mandatory rows, ${adrFiles.length} tracked ADRs, ` +
      `${String(importSnippets)} public imports, ${String(doctests)} doctests`,
  );
}
