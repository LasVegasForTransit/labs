# Labs home

Labs home publishes the catalog and archive at `labs.lasvegasfortransit.org`. The Astro site reads
validated manifests and routes visitors to independently deployed projects.

## Development

Run home with `pnpm lab dev home`. `pnpm check` validates catalog content, accessibility, route
fallback, screenshots, archive links, and the production Worker build.

Home owns catalog presentation and the hostname fallback. Product behavior and documentation stay
inside the lab that owns them.

## Documentation and license

- [Project documentation](docs/README.md)
- [Product brief](docs/product/explanation/product-brief.md)

Code uses the repository MIT license. The manifest declares the licenses for catalog content,
project data, and visual assets.
