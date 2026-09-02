# Respond to an incident

> **Planned.** `pnpm doctor` is defined by the platform contract but not implemented yet; the steps
> below describe the intended behavior. Today `pnpm lab` offers `dev`, `preview`, and `status`.

Start by finding the smallest broken ownership boundary. Labs isolates project runtimes, so a single
failed route rarely requires a platform-wide response.

## Establish scope

Record the failing URL, time, response status, browser symptoms, and source of the report. Then run:

```sh
pnpm doctor
pnpm lab status <slug>
```

Compare the failing path with the route owner reported by diagnostics.

### One project

Check its latest production workflow, Worker logs, bindings, and direct asset requests. A failure
limited to one slug stays with that project's maintainer.

### Home or routing

Check the custom domain, DNS, TLS, generated route inventory, home Worker, and a known healthy
project route. Several unrelated paths failing together points to shared routing or account state.

### External dependency

Confirm that the Labs Worker and static shell respond before attributing a third-party API failure
to deployment. Preserve a useful read-only state when the project supports it.

## Stabilize service

Rollback the smallest failed Worker with the procedure in
[Deploy and roll back](deploy-and-roll-back.md). Disable a write path or binding only through a
reviewed configuration change; dashboard edits create hidden drift and complicate recovery.

For a security incident, preserve logs, rotate the exposed credential, and use the private contact
in [Security](../../../SECURITY.md). Public incident notes exclude exploit details until remediation
is complete.

## Close the incident

Record the affected route, source commit, Worker versions, root cause, stabilization, user impact,
and durable corrective action. Add a regression test at the layer that first had enough information
to detect the failure.

Run `pnpm doctor` again after corrective deployment. Closure requires clean route, TLS, Worker,
header, analytics, and browser checks.
