import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const [target = 'fuzz', ...rawArguments] = process.argv.slice(2);
if (target !== 'fuzz' && target !== 'security') {
  throw new Error(`Unknown security test target: ${target}`);
}

function positiveInteger(raw, option) {
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`Invalid ${option}: ${String(raw)}`);
  }
  return value;
}

function parseArguments(arguments_) {
  const forwarded = [];
  let runs;
  let seed;
  let timeoutMs;

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index] ?? '';
    const next = arguments_[index + 1];
    if (argument.startsWith('--runs=')) {
      runs = positiveInteger(argument.slice('--runs='.length), '--runs');
      continue;
    }
    if (argument === '--runs') {
      runs = positiveInteger(next, '--runs');
      index += 1;
      continue;
    }
    if (argument.startsWith('--seed=')) {
      seed = positiveInteger(argument.slice('--seed='.length), '--seed');
      continue;
    }
    if (argument === '--seed') {
      seed = positiveInteger(next, '--seed');
      index += 1;
      continue;
    }
    if (argument.startsWith('--timeout-ms=')) {
      timeoutMs = positiveInteger(
        argument.slice('--timeout-ms='.length),
        '--timeout-ms',
      );
      continue;
    }
    if (argument === '--timeout-ms') {
      timeoutMs = positiveInteger(next, '--timeout-ms');
      index += 1;
      continue;
    }
    forwarded.push(argument);
  }

  return { forwarded, runs, seed, timeoutMs };
}

const { forwarded, runs, seed, timeoutMs } = parseArguments(rawArguments);
const effectiveRuns = runs ?? 2_000;
const effectiveTimeoutMs =
  timeoutMs ?? (effectiveRuns >= 100_000 ? 2_700_000 : 600_000);
const vitest = fileURLToPath(
  new URL('../node_modules/vitest/vitest.mjs', import.meta.url),
);
const projects =
  target === 'security'
    ? ['--project', 'security', '--project', 'fuzz']
    : ['--project', 'fuzz'];
const child = spawn(
  process.execPath,
  [vitest, 'run', ...projects, ...forwarded],
  {
    env: {
      ...process.env,
      KASANE_FUZZ_RUNS: String(effectiveRuns),
      KASANE_FUZZ_TIMEOUT_MS: String(effectiveTimeoutMs),
      ...(seed === undefined ? {} : { KASANE_FUZZ_SEED: String(seed) }),
    },
    stdio: 'inherit',
  },
);

const timeout = setTimeout(() => {
  console.error(
    `Security fuzz process exceeded ${String(effectiveTimeoutMs)}ms and was terminated.`,
  );
  child.kill('SIGKILL');
}, effectiveTimeoutMs);
timeout.unref();

child.on('error', (error) => {
  clearTimeout(timeout);
  throw error;
});
child.on('exit', (code, signal) => {
  clearTimeout(timeout);
  if (signal !== null) {
    process.exitCode = 1;
    return;
  }
  process.exitCode = code ?? 1;
});
