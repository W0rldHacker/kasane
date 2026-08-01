import assert from 'node:assert/strict';

export const changelogCategories = ['Added', 'Changed', 'Fixed', 'Security'];
export const releaseTypes = ['patch', 'minor', 'major'];

export function parseVersion(version) {
  const match =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?$/u.exec(
      version,
    );
  assert(match, `Invalid SemVer version: ${version}`);
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ?? null,
  };
}

export function npmTagForVersion(version) {
  const { prerelease } = parseVersion(version);
  if (prerelease === null) return 'latest';
  const channel = prerelease.split('.')[0];
  assert(
    ['alpha', 'beta', 'rc'].includes(channel),
    `Unsupported prerelease channel "${channel}"; use alpha, beta, or rc`,
  );
  return channel === 'alpha' ? 'next' : channel;
}

export function assertVersionTag(version, tags) {
  const tag = npmTagForVersion(version);
  assert.equal(
    tags[tag],
    version,
    `${tag} points to ${String(tags[tag])} instead of ${version}`,
  );
  if (parseVersion(version).prerelease !== null) {
    assert.notEqual(tags.latest, version, 'Prerelease must not receive latest');
  }
  return tag;
}

export function pendingChangesetFiles(files, preState = null) {
  const consumed = new Set(
    preState?.mode === 'pre' && Array.isArray(preState.changesets)
      ? preState.changesets.map((id) => `${id}.md`)
      : [],
  );
  return files.filter(
    (file) =>
      file.endsWith('.md') && file !== 'README.md' && !consumed.has(file),
  );
}

export function parseChangeset(source, filename = '<changeset>') {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]+)$/u.exec(
    source.trim(),
  );
  assert(match, `${filename} must contain YAML frontmatter and a summary`);
  const declarations = [
    ...match[1].matchAll(
      /^['"]?(@worldhacker\/(?:kasane|kasane-cli|kasane-source-testkit|kasane-watch))['"]?:\s*(patch|minor|major)\s*$/gmu,
    ),
  ];
  assert(
    declarations.length === 1,
    `${filename} must classify exactly one releasable Kasane package as patch, minor, or major`,
  );
  const declaration = declarations[0];
  const packageName = declaration[1];

  const body = match[2].trim();
  const categoryMatch = /^(Added|Changed|Fixed|Security):\s+([\s\S]+)$/u.exec(
    body,
  );
  assert(
    categoryMatch,
    `${filename} summary must start with Added:, Changed:, Fixed:, or Security:`,
  );
  const type = declaration[2];
  const metadata = Object.fromEntries(
    [...body.matchAll(/^([A-Za-z-]+):\s*(.+)$/gmu)]
      .filter((entry) => entry[1] !== categoryMatch[1])
      .map((entry) => [entry[1], entry[2].trim()]),
  );
  const summary = categoryMatch[2]
    .replace(/^Breaking:\s*.+$/gmu, '')
    .replace(/^Breaking-Approval:\s*.+$/gmu, '')
    .replace(/^Migration:\s*.+$/gmu, '')
    .replace(/^Promotion:\s*.+$/gmu, '')
    .replace(/^Promotion-Approval:\s*.+$/gmu, '')
    .replace(/\s+/gu, ' ')
    .trim();
  assert(summary.length > 0, `${filename} must include a user-facing summary`);

  if (metadata.Breaking !== undefined) {
    assert.equal(
      metadata.Breaking,
      'true',
      `${filename} Breaking metadata must be true when present`,
    );
  }
  const breaking = metadata.Breaking === 'true';
  const promotion = metadata.Promotion === '1.0';
  if (promotion) {
    assert.equal(
      packageName,
      '@worldhacker/kasane',
      `${filename} Promotion: 1.0 applies only to the core package`,
    );
  }
  if (type === 'major' && !breaking) {
    assert(
      promotion,
      `${filename} non-breaking major release must declare Promotion: 1.0`,
    );
    assert(
      metadata['Promotion-Approval'],
      `${filename} 1.0 promotion requires Promotion-Approval metadata`,
    );
    assert(
      metadata.Migration,
      `${filename} 1.0 promotion requires a Migration link`,
    );
  }
  if ((type === 'major' && !promotion) || breaking) {
    assert(
      metadata['Breaking-Approval'],
      `${filename} breaking release requires Breaking-Approval metadata`,
    );
    assert(
      metadata.Migration,
      `${filename} breaking release requires a Migration link`,
    );
  }

  return {
    breaking,
    category: categoryMatch[1],
    metadata,
    packageName,
    summary,
    type,
  };
}
