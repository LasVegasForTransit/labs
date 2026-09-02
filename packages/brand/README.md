# LVBT brand

`@lvbt/brand` publishes the shared Public Sans font, LVBT marks, and semantic color tokens used by
every lab. Applications own their composition and import the foundation through
`@lvbt/brand/tokens.css`.

The brand package owns design tokens, Public Sans, shared assets, metadata defaults, and
attribution. It establishes a recognizable LVBT identity without prescribing application layout or
product behavior.

Astro and React projects consume the same package and compile its assets into their independent
builds.

The repository [brand reference](../../docs/development/reference/brand-and-ui.md) defines the token
values and accessibility contract.
