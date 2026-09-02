# Add page metadata

Use the project manifest for the project root and repeated defaults. Add page metadata only when a
route has a distinct subject that deserves its own search result or link preview.

## Describe the page

Add a `PageMetadataV1` record beside the route. Set a short page title without the project name, a
description of no more than 160 characters, and the route's project-relative pathname.

Choose `article` for dated editorial material, `software` for an interactive tool, and `website` for
other pages. Include publication and update dates only when those dates appear in the page content.

## Prepare the preview image

Use the manifest preview image when it accurately represents the route. Otherwise, add a 1200 by 630
pixel sRGB raster image within the project and provide useful alt text. Keep the file under 1 MB.

Do not add a separate image to make routine navigation or policy pages look unique. A shared project
preview is preferable to decorative duplication.

## Render the metadata

Astro pages pass the record to the shared metadata layout. Vite projects include the route in the
static HTML generation entry list and pass the same record to the shared document-head adapter.

A Worker-rendered route uses that adapter while constructing the HTML response. Client-side title
changes are appropriate for transient interface state, but they do not replace the server or
build-time metadata.

## Check the result

Run:

```sh
pnpm check
```

Open the production build through the local Worker preview and view the page source. Confirm that
the title, description, canonical URL, Open Graph fields, Twitter card fields, robots directive, and
JSON-LD appear before JavaScript runs.

The check also confirms that preview deployments remain excluded from search and analytics.
