import { readFileSync } from 'node:fs';
import process from 'node:process';

import { KasaneError } from '@worldhacker/kasane';
import type {
  ConfigDiff,
  ConfigSnapshot,
  Explanation,
  Origin,
  RedactedConfigNode,
} from '@worldhacker/kasane';

import { DEFAULT_CONFIG_FILE, loadCliConfig } from './config.js';
import { CLI_EXIT_CODES, CliError } from './errors.js';
import type { CliErrorJson, CliExitCode } from './errors.js';

export const CLI_OUTPUT_SCHEMA = '@worldhacker/kasane-cli-output' as const;
export const CLI_OUTPUT_SCHEMA_VERSION = 1 as const;

export interface CliIo {
  readonly cwd?: string;
  readonly stderr?: (text: string) => void;
  readonly stdout?: (text: string) => void;
}

type Command =
  | Readonly<{
      configPath?: string;
      json: boolean;
      kind: 'diff';
      other: string;
    }>
  | Readonly<{
      configPath?: string;
      json: boolean;
      kind: 'explain';
      path: string;
    }>
  | Readonly<{ configPath?: string; json: boolean; kind: 'help' }>
  | Readonly<{ configPath?: string; json: boolean; kind: 'print' }>
  | Readonly<{
      configPath?: string;
      json: boolean;
      kind: 'sources';
      path?: string;
    }>
  | Readonly<{ configPath?: string; json: boolean; kind: 'version' }>;

interface SourceRecord {
  readonly origin?: Origin;
  readonly path: string;
}

const HELP = `Usage: kasane [--config <file>] [--json] <command>

Commands:
  explain <path>       Explain a configuration path
  sources [path]       List safe source provenance
  diff <other-config>  Compare two configurations
  print                Print the redacted configuration

Options:
  -c, --config <file>  Config contract (default: ${DEFAULT_CONFIG_FILE})
  --json               Emit the versioned machine-output envelope
  -h, --help           Show help
  -v, --version        Show version

Only declarative JSON config version 1 is supported. JavaScript config files
are never executed, and there is no option that reveals secrets.`;

function usage(message: string): never {
  throw new CliError('KASANE_CLI_USAGE', message, CLI_EXIT_CODES.usage);
}

function parseArguments(argv: readonly string[]): Command {
  let configPath: string | undefined;
  let json = false;
  let help = false;
  let version = false;
  const positional: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--json') json = true;
    else if (argument === '-h' || argument === '--help') help = true;
    else if (argument === '-v' || argument === '--version') version = true;
    else if (argument === '-c' || argument === '--config') {
      const next = argv[index + 1];
      if (next === undefined || next.startsWith('-')) {
        return usage(`${argument} requires a file path.`);
      }
      configPath = next;
      index += 1;
    } else if (argument?.startsWith('--config=')) {
      configPath = argument.slice('--config='.length);
      if (configPath.length === 0)
        return usage('--config requires a file path.');
    } else if (argument?.startsWith('-')) {
      return usage(`Unknown option: ${argument}`);
    } else if (argument !== undefined) positional.push(argument);
  }
  const common = { ...(configPath === undefined ? {} : { configPath }), json };
  if (help) return Object.freeze({ ...common, kind: 'help' });
  if (version) return Object.freeze({ ...common, kind: 'version' });
  const [kind, ...operands] = positional;
  if (kind === 'print' && operands.length === 0) {
    return Object.freeze({ ...common, kind });
  }
  const operand = operands[0];
  if (kind === 'explain' && operand !== undefined && operands.length === 1) {
    return Object.freeze({ ...common, kind, path: operand });
  }
  if (kind === 'sources' && operands.length <= 1) {
    return Object.freeze({
      ...common,
      kind,
      ...(operands[0] === undefined ? {} : { path: operands[0] }),
    });
  }
  if (kind === 'diff' && operand !== undefined && operands.length === 1) {
    return Object.freeze({ ...common, kind, other: operand });
  }
  if (kind === undefined) return usage('A command is required.');
  return usage(`Invalid operands for command: ${kind}`);
}

function pathSegment(segment: string): string {
  return segment.replaceAll('\\', '\\\\').replaceAll('.', '\\.');
}

function serializePath(segments: readonly string[]): string {
  return segments.map(pathSegment).join('.');
}

function terminalPaths(value: RedactedConfigNode): readonly string[] {
  const result: string[] = [];
  function visit(
    current: RedactedConfigNode,
    segments: readonly string[],
  ): void {
    if (Array.isArray(current)) {
      if (current.length === 0) result.push(serializePath(segments));
      else
        current.forEach((entry, index) => {
          visit(entry, [...segments, String(index)]);
        });
      return;
    }
    if (typeof current === 'object' && current !== null) {
      const entries = Object.entries(current);
      if (entries.length === 0) result.push(serializePath(segments));
      else for (const [key, entry] of entries) visit(entry, [...segments, key]);
      return;
    }
    result.push(serializePath(segments));
  }
  visit(value, []);
  return result.sort();
}

