# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for human
contributors.

## What this is

A Gladys Assistant **external integration** for **Sibelga**, the gas and
electricity grid operator of the Brussels-Capital Region: a Node.js service
(Node 22+, ESM, no build step) that runs in its own sandboxed Docker container
and talks to Gladys through
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js),
its only runtime dependency. It started from the official
[JavaScript template](https://github.com/GladysAssistant/integration-template-js).

It exposes the consumption of the user's meters, the ongoing outages of the
grid, scene triggers and actions, and two dashboard widgets.

## Commands

```bash
npm install
npm test                                  # node --test, the built-in runner
node --test test/service.test.js          # one file
node --test --test-name-pattern "outage"  # tests whose name matches
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npm run format                            # Prettier, fix in place
npx github:GladysAssistant/integration-store .   # store admission checks
```

The CI (`.github/workflows/ci.yml`) runs `format:check`, `lint` and `test` on
Node 22 and 24, and builds the Docker image: run the three commands before
pushing.

## Architecture

```
index.js                          entry point: SDK instance, registerHandlers, connect
src/app.js                        SDK wiring only: handlers registered before connect()
src/service.js                    the logic: timers, reads, in-memory data, publication to Gladys
src/sibelga/constants.js          Sibelga endpoints, public client identifiers, municipalities
src/sibelga/auth.js               sign-in to the consumption portal (Azure AD B2C form), tokens
src/sibelga/api.js                portal API client + normalization of every answer
src/sibelga/network.js            reader of the public outage page
src/sibelga/geo.js                municipality of a home, from its coordinates (offline)
src/sibelga/boundaries.js         GENERATED outlines of the 19 municipalities (UrbIS open data)
scripts/generate-boundaries.mjs   dev tool regenerating boundaries.js, run by hand
src/sibelga/http.js, dates.js     fetch wrapper + SibelgaError, Brussels-time helpers
src/devices/meter.js              device of a meter (one per EAN): features, states, intervals
src/devices/network.js            device of the grid: outage counters
src/scenes.js                     scene trigger keys + scene action handlers
src/actions.js                    Configuration screen buttons (manifest `actions`)
src/widgets.js                    dashboard widget contents (manifest `widgets`)
src/i18n.js                       runtime texts in en / fr / de / es, t(key, params)
src/config.js                     DEFAULT_CONFIG (mirrors the manifest defaults) + normalization
src/store.js                      /data/state.json: what was already announced to Gladys
gladys-assistant-integration.json manifest: name, config_schema, actions, scenes, widgets...
docs/{en,fr,de,es}.md             user documentation, re-hosted by Gladys (mandatory)
test/helpers.js                   fake Sibelga (a `fetch`) + app wired on the SDK's fake Gladys
.github/scripts/release.mjs       release helpers (manifest bump, changelog), tested in test/
```

Data flow: `service.refreshConsumption()` / `refreshNetwork()` read Sibelga,
replace the data in memory, then publish — devices, plain states
(`publishChangedStates`), dated daily consumptions
(`publishEnergyConsumption`), transports, scene events, widget nudges. Scene
actions and widgets answer from memory; they never call Sibelga themselves,
except the explicit refresh actions.

## Rules

- **Sibelga has no public API.** The consumption comes from the private API of
  the conso.sibelga.be portal, the outages from a public HTML page. Neither is
  documented or guaranteed:
  - read every answer defensively and normalize it in `src/sibelga/`; nothing
    outside that folder may depend on a raw Sibelga shape;
  - a failure never throws out of the service: it is recorded, reported
    through the connection status / transports / widgets, and retried at the
    next read;
  - keep the request pace low (hours for the portal, minutes for the outage
    page) and never add retries in a loop;
  - never work around the anti-bot protection of sibelga.be (no browser
    automation, no header spoofing, no proxy, no cache or archive of the
    page): a refused request is the `blocked` state, shown as "Unknown".
- **Credentials.** The user's Sibelga password arrives through the config. It
  is only sent to the Sibelga sign-in page. Never log it, never put it — nor
  the e-mail address, a token or an authorization code — in an error message,
  a state, a scene event or `/data`.
- **Home location.** The manifest declares `location: true`:
  `gladys.getHouses()` gives the coordinates of the user's houses, read on
  every connection. They are sensitive: turn them into municipality keys at
  once with `src/sibelga/geo.js` and keep only those keys. Never send a
  coordinate to Sibelga or to any service (no geocoding API), never log it,
  never put it in a state, a scene event, a widget or `/data`. The watched
  municipalities are the union of the houses' ones (unless
  `use_home_location` is off) and the configured ones; none means the whole
  region. `src/sibelga/boundaries.js` is generated: never edit it by hand.
- **External ids are forever.** Build them with
  `gladys.externalIds(type, platformId)`: `meter` + the EAN code, `network` +
  `brussels`. Gladys keys devices, their history, scenes and dashboards on
  them: changing one creates a new device and orphans the old one. The same
  goes for every key users store: manifest `config_schema`, `actions`, widget
  and scene keys, scene event fields, feature keys (`FEATURE`,
  `NETWORK_FEATURE`), municipality keys.
- **No `index` feature on a meter.** The readings arrive a day late: the daily
  consumption is published dated, with `publishEnergyConsumption`. An `index`
  feature on the same device would make Gladys derive a consumption from it
  and refuse the dated one — the meter indexes are plain `energy` features.
- **Scene events are transitions.** One event per new outage, resolved outage
  or new day of readings; the first read after an install only records the
  current situation (`src/store.js`). Event data and action outputs only
  carry keys declared in the manifest.
- **The container rootfs is read-only.** Write only under `/data`, the one
  writable volume (`SIBELGA_DATA_DIR` overrides it for local runs).
- **Versions belong to the Release workflow** (Actions → Release). Never edit
  `version` in `package.json` or in the manifest, nor the `docker_image` tag,
  by hand — except on the README's hand-pushed tag path, which bumps all three
  together before tagging. `test/manifest.test.js` checks they agree.
- **Changelog.** Every user-visible change adds a line under `## [Unreleased]`
  in `CHANGELOG.md` (`### Added`, `Changed`, `Fixed`, `Removed`, `Security`).
  Never write a version heading: the Release workflow moves the section, and it
  becomes the notes of the GitHub Release.
- **Manifest.** Texts are multi-language objects, never a plain string:
  `label`, `description` and `placeholder` alike. The catalog `description`
  holds 10 to 100 characters per language. `transports` is `["cloud"]`: there
  is no local channel to Sibelga. `widgets`, `scene_triggers` and
  `scene_actions` require `gladys_version` `>=5.1.0`. `test/manifest.test.js`
  ties the manifest to the code (defaults, bounds, action, scene and widget
  handlers): change both sides together.
- **Four languages, always.** English, French, German and Spanish for every
  user-facing text: manifest texts, `src/i18n.js` messages (use `t()`, never
  an inline string) and `docs/{en,fr,de,es}.md`, kept in sync chapter by
  chapter. `test/i18n.test.js` and `test/manifest.test.js` fail on a missing
  language. Device and feature names are plain English strings: Gladys stores
  one name, which the user can rename.
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why,
  in English. Tests never touch the network: they use the fake Sibelga of
  `test/helpers.js` and the fake Gladys of the SDK.
