# TransitFunding architecture

TransitFunding is a client-rendered fiscal publication with a pure TypeScript model. The browser
controls the narrative and interaction; a small Worker serves static assets and health status.

## Model and evidence

### Sourced figures

Every model input uses a provenance envelope containing value, unit, confidence, source title, URL,
and retrieval date. Dollar values also carry a dollar year. Estimated figures include low and high
bounds.

The constructor rejects incomplete provenance. A missing citation therefore fails tests at the
dataset call site instead of appearing later as an empty footnote.

### Projection

The model compounds revenue and cost lines from a base year through the selected horizon. Authorized
revenue remains active; policy levers enter at their legal earliest year and expose their intensity.
Federal match appears as its own revenue line.

Non-discretionary costs receive funding first. Remaining revenue funds discretionary service in
proportion to need, which exposes service loss without pretending fixed obligations disappear.

### Flow and layout

One yearly result becomes a three-column graph: sources, pooled transit budget, and uses. Stable IDs
connect states so bands morph rather than redraw.

Layout order follows policy difficulty and declaration order. Values never reorder bands, and every
scene shares one scale domain. The accessible text description comes from the same graph as the
visual rendering.

## Application and Worker

### React publication

The web app owns story progression, lever controls, scene state, Sankey animation, citations, and
responsive presentation. The first act starts with the Nevada constitutional restriction and lets
the reader compare the locked and unlocked funding paths.

The interface imports calculations and geometry from the project model. React components never
recreate fiscal arithmetic or graph layout.

### Cloudflare Worker

The project Worker serves the built Vite assets under `/transit-funding` and responds to
`/transit-funding/api/health`. It stores no user data and has no application secret or database
binding.

Static asset delivery bypasses Worker code. The read-only retirement build uses the same fiscal
model, sources, and story content without the health endpoint.

## Quality boundaries

Unit tests cover provenance, estimated bounds, dollar years, fiscal allocation, graph balance,
stable ordering, geometry, and accessible descriptions. Browser tests cover story progression,
controls, reduced motion, keyboard input, responsive charts, base-path refreshes, citations, and the
offline archive.

Source freshness is a product risk rather than a runtime concern. Each source records retrieval and
dollar year, and review updates the figure, explanation, and expected model behavior together.
