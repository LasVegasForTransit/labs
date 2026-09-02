# LVBT Labs

LVBT Labs is the experimental publishing and software workspace for
[Las Vegans for Better Transit](https://lasvegasfortransit.org). Tools, visualizations, and web
publications share a stable home at `labs.lasvegasfortransit.org` while retaining independent
ownership and deployment.

`pnpm bootstrap` installs dependencies and checks the machine; `pnpm check` is the same check CI
runs; `pnpm lab dev <slug>` runs one lab. The repository follows the
[LVBT repository standard](https://github.com/LasVegasForTransit/repository-tooling).

## Documentation

- [Documentation index](docs/README.md)
- [Repository structure](docs/development/reference/project-structure.md)
- [Lab project contract](docs/development/reference/project-contract.md)
- [Architecture](docs/development/explanation/architecture.md)
- [Contributing](CONTRIBUTING.md)

## Applications

[`apps/home`](apps/home/README.md) owns the Labs catalog and archive.
[`apps/transit-funding`](apps/transit-funding/README.md) owns the first experiment prepared for
import.

Each application keeps its source and product documentation together. Shared packages provide brand
and foundational interface elements; application behavior stays with the project that owns it.

## Common commands

| Command                   | Purpose                                                 |
| ------------------------- | ------------------------------------------------------- |
| `pnpm bootstrap`          | Install dependencies, wire git hooks, and run preflight |
| `pnpm check`              | Format, docs, shape rules, lint, types, and unit tests  |
| `pnpm lab dev <slug>`     | Run one lab locally                                     |
| `pnpm lab preview <slug>` | Build and serve one lab's production artifact           |
| `pnpm preview`            | Preview the catalog and every lab on one local origin   |
| `pnpm lab status <slug>`  | Print one lab's manifest                                |
| `pnpm test:e2e`           | Browser tests for every lab and the shared preview      |
| `pnpm build:archive`      | Build every lab's read-only archive                     |
| `pnpm run deploy`         | Build, then `wrangler deploy` every lab                 |

## License

Repository code uses the [MIT License](LICENSE). Every published lab declares separate licenses for
code, content, data, and assets.
