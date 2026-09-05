import type { LabManifestV1 } from './manifest.js';

export function migrationDocs(manifest: LabManifestV1, repository: string) {
  const { slug, title, summary } = manifest;
  return {
    'README.md': `# ${title}

${summary}

The application lives in \`apps/${slug}\`. Its [project documentation](apps/${slug}/docs/README.md)
travels with the source. Shared brand and UI packages live under \`packages/\`; the pinned
LVBT web standard lives under \`.lvbt/web-platform/\`.

## Development

Start with the [setup tutorial](docs/development/tutorials/start-here.md).
Run \`pnpm check\` before submitting changes, \`pnpm build\` for production output,
and \`pnpm test:e2e\` to exercise the application in a browser.
\`pnpm test:archive\` checks the read-only archive with external services blocked.

## Deployment

The public [Labs URL](https://labs.lasvegasfortransit.org/${slug}/) and Worker name remain unchanged.
The deployment workflow is disabled until the ownership handoff enables
\`LVBT_DEPLOYMENT_OWNER\` in this repository. Do not enable it while Labs still deploys this Worker.
The source identity is recorded in [migration provenance](MIGRATED_FROM.md).
`,
    'docs/development/tutorials/start-here.md': `# Start here

Clone [${repository}](https://github.com/${repository}) and enter its directory.
Use the Node.js and pnpm versions pinned in the root \`package.json\`.

## Set up the workspace

Run these commands from the repository root:

\`\`\`sh
pnpm bootstrap
pnpm check
pnpm dev
\`\`\`

Bootstrap installs dependencies, configures local Git hooks, and runs preflight.
Follow any corrective command printed by preflight, then run \`pnpm preflight\` again.
The development server prints its local URL.

## Make and verify a change

Open \`apps/${slug}\` and make a change to the application. Check it in the browser,
then run the same validation used by continuous integration:

\`\`\`sh
pnpm check
pnpm build
pnpm test:e2e
pnpm test:archive
\`\`\`

The [project documentation](../../../apps/${slug}/docs/README.md) covers application-specific
setup and behavior. The root [agent instructions](../../../AGENTS.md) define the contribution
workflow for this repository.

Deployment ownership is separate from source export. Keep the deployment workflow disabled
until the handoff from Labs is verified; see [migration provenance](../../../MIGRATED_FROM.md).
`,
  };
}
