# Sibelga

Follow your gas and electricity consumption and the status of the Sibelga
grid (Brussels-Capital Region) in Gladys Assistant.

This integration is not published by Sibelga. Sibelga offers no public API:
the integration reads the same web pages you can open in your browser — the
"My consumption" portal with your own account, and the public page of ongoing
outages. If Sibelga changes them, the integration can stop working until it is
updated.

## What you get

- One device per meter of your Sibelga account (electricity and gas), with
  its daily consumption, the consumption of the last day and of the last
  month, and the meter indexes.
- A **Sibelga grid** device counting the ongoing outages, in Brussels and in
  your municipalities.
- Scene triggers and actions, and two dashboard widgets.

## Before you start

Consumption data requires:

1. a Sibelga consumption account: create it on
   [conso.sibelga.be](https://conso.sibelga.be/) (it is the account of the
   My Sibelga app, not the one used for work requests);
2. your meters added to that account with their EAN code;
3. a **smart meter** with **remote reading** allowed: without it, Sibelga has
   no daily data to show, and the meter only gets the values Sibelga knows.

Sign in once on the portal and check that you see your consumption there: the
integration shows the same data, nothing more.

The grid status needs no account.

## Configuration

1. Open the **Configuration** tab of the integration.
2. Enter the **e-mail address** and the **password** of your Sibelga
   consumption account, then save.
3. Press **Test the Sibelga account**: the integration signs in and lists the
   meters it found.
4. Open the **Discovery** tab and add the devices.

Other settings:

- **History to import** — days of daily consumption sent to Gladys for each
  meter (30 by default). The history is sent when you add the device.
- **Consumption refresh** — how often the portal is read (every 6 hours by
  default). Sibelga publishes the readings of a day on the next day, so a
  shorter interval brings nothing.
- **Follow the grid status** — turn it off if you only want consumption.
- **Follow the municipality of my home** — on by default. The integration
  reads the location of the houses set in Gladys and
  follows the Brussels municipality each one is in. A house outside Brussels,
  or without a location, is ignored.
- **Other municipalities to follow** — municipalities followed in addition to
  the one of your home (your workplace, a relative's home). When no
  municipality is followed at all, the whole region is.
- **Grid status refresh** — every 15 minutes by default, 5 minutes at most.

## Devices

Each meter is named after the name you gave it on the portal and its EAN code.

| Feature                           | Meaning                                                    |
| --------------------------------- | ---------------------------------------------------------- |
| Daily consumption                 | One dated value per day, used by the Gladys energy screens |
| Consumption of the last day       | Last day Sibelga published (usually yesterday)             |
| Consumption of the last month     | As shown on the portal                                     |
| Meter index (peak / off-peak)     | Last indexes sent by a smart electricity meter             |
| Injection of the last day, index… | Only for a meter that also injects (solar panels)          |

All values are in kWh, as on the portal. The data of a day arrives the next
day: there is no real-time power here. For live readings, use the P1 port of
your smart meter with another integration.

The **Sibelga grid** device has two counters: the ongoing outages in Brussels,
and those in your municipalities.

Every device carries the **cloud** badge: the data comes from Sibelga over the
internet. The badge turns to "unreachable" when Sibelga cannot be read.

## Actions

Buttons of the Configuration tab:

- **Test the Sibelga account** — signs in and lists your meters.
- **Test the grid status** — reads the outage page and says what it shows.
- **Refresh the data now** — reads both without waiting.

## Scenes

The integration adds its own cards to the scene editor (Gladys 5.1 or later).

Triggers:

- **Sibelga outage started** — a new outage appeared. Filter on _In my
  municipalities_ or _Elsewhere in Brussels_; left empty, every outage
  matches. Variables: `{{triggerEvent.data.title}}`, `municipalities`, `url`,
  `count` (ongoing outages in your municipalities) and `id`.
- **Sibelga outage resolved** — an outage is no longer listed. Same filter
  and variables.
- **New Sibelga consumption data** — Sibelga published a new day for a meter.
  Filter on the meter or on the energy. Variables: `consumption` and
  `injection` (kWh), `date`, `name`, `ean`.

Actions:

- **Refresh the Sibelga data** — reads Sibelga now. Do not place it in a
  scene started by one of the triggers above: a refresh can fire them.
- **Get a Sibelga consumption** — consumption of a meter over the last day,
  the last 7 days or the last 30 days, for the following actions (for
  example a message with yesterday's consumption).
- **Get the Sibelga grid status** — number of ongoing outages and whether
  your municipalities are affected, for a condition or a message.

When Gladys starts, the outages already in progress and the readings already
published do not fire the triggers: only what changes afterwards does.

## Dashboard

- **Sibelga consumption** — pick a meter and a number of days: last day, last
  month, daily average and a bar chart of the daily consumption.
- **Sibelga grid status** — ongoing outages (your municipalities first) with
  a link to their page on sibelga.be, and a refresh button.

## Privacy and limits

- Your password is stored by Gladys as a secret field and is only sent to
  Sibelga's sign-in page. It is never written to the logs.
- The integration only reads: it never changes anything on your Sibelga
  account.
- Outages are read from a public web page. Sibelga protects its site against
  robots: when it refuses the integration, the status shows **Unknown**, and
  the integration does not try to get around the protection.
- The integration asks Gladys for the location of your houses, only to find
  their municipality. It does so by itself, from the municipal boundaries it
  ships with: the coordinates are never sent to Sibelga or to any other
  service, never logged and never stored.
- Planned interruptions and street works are not followed.

## Troubleshooting

- **"Sibelga refused the e-mail address or the password"** — sign in on
  [conso.sibelga.be](https://conso.sibelga.be/) with the same credentials. An
  account for work requests is a different one.
- **"Sibelga did not complete the sign-in"** (in the logs) — the portal is
  waiting for you: new terms to accept or an address to confirm. Sign in once
  in a browser, then press **Test the Sibelga account**.
- **No device, or no daily consumption** — check on the portal that the meter
  is listed, is a smart meter and has remote reading allowed. Data starts the
  day after it is allowed.
- **Grid status "Unknown"** — sibelga.be refused the request or changed its
  page. Outages are still visible on the Sibelga website.
- For more detail, read the integration logs from the Gladys interface, with
  `LOG_LEVEL=debug` for everything.
