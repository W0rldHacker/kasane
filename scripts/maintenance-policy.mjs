import assert from 'node:assert/strict';

const isoDate = /^\d{4}-\d{2}-\d{2}$/u;

export function validateMaintenancePolicy(policy) {
  assert.equal(policy.schemaVersion, 1, 'Unsupported maintenance schema');
  assert.equal(typeof policy.owner, 'string', 'Maintenance owner is required');
  assert(policy.owner.length > 0, 'Maintenance owner cannot be empty');
  assert.equal(
    policy.backup,
    null,
    'A backup must be a real named owner; use null when none exists',
  );
  assert.equal(policy.stableMajor, 1, 'Stable support major must match 1.x');

  for (const field of [
    'supportStarted',
    'supportReviewOpens',
    'supportDecisionDeadline',
    'supportEndsWithoutExtension',
  ]) {
    assert(isoDate.test(policy[field]), `${field} must be an ISO date`);
  }
  assert(
    policy.supportStarted < policy.supportReviewOpens &&
      policy.supportReviewOpens < policy.supportDecisionDeadline &&
      policy.supportDecisionDeadline < policy.supportEndsWithoutExtension,
    'Support review dates must be strictly ordered',
  );
  assert.deepEqual(
    policy.quarterlyReviewMonths,
    [1, 4, 7, 10],
    'Quarterly reviews must run in January, April, July, and October',
  );

  assert.deepEqual(
    policy.nodeLines.map(({ major, status }) => [major, status]),
    [
      [22, 'required'],
      [24, 'required'],
      [26, 'advisory'],
    ],
    'Node 22/24 must remain required and Node 26 advisory',
  );
  for (const line of policy.nodeLines) {
    assert(isoDate.test(line.upstreamEol), `Node ${line.major} needs EOL`);
  }
  const firstRequiredEol = policy.nodeLines
    .filter(({ status }) => status === 'required')
    .map(({ upstreamEol }) => upstreamEol)
    .sort()[0];
  assert.equal(
    policy.supportEndsWithoutExtension,
    firstRequiredEol,
    'The unextended support window must stop at the first required Node EOL',
  );

  const labelNames = policy.labels.map(({ name }) => name);
  assert.equal(
    new Set(labelNames).size,
    labelNames.length,
    'Maintenance label names must be unique',
  );
  for (const label of policy.labels) {
    assert(label.name.length > 0, 'Label name cannot be empty');
    assert(
      /^[0-9A-F]{6}$/u.test(label.color),
      `${label.name} color is invalid`,
    );
    assert(label.description.length > 0, `${label.name} needs a description`);
  }
}

export function supportTable(policy) {
  validateMaintenancePolicy(policy);
  const rows = [
    ['Release line', 'Status', 'Fix policy', 'Runtime window'],
    [
      `\`${policy.stableMajor}.x\` latest minor and patch`,
      'Supported',
      'Compatible production and security fixes',
      `Node.js 22 and 24; commitment ends no later than ${policy.supportEndsWithoutExtension} unless an explicit funded extension replaces this table`,
    ],
    [
      `Earlier \`${policy.stableMajor}.x\` minors or patches`,
      'Upgrade required',
      'Security backport only when an advisory explicitly names the line',
      'No independent runtime window',
    ],
    ['`0.x` prereleases', 'Unsupported', 'No fixes or backports', 'None'],
    [
      '`main`',
      'Development only',
      'Fixes are prepared here; it is not a release',
      'Required CI matrix',
    ],
  ];
  const widths = rows[0].map((_, column) =>
    Math.max(...rows.map((row) => row[column].length)),
  );
  const render = (row) =>
    `| ${row.map((cell, column) => cell.padEnd(widths[column])).join(' | ')} |`;
  const separator = render(widths.map((width) => '-'.repeat(width)));
  return `\n${[render(rows[0]), separator, ...rows.slice(1).map(render)].join('\n')}\n`;
}

export function replaceSupportTable(markdown, table) {
  const pattern =
    /(<!-- maintenance-support:start -->\r?\n)[\s\S]*?(\r?\n<!-- maintenance-support:end -->)/u;
  assert(
    pattern.test(markdown),
    'Document is missing maintenance table markers',
  );
  return markdown.replace(pattern, `$1${table}$2`);
}
