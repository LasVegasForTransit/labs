import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';

const app = new URL('../', import.meta.url);
const output = new URL('dist/', app);
await mkdir(new URL('assets/', output), { recursive: true });
for (const file of ['index.html', 'sign.css']) {
  await copyFile(new URL(`src/${file}`, app), new URL(file, output));
}
const script = await readFile(new URL('src/sign.ts', app), 'utf8');
await writeFile(new URL('sign.js', output), stripTypeScriptTypes(script));
// Labs owns the shared brand originals; the sign needs no other application build.
for (const file of ['lvbt-logo.svg', 'lvbt-logo-dark.svg', 'lvbt-wordmark.svg']) {
  await copyFile(
    new URL(`../../packages/brand/assets/${file}`, app),
    new URL(`assets/${file}`, output),
  );
}
await copyFile(
  new URL('../../packages/brand/assets/public-sans-latin.woff2', app),
  new URL('assets/public-sans-latin.woff2', output),
);

await copyFile(new URL('../../packages/brand/src/tokens.css', app), new URL('brand.css', output));

for (const file of ['_headers', 'robots.txt']) {
  await copyFile(new URL(`public/${file}`, app), new URL(file, output));
}
