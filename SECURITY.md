# Security

## Reporting a vulnerability

Send the affected lab, public path, impact, and reproduction steps to
[security@lasvegasfortransit.org](mailto:security@lasvegasfortransit.org). Exploitable findings stay
out of public issues.

[GitHub private vulnerability reporting](https://github.com/LasVegasForTransit/labs/security/advisories/new)
provides an alternative private channel.

Acknowledgment and remediation schedules reflect the capacity of a small volunteer team. Reporters
receive a direct statement of status rather than an unsupported deadline.

## Supported surface

Security support covers the version served from `labs.lasvegasfortransit.org`, the current `main`
branch, and static retirement archives. Old commits, forks, and superseded previews receive no
updates.

## Scope

Application security belongs to the application that owns the behavior. The root policy covers
shared routing, deployment credentials, catalog integrity, and repository automation.

Each deployed lab records additional public endpoints, data bindings, secrets, and recovery
procedures in its project documentation.
