import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

export interface TempWorkspace {
  readonly cwd: string;
  resolve(...segments: string[]): string;
  writeJson(relativePath: string, value: unknown): Promise<string>;
  writeText(relativePath: string, value: string): Promise<string>;
}

export async function withTempWorkspace<T>(
  run: (workspace: TempWorkspace) => Promise<T> | T,
): Promise<T> {
  const cwd = await mkdtemp(path.join(tmpdir(), 'kasane-integration-'));
  const workspace: TempWorkspace = {
    cwd,
    resolve: (...segments) => path.join(cwd, ...segments),
    async writeJson(relativePath, value) {
      return writeWorkspaceFile(
        cwd,
        relativePath,
        `${JSON.stringify(value, undefined, 2)}\n`,
      );
    },
    async writeText(relativePath, value) {
      return writeWorkspaceFile(cwd, relativePath, value);
    },
  };

  try {
    return await run(workspace);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

async function writeWorkspaceFile(
  cwd: string,
  relativePath: string,
  value: string,
): Promise<string> {
  const absolutePath = path.join(cwd, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, value, 'utf8');
  return absolutePath;
}
