export const caseCollisionOrders = [
  [
    ['APP_Server', 'one'],
    ['APP_SERVER', 'two'],
  ],
  [
    ['APP_SERVER', 'two'],
    ['APP_Server', 'one'],
  ],
] as const;

export const parentChildCollisionOrders = [
  [
    ['APP_DATABASE', 'parent'],
    ['APP_DATABASE__HOST', 'child'],
  ],
  [
    ['APP_DATABASE__HOST', 'child'],
    ['APP_DATABASE', 'parent'],
  ],
] as const;

/** Reproduces Windows' case-insensitive environment-name edge on every OS. */
export const windowsCaseFixture = [
  ['Path', 'mixed-case'],
  ['PATH', 'upper-case'],
] as const;