function pathMissing(explanation: Explanation): never {
  if (explanation.found) throw new Error('Expected a missing explanation.');
  throw new CliError(
    'KASANE_CLI_PATH_MISSING',
    'Configuration path was not found.',
    CLI_EXIT_CODES.missingPath,
    {
      nearest: explanation.nearest,
      path: explanation.path,
      ...(explanation.removal === undefined ? {} : { removed: true }),
    },
  );
}

function sources(
  snapshot: ConfigSnapshot<unknown>,
  selected?: string,
): readonly SourceRecord[] {
  const paths =
    selected === undefined ? terminalPaths(snapshot.toJSON()) : [selected];
  return Object.freeze(
    paths.map((path) => {
      const explanation = snapshot.explain(path);
      if (!explanation.found) return pathMissing(explanation);
      return Object.freeze({
        ...(explanation.origin === undefined
          ? {}
          : { origin: explanation.origin }),
        path,
      });
    }),
  );
}

function formatSources(records: readonly SourceRecord[]): string {
  if (records.length === 0) return 'No configuration sources.';
  return records
    .map((record) => {
      if (record.origin === undefined)
        return `${record.path || '<root>'} <- unavailable`;
      const reference =
        record.origin.inputReference ?? record.origin.sourceReference;
      return `${record.path || '<root>'} <- ${record.origin.layer.kind}:${record.origin.layer.name}${reference === undefined ? '' : ` (${reference})`}${record.origin.secret ? ' [secret]' : ''}`;
    })
    .join('\n');
}

function successEnvelope(command: string, data: unknown): unknown {
  return {
    command,
    data,
    ok: true,
    schema: CLI_OUTPUT_SCHEMA,
    schemaVersion: CLI_OUTPUT_SCHEMA_VERSION,
  };
}

function errorEnvelope(error: CliErrorJson): unknown {
  return {
    error,
    ok: false,
    schema: CLI_OUTPUT_SCHEMA,
    schemaVersion: CLI_OUTPUT_SCHEMA_VERSION,
  };
}

function json(value: unknown): string {
  return `${JSON.stringify(value, undefined, 2)}\n`;
}

function cliVersion(): string {
  try {
    const manifest = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as unknown;
    if (typeof manifest !== 'object' || manifest === null) return 'unknown';
    const version = (manifest as Record<string, unknown>)['version'];
    return typeof version === 'string' ? version : 'unknown';
  } catch {
    return 'unknown';
  }
}

function wrapError(error: unknown): CliError {
  if (error instanceof CliError) return error;
  if (error instanceof KasaneError) {
    return new CliError(
      'KASANE_CLI_LOAD_FAILED',
      'Kasane configuration could not be loaded.',
      CLI_EXIT_CODES.config,
      { causeCode: error.code },
    );
  }
  return new CliError(
    'KASANE_CLI_INTERNAL',
    'Kasane CLI encountered an unexpected failure.',
    CLI_EXIT_CODES.internal,
  );
}

function humanDiff(diff: ConfigDiff): string {
  return diff.changes.length === 0
    ? 'No changes.'
    : JSON.stringify(diff, undefined, 2);
}

export async function runCli(
  argv: readonly string[],
  io: CliIo = {},
): Promise<CliExitCode> {
  const stdout = io.stdout ?? ((text: string) => process.stdout.write(text));
  const stderr = io.stderr ?? ((text: string) => process.stderr.write(text));
  let machine = argv.includes('--json');
  try {
    const command = parseArguments(argv);
    machine = command.json;
    if (command.kind === 'help') {
      stdout(
        machine ? json(successEnvelope('help', { text: HELP })) : `${HELP}\n`,
      );
      return CLI_EXIT_CODES.success;
    }
    if (command.kind === 'version') {
      const data = { version: cliVersion() };
      stdout(
        machine ? json(successEnvelope('version', data)) : `${data.version}\n`,
      );
      return CLI_EXIT_CODES.success;
    }
    const loaded = await loadCliConfig({
      ...(command.configPath === undefined
        ? {}
        : { configPath: command.configPath }),
      ...(io.cwd === undefined ? {} : { cwd: io.cwd }),
    });
    let data: unknown;
    let human: string;
    if (command.kind === 'print') {
      data = loaded.snapshot.toJSON();
      human = JSON.stringify(data, undefined, 2);
    } else if (command.kind === 'explain') {
      const explanation = loaded.snapshot.explain(command.path);
      if (!explanation.found) return pathMissing(explanation);
      data = explanation;
      human = explanation.format();
    } else if (command.kind === 'sources') {
      const records = sources(loaded.snapshot, command.path);
      data = records;
      human = formatSources(records);
    } else {
      const other = await loadCliConfig({
        configPath: command.other,
        ...(io.cwd === undefined ? {} : { cwd: io.cwd }),
      });
      const diff = loaded.snapshot.diff(other.snapshot);
      data = diff;
      human = humanDiff(diff);
    }
    stdout(machine ? json(successEnvelope(command.kind, data)) : `${human}\n`);
    return CLI_EXIT_CODES.success;
  } catch (error) {
    const safe = wrapError(error);
    if (machine) stdout(json(errorEnvelope(safe.toJSON())));
    else stderr(`${safe.code}: ${safe.message}\n`);
    return safe.exitCode;
  }
}
