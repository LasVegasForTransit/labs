import { mkdir, writeFile } from 'node:fs/promises';
await mkdir('dist-archive', { recursive: true });
await writeFile(
  'dist-archive/index.html',
  '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Discord task updates — LVBT</title><h1>Discord task updates</h1><p>This archived tool no longer connects to Discord or Notion.</p></html>',
);
