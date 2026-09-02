# Metadata and discovery

Every public page ships complete metadata in its initial HTML response. Search engines, link
unfurlers, browsers, and assistive technology receive the same identity without executing client
JavaScript.

The manifest provides project defaults. Individual pages add only the details that differ from those
defaults.

## Metadata sources

### Project defaults

`LabManifestV1` supplies the project name, summary, kind, lifecycle state, and default preview
image. Shared build adapters turn those values into metadata for the project root.

The default title follows the public collection:

```text
<Project title> | LVBT Labs
```

Labs home uses `LVBT Labs`. A nested page places its specific subject first:

```text
<Page title> | <Project title> | LVBT Labs
```

### Page overrides

A crawlable route with distinct content owns a `PageMetadataV1` record.

| Field            | Requirement                                                              |
| ---------------- | ------------------------------------------------------------------------ |
| `title`          | Concise page name without the project or collection suffix               |
| `description`    | Plain-text summary specific to the page, at most 160 characters          |
| `pathname`       | Route relative to the project root                                       |
| `image`          | Optional project-relative social image; falls back to the manifest image |
| `imageAlt`       | Required when `image` is present                                         |
| `type`           | `website`, `article`, or `software`                                      |
| `published`      | ISO 8601 date for dated publications                                     |
| `updated`        | ISO 8601 date when a material revision is public                         |
| `robots`         | Optional restriction that is stricter than the lifecycle default         |
| `structuredData` | Optional validated JSON-LD additions                                     |

Authors do not enter canonical URLs, title suffixes, deployment hostnames, or social-card
dimensions. The metadata adapter derives them from the manifest and route so preview hosts never
leak into production markup.

## Generated document head

Each page includes a title, description, canonical URL, robots directive, Open Graph fields, Twitter
card fields, theme color, and shared icons. Canonical URLs always use
`https://labs.lasvegasfortransit.org`, the permanent project slug, and the normalized page path.

Social images are raster files in sRGB at 1200 by 630 pixels and no more than 1 MB. Their content
remains legible when cropped or reduced. Alt text describes the information in the image rather than
repeating the page title.

Astro renders the shared metadata component in each page layout. Vite projects emit crawlable route
HTML during the production build; changing metadata after hydration does not satisfy the contract. A
project with unbounded or request-specific routes renders the head in its Worker response.

## Indexing policy

Lifecycle state and visibility establish the least restrictive robots policy a page can use. A page
override can remove itself from indexing but cannot make a restricted project indexable.

| Project state                 | Directive           |
| ----------------------------- | ------------------- |
| `draft`                       | `noindex, nofollow` |
| `active` and `listed`         | `index, follow`     |
| `active` and `unlisted`       | `noindex, follow`   |
| `deprecated`                  | `index, follow`     |
| `retired` archive             | `index, follow`     |
| `retired` tombstone exception | `noindex, follow`   |
| `graduated`                   | `index, follow`     |

A graduated page keeps its Labs URL as the canonical address even though a separate repository owns
the Worker. Deprecation notices and successor links do not replace the canonical identity.

Local builds, pull-request previews, staging Workers, and `workers.dev` URLs send
`X-Robots-Tag: noindex, nofollow`, publish a disallowing `robots.txt`, omit analytics, and never
appear in a sitemap.

## Sitemaps and structured data

Home serves the hostname `robots.txt` and a sitemap index. Each project serves its own sitemap at
`/<slug>/sitemap.xml`; the index links those files for listed projects whose lifecycle permits
indexing. This split keeps discovery under the project's control and survives graduation without
rebuilding another project's route inventory.

Home describes LVBT and the collection with `Organization`, `WebSite`, and `CollectionPage` JSON-LD.
A tool uses `SoftwareApplication`; a visualization uses `CreativeWork`; a dated publication uses
`Article`. Projects add narrower schema types only when their visible content supports every
asserted field.

## Validation

Production builds fail when metadata is missing, duplicated, malformed, or inconsistent with
routing. Checks inspect the generated HTML rather than only the source configuration.

Validation covers:

- unique titles and descriptions across crawlable routes;
- canonical URLs on the production hostname and beneath the owning slug;
- absolute social image URLs, image dimensions, file size, and alt text;
- valid JSON-LD whose URLs match the canonical route;
- agreement among manifests, robots directives, and sitemap entries;
- metadata in the first HTML response for both framework profiles;
- exclusion of previews, drafts, and unlisted projects from discovery output.
