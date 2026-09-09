import { execFileSync } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
import home from '../../../apps/home/lab.config.js';
import { retireLab } from '../src/retire.js';

const active = { ...home, slug: 'map' };
const source = `// Keep project attribution.\nexport default ${JSON.stringify(active)} as const;\n`;
const args = ['map', '--reason', 'The program ended.', '--json'];

async function fixture(run: (root: string) => Promise<void>, scripts: Record<string, string> = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lvbt-retire-command-'));
  try {
    execFileSync('git', ['init', '--quiet'], { cwd: root });
    const files = {
      '.gitignore': '**/dist-archive/\n',
      'apps/map/lab.config.ts': source,
      'apps/map/package.json': JSON.stringify({
        scripts: {
          'build:archive': 'node -e "0"',
          'test:archive': 'node -e "0"',
          ...scripts,
        },
      }),
      'apps/map/src/index.ts': 'export const map = 1;\n',
    };
    let input =
      'commit refs/heads/main\ncommitter Test <test@example.org> 1 +0000\ndata 7\nfixture\n';
    for (const [name, content] of Object.entries(files)) {
      input += `M 100644 inline ${name}\ndata ${Buffer.byteLength(content)}\n${content}\n`;
    }
    execFileSync('git', ['fast-import', '--quiet'], { cwd: root, input: `${input}\n` });
    execFileSync('git', ['switch', '--quiet', 'main'], { cwd: root });
    execFileSync('git', ['remote', 'add', 'origin', 'https://github.com/LasVegasForTransit/labs'], {
      cwd: root,
    });
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test(
  'retirement plans without writes and prepares an archive without removing source',
  { timeout: 30000 },
  async () => {
    await fixture(async (root) => {
      const planned = await retireLab(root, args, '2026-09-05');
      expect(planned.phase).toBe('planned');
      expect(planned.changed).toBe(false);
      expect(await readFile(path.join(root, 'apps/map/lab.config.ts'), 'utf8')).toBe(source);
      await expect(access(path.join(root, 'retired/map'))).rejects.toThrow();

      const app = path.join(root, 'apps/map');
      await mkdir(path.join(app, 'dist-archive'));
      await writeFile(path.join(app, 'dist-archive/index.html'), '<h1>Map archive</h1>');
      const prepared = await retireLab(root, [...args, '--apply'], '2026-09-05');
      expect(prepared.phase).toBe('prepared');
      expect(prepared.changed).toBe(true);
      expect(await readFile(path.join(app, 'lab.config.ts'), 'utf8')).toContain(
        '// Keep project attribution.',
      );
      expect(await readFile(path.join(root, 'retired/map/site/index.html'), 'utf8')).toContain(
        'Map archive',
      );
      await expect(access(path.join(app, 'src/index.ts'))).resolves.toBeUndefined();
      await expect(access(path.join(root, 'catalog/map.json'))).rejects.toThrow();
      await rm(path.join(app, 'dist-archive'), { recursive: true });
      const retry = await retireLab(root, [...args, '--apply'], '2026-09-06');
      expect(retry.phase).toBe('prepared');
      expect(retry.changed).toBe(false);
    });
  },
);

test('refuses uncommitted project changes before preparation', async () => {
  await fixture(async (root) => {
    await writeFile(path.join(root, 'apps/map/src/index.ts'), 'uncommitted work');
    await expect(retireLab(root, [...args, '--apply'], '2026-09-05')).rejects.toThrow(
      /uncommitted/i,
    );
    expect(await readFile(path.join(root, 'apps/map/lab.config.ts'), 'utf8')).toBe(source);
    await expect(access(path.join(root, 'retired/map'))).rejects.toThrow();
  });
});

test('requires complete non-interactive input and rejects ambiguous modes', async () => {
  await expect(retireLab('/missing', ['map', '--verify', '--apply', '--json'])).rejects.toThrow(
    /read-only/,
  );
  await expect(retireLab('/missing', [...args, '--version', 'wrong'])).rejects.toThrow(
    /require --verify/,
  );
  await expect(retireLab('/missing', ['map', '--json'])).rejects.toThrow(/reason/i);
  await expect(retireLab('/missing', [...args, '--apply', '--dry-run'])).rejects.toThrow(
    /together/,
  );
  await expect(retireLab('/missing', ['../map', '--reason', 'Ended', '--json'])).rejects.toThrow(
    /slug/i,
  );
});

test.each(['failed-suite', 'changed-source'] as const)(
  'retains the original manifest and source after %s',
  { timeout: 30000 },
  async (failure) => {
    await fixture(
      async (root) => {
        const app = path.join(root, 'apps/map');
        await mkdir(path.join(app, 'dist-archive'));
        await writeFile(path.join(app, 'dist-archive/index.html'), '<h1>Map archive</h1>');
        await expect(retireLab(root, [...args, '--apply'], '2026-09-05')).rejects.toThrow();
        expect(await readFile(path.join(app, 'lab.config.ts'), 'utf8')).toBe(source);
        expect(await readFile(path.join(app, 'src/index.ts'), 'utf8')).toBe(
          failure === 'changed-source' ? 'changed' : 'export const map = 1;\n',
        );
        if (failure === 'failed-suite')
          await expect(access(path.join(root, 'retired/map'))).rejects.toThrow();
        await expect(access(path.join(root, 'catalog/map.json'))).rejects.toThrow();
      },
      failure === 'failed-suite'
        ? { 'test:archive': 'node -e "process.exit(1)"' }
        : { 'build:archive': `node -e "require('fs').writeFileSync('src/index.ts', 'changed')"` },
    );
  },
);
