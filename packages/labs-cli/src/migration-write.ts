import { chmod } from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { writeProject } from './create-write.js';
import type { MigrationFile } from './migration-tree.js';

export async function writeMigration(directory: string, files: Map<string, MigrationFile>) {
  for (const [name, file] of files)
    if (!['100644', '100755'].includes(file.mode))
      throw new Error(`Migration requires a regular committed file: ${name}`);
  const target = path.resolve(directory);
  await writeProject(
    target,
    Object.fromEntries([...files].map(([name, file]) => [name, file.content])),
    async (staged) => {
      const generated = [...files]
        .filter(([, file]) => file.generated)
        .map(([name]) => path.join(staged, name));
      if (generated.length > 0) {
        const root = fileURLToPath(new URL('../../..', import.meta.url));
        execFileSync(
          'pnpm',
          [
            'exec',
            'prettier',
            '--write',
            '--ignore-unknown',
            '--config',
            path.join(root, 'prettier.config.js'),
            ...generated,
          ],
          { cwd: root, stdio: 'pipe', timeout: 30000 },
        );
      }
      for (const [name, file] of files)
        await chmod(path.join(staged, name), file.mode === '100755' ? 0o755 : 0o644);
    },
    path.dirname(target),
  );
}
