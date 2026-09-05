import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
import home from '../../../apps/home/lab.config.js';
import { archiveChecksums } from '../src/archive-files.js';
import { storeRetirementArchive } from '../src/archive-store.js';
import { verifyRetirementDeployment } from '../src/retirement-deployment.js';
import { LabManifestV1Schema } from '../src/manifest.js';

const version = '2ae50b24-3d42-48d2-a784-627b60841961';
const previousVersion = '1c4deaba-ee53-4c3f-ba65-176ae596cad5';
const commit = 'b'.repeat(40);
const files = new Map([
  ['index.html', Buffer.from('<h1>Archived map</h1>')],
  ['map.js', Buffer.from('export const map = 1;')],
]);
const artifactHash = createHash('sha256').update(archiveChecksums(files)).digest('hex');
const marker = { formatVersion: 1, slug: 'map', commit, artifactHash };

test.each(['verified', 'binding', 'marker', 'asset', 'superseded', 'missing-rollback'] as const)(
  'checks the live archive without mutations: %s',
  async (outcome) => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'lvbt-retirement-deployment-'));
    try {
      const source = path.join(root, 'build');
      await mkdir(source);
      for (const [name, bytes] of files) await writeFile(path.join(source, name), bytes);
      await storeRetirementArchive(
        root,
        {
          manifest: LabManifestV1Schema.parse({
            ...home,
            slug: 'map',
            status: 'retired',
            dates: { ...home.dates, retired: '2026-09-05' },
            lifecycle: { reason: 'Ended' },
          }),
          sourceCommit: 'a'.repeat(40),
          sourceRepository: 'https://github.com/LasVegasForTransit/labs',
        },
        source,
        () => Promise.resolve(),
      );
      let fetched = false;
      const paths: string[] = [];
      const result = verifyRetirementDeployment(
        root,
        {
          slug: 'map',
          commit,
          version,
          previousVersion,
        },
        {
          run(args) {
            if (args.join(' ') === 'deployments list --json')
              return Promise.resolve(
                JSON.stringify([
                  {
                    created_on: '2026-09-05T00:00:00Z',
                    versions: [
                      {
                        version_id: fetched && outcome === 'superseded' ? previousVersion : version,
                        percentage: 100,
                      },
                    ],
                  },
                ]),
              );
            expect(args.slice(0, 2)).toEqual(['versions', 'view']);
            if (args[2] === previousVersion) {
              if (outcome === 'missing-rollback') throw new Error('Rollback version unavailable');
              return Promise.resolve(JSON.stringify({ id: previousVersion }));
            }
            expect(args).toEqual(['versions', 'view', version, '--json']);
            return Promise.resolve(
              JSON.stringify({
                id: version,
                annotations: { 'workers/message': `Archive ${commit} ${artifactHash}` },
                resources: {
                  bindings:
                    outcome === 'binding'
                      ? [{ name: 'DB', type: 'd1' }]
                      : [{ name: 'ASSETS', type: 'assets' }],
                },
              }),
            );
          },
          fetch(url, options) {
            expect(options?.redirect).toBe('manual');
            expect(options?.method ?? 'GET').toBe('GET');
            const address = new URL(
              typeof url === 'string' ? url : url instanceof URL ? url.href : url.url,
            );
            expect(address.origin).toBe('https://labs.lasvegasfortransit.org');
            paths.push(address.pathname);
            fetched = true;
            if (address.pathname.endsWith('/lvbt-release.json'))
              return Promise.resolve(
                Response.json({
                  ...marker,
                  artifactHash: outcome === 'marker' ? 'c'.repeat(64) : artifactHash,
                }),
              );
            const name = address.pathname.slice('/map/'.length) || 'index.html';
            return Promise.resolve(
              new Response(
                outcome === 'asset' && name === 'map.js' ? 'wrong' : files.get(name)?.toString(),
              ),
            );
          },
        },
      );
      if (outcome === 'verified') {
        expect(await result).toMatchObject({ ...marker, version, previousVersion, verified: true });
        expect(paths).toContain('/map/map.js');
        expect(paths).toContain('/map/');
      } else await expect(result).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);
