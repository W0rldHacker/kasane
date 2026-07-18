import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const [profile = 'fast', ...argumentsToForward] = process.argv.slice(2);
if (profile !== 'fast' && profile !== 'nightly') {
  throw new Error(`Unknown property profile: ${profile}`);
}

function parseArguments(arguments_) {
  const forwarded = [];
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index] ?? '';
    if (argument.startsWith('--seed=')) {
      return {
        forwarded: [...forwarded, ...arguments_.slice(index + 1)],
        seed: argument.slice('--seed='.length),
      };
    }
    if (argument === '--seed') {
      return {
        forwarded: [...forwarded, ...arguments_.slice(index + 2)],
        seed: arguments_[index + 1],
      };
    }
    forwarded.push(argument);
  }
  return { forwarded, seed: undefined };
}

const { forwarded, seed } = parseArguments(argumentsToForward);
if (seed !== undefined && !Number.isSafeInteger(Number(seed))) {
  throw new Error(`Invalid property seed: ${seed}`);
}

const vitest = fileURLToPath(
  new URL('../node_modules/vitest/vitest.mjs', import.meta.url),
);
const child = spawn(
  process.execPath,
  [vitest, 'run', '--project', 'property', ...forwarded],
  {
    env: {
      ...process.env,
      KASANE_PROPERTY_PROFILE: profile,
      ...(seed === undefined ? {} : { KASANE_PROPERTY_SEED: seed }),
    },
    stdio: 'inherit',
  },
);

child.on('error', (error) => {
  throw error;
});
child.on('exit', (code, signal) => {
  if (signal !== null) {
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code ?? 1;
});
