# Brand and shared UI

Shared brand gives every LVBT project a recognizable foundation. Individual labs retain control over
composition, navigation, density, visualization, and product-specific interaction.

## Brand foundation

### Typography

Public Sans Variable is self-hosted and licensed under the SIL Open Font License 1.1. The fallback
stack is `ui-sans-serif, system-ui, sans-serif`.

Display and headline weights range from 700 to 900. Body text uses weight 400; labels use
weight 600. Applications preserve readable browser zoom and never scale type directly from viewport
width.

### Color tokens

| Token                | Light     | Dark      | Role                          |
| -------------------- | --------- | --------- | ----------------------------- |
| `surface`            | `#f7f4ec` | `#191a1d` | Page background               |
| `on-surface`         | `#0f1115` | `#f7f4ec` | Primary text                  |
| `on-surface-variant` | `#4a4e57` | `#b0a99c` | Secondary text                |
| `surface-container`  | `#efe9db` | `#232428` | Raised controls and panels    |
| `slab`               | `#0f1115` | `#2d2f34` | High-contrast section surface |
| `on-slab`            | `#f7f4ec` | `#f7f4ec` | Text on slab                  |
| `primary`            | `#e5471a` | `#e5471a` | Brand action and emphasis     |
| `primary-container`  | `#ffe9d6` | `#47210f` | Low-emphasis brand surface    |
| `primary-ink`        | `#bf3a10` | `#ff8a5c` | Links and readable brand text |
| `primary-warm`       | `#ec7049` | `#ec7049` | Supporting accent             |
| `outline`            | `#0f1115` | `#72757d` | Borders and control outlines  |

Components consume semantic roles rather than raw hexadecimal values.

## Shared UI boundary

`@lvbt/ui` contains accessible buttons, links, fields, toggles, menus, tabs, dialogs, notices,
metadata blocks, and lifecycle banners. Astro and React exports share tokens and behavior without
forcing a common renderer.

The package does not contain page shells, dashboards, project navigation, domain forms, maps,
charts, or application state. Repetition enters the shared package only after two projects need the
same foundational behavior.

## Required behavior

Shared controls provide visible focus, keyboard operation, reduced-motion support, programmatic
names, disabled and error states, and touch targets of at least 44 by 44 CSS pixels where the
surrounding layout permits.

Lifecycle banners display the manifest reason, date, and successor. They never hide or replace
project content.

### Lifecycle imports

React apps import `LabLifecycleNotice` from `@lvbt/ui` and include
`@import '@lvbt/ui/lifecycle.css';` in their application stylesheet. Astro sites import the default
component from `@lvbt/ui/astro/lifecycle-notice`; that component includes its stylesheet. Both
receive the project manifest as the `manifest` prop. Generated projects include these imports.

The notice renders only for deprecated and retired projects. Deprecated projects include the sunset
date; retired archives omit future-tense retirement copy. Missing required lifecycle metadata fails
rendering rather than silently hiding the notice.

The shared theme uses `@theme static` to retain semantic CSS variables when component styles compile
separately. This changes token availability, not brand values.

Brand metadata includes the LVBT organization name, canonical hostname, favicons, social card
defaults, attribution, and analytics hook. Preview and local builds omit the analytics hook.
