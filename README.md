# Gladys Sibelga

External integration for [Gladys Assistant](https://gladysassistant.com) that
brings **Sibelga** — the gas and electricity grid operator of the
Brussels-Capital Region — into your home automation:

- the **gas and electricity consumption** of your meters, from your Sibelga
  "My consumption" account;
- the **status of the Sibelga grid**: the ongoing outages, in Brussels and in
  your municipalities;
- **scene triggers and actions**, and two **dashboard widgets**.

Built with the JavaScript SDK
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js),
from the official
[integration template](https://github.com/GladysAssistant/integration-template-js).

> **Unofficial.** This project is not affiliated with Sibelga. Sibelga offers
> no public API: the integration reads the web portal and the public outage
> page a browser reads, and can break when Sibelga changes them.

User documentation: [English](docs/en.md) · [Français](docs/fr.md) ·
[Deutsch](docs/de.md) · [Español](docs/es.md).

## What it provides

| Surface         | Content                                                                                                                                  |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Devices         | One per meter (EAN): dated daily consumption, last day, last month, meter indexes, injection. One "Sibelga grid" device: outage counters |
| Transport badge | `cloud` on every device, `unreachable` when Sibelga cannot be read                                                                       |
| Scene triggers  | `outage_started`, `outage_resolved`, `consumption_updated`                                                                               |
| Scene actions   | `refresh`, `get_consumption`, `get_network_status`                                                                                       |
| Widgets         | `consumption` (tiles + daily bar chart), `network_status` (outage list + refresh)                                                        |
| Config actions  | `test_connection`, `test_network_status`, `refresh`                                                                                      |
| Languages       | English, French, German, Spanish (manifest, runtime messages, documentation)                                                             |

Requires **Gladys ≥ 5.1.0** (scene and widget capabilities). The dated daily
consumption uses `publishEnergyConsumption`; on a Gladys that does not know it
yet the other features still work and the integration logs a warning.

## Where the data comes from

| Data        | Source                                                                                                 | Pace                         |
| ----------- | ------------------------------------------------------------------------------------------------------ | ---------------------------- |
| Consumption | API of the [conso.sibelga.be](https://conso.sibelga.be/) portal, with the user's own e-mail / password | every 6 h (1–24 h)           |
| Grid status | Public page of ongoing outages on sibelga.be                                                           | every 15 min (5 min at most) |

Things to know:

- Sibelga publishes the readings of a day **on the next day**, and daily data
  only exists for **smart meters with remote reading allowed**. There is no
  real-time power: that is what the meter's P1 port is for.
- The portal signs users in with Azure AD B2C, with a redirect address that
  belongs to the portal: the integration plays the sign-in form with the
  credentials saved in Gladys (`src/sibelga/auth.js`).
- sibelga.be is protected against robots. When it refuses the request, the
  grid status is "Unknown" — the integration never tries to get around it.
- Planned interruptions and street works are not followed.

### Validation status

The Sibelga clients were written from the portal's public web client and from
the address format of the outage pages. They are covered by tests against a
fake Sibelga (`test/helpers.js`), but **have not yet been run against a real
Sibelga account or the live outage page**. After installing, use the **Test
the Sibelga account** and **Test the grid status** buttons, and please open an
issue with the integration logs (credentials removed) if one of them fails.

## Project structure

```
.
├─ index.js                          # entry point
├─ src/
│  ├─ app.js                         # SDK wiring (handlers, connection lifecycle)
│  ├─ service.js                     # reads on a timer, data in memory, publication to Gladys
│  ├─ sibelga/                       # everything that talks to Sibelga
│  │  ├─ auth.js                     #   sign-in and tokens
│  │  ├─ api.js                      #   consumption portal API
│  │  ├─ network.js                  #   public outage page
│  │  └─ constants.js, http.js, dates.js
│  ├─ devices/                       # meter.js (one device per EAN), network.js (grid)
│  ├─ scenes.js                      # scene triggers and actions
│  ├─ actions.js                     # Configuration screen buttons
│  ├─ widgets.js                     # dashboard widgets
│  ├─ i18n.js                        # runtime texts (en, fr, de, es)
│  ├─ config.js                      # config defaults + normalization
│  └─ store.js                       # /data/state.json (what was already announced)
├─ docs/{en,fr,de,es}.md             # user documentation, re-hosted by Gladys
├─ test/                             # unit tests (`node --test`), no network
├─ gladys-assistant-integration.json # manifest
├─ Dockerfile                        # Node 24 Alpine, read-only rootfs ready
├─ CHANGELOG.md                      # Keep a Changelog, rolled by the Release workflow
├─ CLAUDE.md                         # project rules for coding assistants & contributors
├─ SECURITY.md                       # how to report a vulnerability, what is handled
└─ .github/                          # CI, release, image build, Dependabot
```

## Run it locally

```bash
npm install
GLADYS_HOST_API_URL="http://localhost:1443" \
GLADYS_INTEGRATION_TOKEN="<token>" \
GLADYS_INTEGRATION_SELECTOR="sibelga" \
SIBELGA_DATA_DIR="./data" \
LOG_LEVEL=debug \
npm start
```

The three `GLADYS_*` variables are injected by the Gladys supervisor when the
integration runs inside its container. The e-mail address and the password are
entered in the Configuration screen of Gladys, never in the environment.

Optional variables, for when Sibelga changes something before a release
follows: `SIBELGA_API_BASE_URL`, `SIBELGA_API_KEY`,
`SIBELGA_API_SUBSCRIPTION_KEY`, `SIBELGA_AUTH_CLIENT_ID`,
`SIBELGA_OUTAGES_URL` (see `src/sibelga/constants.js`).

## Quality checks

```bash
npm run format:check   # Prettier
npm run lint           # ESLint
npm test               # node --test
```

The same three run on every push and pull request, on Node 22 and 24, along
with a build of the Docker image (`.github/workflows/ci.yml`). The tests wire
the real handlers on the SDK's fake Gladys and on a fake Sibelga: they check
the devices, states, dated consumptions, scene events and widget contents
Gladys would receive, and that the manifest, the code and the four languages
agree.

Before a release, the store validation can be run locally:

```bash
npx github:GladysAssistant/integration-store .
```

## Release

1. Describe the changes under `## [Unreleased]` in [`CHANGELOG.md`](CHANGELOG.md).
2. **Actions → Release → Run workflow**, pick `patch`, `minor` or `major`. The
   workflow bumps the version (`package.json`, manifest `version` and
   `docker_image`), rolls the changelog, tags, builds the `linux/amd64` +
   `linux/arm64` image to `ghcr.io/gboulvin/gladys-sibelga` and publishes the
   GitHub Release.
3. The repository needs the GitHub topic `gladys-assistant-integration` and to
   be public for the Gladys integration store to index it.

The repository already says `1.0.0` everywhere: the very first version can
also be published by pushing the tag by hand.

```bash
git tag v1.0.0
```

```bash
git push origin v1.0.0
```

## Security

See [`SECURITY.md`](SECURITY.md): how to report a vulnerability, and what the
integration does with your Sibelga credentials.

## License

Apache-2.0
