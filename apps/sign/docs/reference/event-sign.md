# Event sign

LVBT volunteers can use this tool to show people where their group is at an event. Open the sign,
enter a display name if needed, and press **Show sign**. Leave the name empty to show Las Vegans for
Better Transit.

## Display behavior

The sign uses LVBT's orange, charcoal, logo, and Public Sans font. The name fills the available
space in portrait or landscape. Orange is the default; Dark is available for indoor events. The Exit
display icon appears on pointer movement, tapping, or keyboard focus, then hides after 2.5 seconds
of inactivity. Escape also exits.

Setup shows a compact live preview beside the controls on wide screens. Narrow screens put the
preview above the name and appearance controls. The display uses Public Sans at weight 800 with the
brand display spacing of -0.03em. The supplied light logo sits on a cream field; the supplied dark
logo sits on charcoal. The app never recolors the artwork. Black headline text on orange measures
4.72:1 contrast. White is optional for the large headline, where the 3:1 large-text requirement
applies. Smaller text retains its contrasting default color.

The title slides into place once when display mode opens. It stays still afterward. Reduced-motion
settings disable the entrance and control animations. Colors switch without interpolation so
intermediate frames do not reduce text contrast.

The app requests fullscreen and a screen wake lock when a volunteer presses Show sign. Browsers can
deny either request. The sign still fills the browser viewport. Volunteers should turn up brightness
outdoors and check their device's auto-lock setting if the browser cannot keep the screen awake.
Software cannot set brightness.

**Copy sign link** includes the name, background, and text color in the URL fragment. Another
volunteer can open that link and press Show sign. The app sends no custom names to a server, loads
no calendar, and needs no account. It retains no event name between visits unless the volunteer
opens a saved link.

## Ownership and release state

This is an unlisted Labs project under `apps/sign`. The intended public address is
`https://sign.lasvegasfortransit.org`. The app has no links from the main website or Labs catalog.
Robots metadata, response headers, and robots.txt block indexing. People who know the address can
open it; this is not an access control boundary.

The project is registered for publication through a reviewed staging release. Its Worker
configuration declares the dedicated domain, but configuration alone does not provision or publish
it. The Labs release profile registers a separate staging Worker and the production domain.
Production promotion requires the existing release checks. No deployment or DNS change has been
made.

We chose a static app with local assets instead of a page in the main website so volunteers can open
a focused tool without the site's navigation or application services. The build copies the shared
brand originals from `packages/brand`. Calendar event selection is deferred to v1.1. A calendar
picker should fill the same name field and preserve the volunteer's explicit edits.

## Development

From the Labs root, run `pnpm lab dev sign` to build and serve the app on port 4330. Rebuild after
editing the source. Run `pnpm lab check sign` to check lint, types, the static build, and browser
behavior. The tests cover tablet orientations, phones, sharing, missing browser APIs, keyboard exit,
and JavaScript disabled.

The shared brand package supplies the tokens, font, and logos.

Code uses MIT. Product copy uses CC-BY-4.0. The app loads no external data. LVBT retains rights to
its brand assets. Public Sans retains its upstream license.

Setup scrolls when the controls exceed the viewport. Display mode disables scrolling and panning.
Exiting restores the setup scroll position and keyboard focus.
