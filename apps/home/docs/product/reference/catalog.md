# Catalog behavior

Home turns validated project manifests and historical catalog records into the public Labs index.
Catalog behavior never depends on a project's runtime.

## Routes and views

| Route                   | Content                                           |
| ----------------------- | ------------------------------------------------- |
| `/`                     | Listed active, deprecated, and graduated projects |
| `/about`                | Purpose, stewardship, contribution, and licensing |
| `/archive`              | Retired projects and their preserved public paths |
| Any unmatched home path | Branded not-found page with catalog navigation    |

Project paths take precedence over home through Cloudflare route ownership. Home never implements a
project redirect or proxy.

## Listing rules

### Status and visibility

| Status       | Listed                             | Unlisted                         |
| ------------ | ---------------------------------- | -------------------------------- |
| `draft`      | Hidden                             | Hidden                           |
| `active`     | Main catalog                       | Direct URL only                  |
| `deprecated` | Main catalog with notice           | Direct URL with notice           |
| `retired`    | Archive                            | Direct URL only                  |
| `graduated`  | Main catalog with canonical source | Direct URL with canonical source |

Entries sort by publication date descending within each status group, then by title for equal dates.
Lifecycle status forms a visible text label and never relies on color alone.

### Catalog entry

Every entry contains the title, summary, kind, preview image, lifecycle state, public path, and
maintainers. Deprecated entries add the reason, sunset date, and successor. Graduated entries add
the canonical source repository.

Missing images, licenses, maintainers, or required lifecycle dates fail the home build instead of
producing partial cards.

## Metadata and analytics

Home publishes canonical metadata, collection structured data, `robots.txt`, and the hostname
sitemap index. Each project Worker owns its page metadata, social images, structured data, and
project sitemap. The repository
[metadata and discovery contract](../../../../../docs/development/reference/metadata-and-discovery.md)
defines lifecycle indexing and preview exclusions.

Cloudflare Web Analytics runs only in production. Catalog entries contain no tracking query
parameters, and project ranking never uses traffic data.
