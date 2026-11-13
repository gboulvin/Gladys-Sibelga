# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [1.1.0] - 2026-11-13

### Added

- The grid status follows the municipality of your home: the integration reads
  the location of the houses set in Gladys and finds their Brussels
  municipality by itself, without sending the coordinates anywhere. A new
  setting, **Follow the municipality of my home**, turns it off.
- The grid status widget names the municipalities followed.

### Changed

- The integration now asks for the house location permission when it is
  installed or updated.
- The municipalities chosen in the configuration are followed in addition to
  the one of your home; the setting is now named **Other municipalities to
  follow**.

## [1.0.0] - 2026-11-13

### Added

- Gas and electricity consumption from the Sibelga "My consumption" portal:
  one device per meter (EAN code) with its dated daily consumption, the
  consumption of the last day and of the last month, the meter indexes, and
  the injection for a meter that also injects.
- Status of the Sibelga grid: a device counting the ongoing outages in
  Brussels and in the municipalities you follow.
- Scene triggers: an outage started, an outage is resolved, new consumption
  data was published.
- Scene actions: refresh the data, get the consumption of a meter over a
  period, get the grid status.
- Dashboard widgets: the daily consumption of a meter, and the grid status.
- Configuration screen buttons to test the Sibelga account, test the grid
  status and refresh the data.
- Cloud transport badge on every device, "unreachable" when Sibelga cannot be
  read.
- English, French, German and Spanish for every text and for the user
  documentation.

[Unreleased]: https://github.com/gboulvin/Gladys-Sibelga/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/gboulvin/Gladys-Sibelga/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/gboulvin/Gladys-Sibelga/releases/tag/v1.0.0
