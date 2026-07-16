const benchmarks = new Map([
  [
    'provenance-smoke',
    new URL('../benchmarks/provenance-smoke.mjs', import.meta.url),
  ],
]);

const requested = process.argv.slice(2).filter((argument) => argument !== '--');
const selected = requested.length === 0 ? [...benchmarks.keys()] : requested;

for (const name of selected) {
  const location = benchmarks.get(name);
  if (location === undefined) {
    throw new Error(`Unknown benchmark: ${name}`);
  }

  const benchmark = await import(location.href);
  await benchmark.run();
}
