import { readFile, readdir } from 'node:fs/promises';
import { extname, relative, resolve } from 'node:path';

const FORBIDDEN_HOSTS = ['events.lasvegasfortransit.org', 'static.cloudflareinsights.com'];
const EXECUTABLE_WEB_EXTENSIONS = new Set(['.css', '.html', '.js', '.mjs']);

async function filesUnder(root: string, directory = root): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = resolve(directory, entry.name);
      return entry.isDirectory() ? filesUnder(root, path) : [path];
    }),
  );
  return files.flat();
}

export async function findAnalyticsReferences(root: string) {
  const absoluteRoot = resolve(root);
  const findings: string[] = [];
  for (const file of await filesUnder(absoluteRoot)) {
    if (!EXECUTABLE_WEB_EXTENSIONS.has(extname(file))) continue;
    const content = await readFile(file);
    if (content.includes(0)) continue;
    const text = content.toString('utf8');
    for (const host of FORBIDDEN_HOSTS) {
      if (text.includes(host)) findings.push(`${relative(absoluteRoot, file)}: ${host}`);
    }
  }
  return findings.sort();
}
