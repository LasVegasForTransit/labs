# Update and deploy a lab

Project updates follow the same path for prose, visual design, client behavior, and Worker APIs. The
affected graph keeps unrelated labs out of the feedback loop.

## Develop the change

Run `pnpm lab dev <slug>` from the root. The command loads the project at its production base path
and watches project source plus shared workspace dependencies.

Keep product logic and docs in the application. A change to shared brand or UI requires browser
coverage for every dependent project.

## Check and preview

Run the project bar before review:

```sh
pnpm check
pnpm lab preview <slug>
```

Update screenshot baselines only after inspecting the rendered difference.

Run `pnpm preview` when a change touches home, shared packages, route behavior, or more than one
lab. Open the catalog at `http://127.0.0.1:8797`, follow its project links, and refresh each project
at a nested path. This preview uses the same path precedence as the production hostname.

A same-repository pull request receives a remote preview. Existing projects use a Worker version
preview; new projects use a temporary Worker named from the pull request and slug. Forked pull
requests receive `Validate` without remote credentials.

## Deploy and verify

Merge after `Validate` passes. GitHub Actions builds every affected artifact, deploys project
Workers, verifies their routes, and deploys home last when catalog output changes.

Use `pnpm lab status <slug>` to confirm the GitHub run, active Worker version, route ownership, and
catalog state. A live deployment is complete only when the public route passes
`pnpm lab doctor <slug>`.
