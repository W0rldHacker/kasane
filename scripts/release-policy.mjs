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

export function parseChangeset(source, filename = '<changeset>') {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]+)$/u.exec(
    source.trim(),
  );
  assert(match, `${filename} must contain YAML frontmatter and a summary`);
  const declaration =
    /^['"]?@w0rldhacker\/kasane['"]?:\s*(patch|minor|major)\s*$/mu.exec(
      match[1],
    );
  assert(
    declaration,
    `${filename} must classify @w0rldhacker/kasane as patch, minor, or major`,
  );

  const body = match[2].trim();
  const categoryMatch = /^(Added|Changed|Fixed|Security):\s+([\s\S]+)$/u.exec(
    body,
  );
  assert(
    categoryMatch,
    `${filename} summary must start with Added:, Changed:, Fixed:, or Security:`,
  );
  const type = declaration[1];
  const metadata = Object.fromEntries(
    [...body.matchAll(/^([A-Za-z-]+):\s*(.+)$/gmu)]
      .filter((entry) => entry[1] !== categoryMatch[1])
      .map((entry) => [entry[1], entry[2].trim()]),
  );
  const summary = categoryMatch[2]
    .replace(/^Breaking:\s*.+$/gmu, '')
    .replace(/^Breaking-Approval:\s*.+$/gmu, '')
    .replace(/^Migration:\s*.+$/gmu, '')
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
  if (type === 'major') {
    assert(breaking, `${filename} major release requires Breaking: true`);
  }
  if (type === 'major' || breaking) {
    assert(
      metadata['Breaking-Approval'],
      `${filename} breaking release requires Breaking-Approval metadata`,
    );
    assert(
      metadata.Migration,
      `${filename} breaking release requires a Migration link`,
    );
  }

  return { breaking, category: categoryMatch[1], metadata, summary, type };
}
