export const CLI_EXIT_CODES = Object.freeze({
  success: 0,
  internal: 1,
  usage: 2,
  config: 3,
  missingPath: 4,
} as const);

export type CliExitCode = (typeof CLI_EXIT_CODES)[keyof typeof CLI_EXIT_CODES];

export type CliErrorCode =
  | 'KASANE_CLI_CONFIG_INVALID'
  | 'KASANE_CLI_CONFIG_NOT_FOUND'
  | 'KASANE_CLI_INTERNAL'
  | 'KASANE_CLI_LOAD_FAILED'
  | 'KASANE_CLI_PATH_MISSING'
  | 'KASANE_CLI_USAGE';

export interface CliErrorJson {
  readonly code: CliErrorCode;
  readonly details?: Readonly<Record<string, boolean | number | string>>;
  readonly message: string;
}

export class CliError extends Error {
  readonly code: CliErrorCode;
  readonly details: Readonly<Record<string, boolean | number | string>>;
  readonly exitCode: CliExitCode;

  constructor(
    code: CliErrorCode,
    message: string,
    exitCode: CliExitCode,
    details: Readonly<Record<string, boolean | number | string>> = {},
  ) {
    super(message);
    this.name = 'CliError';
    this.code = code;
    this.details = Object.freeze({ ...details });
    this.exitCode = exitCode;
  }

  toJSON(): CliErrorJson {
    return Object.freeze({
      code: this.code,
      ...(Object.keys(this.details).length === 0
        ? {}
        : { details: this.details }),
      message: this.message,
    });
  }
}
