// -----------------------------------------------------------------------------
// Integration configuration.
//
// Filled in by the user in Gladys, from the `config_schema` declared in
// `gladys-assistant-integration.json`. This module provides the defaults and
// normalizes the received object, so the rest of the code never deals with
// `undefined` or with numbers typed as strings.
// -----------------------------------------------------------------------------

import { parseWatchedMunicipalities } from './sibelga/network.js';

// Defaults: they MUST stay consistent with the `default` values declared in the
// `config_schema` of the manifest (checked by test/manifest.test.js).
export const DEFAULT_CONFIG = {
  email: '',
  password: '',
  // Days of daily readings sent to Gladys when a meter is first seen.
  history_days: 30,
  // Hours between two reads of the consumption portal. Sibelga publishes the
  // readings of a day on the next one: there is nothing to gain below an hour.
  consumption_refresh_hours: 6,
  network_status_enabled: true,
  // Keys of the municipalities to watch (see MUNICIPALITIES). Empty: the whole
  // Brussels region.
  municipalities: [],
  // Minutes between two reads of the public outage page.
  network_refresh_minutes: 15,
};

function toNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, number));
}

/**
 * Merge the user config with the defaults.
 * @param {Record<string, unknown>} raw config returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  return {
    ...DEFAULT_CONFIG,
    ...raw,
    email: String(raw.email ?? DEFAULT_CONFIG.email).trim(),
    password: String(raw.password ?? DEFAULT_CONFIG.password),
    history_days: Math.round(toNumber(raw.history_days, DEFAULT_CONFIG.history_days, 1, 365)),
    consumption_refresh_hours: toNumber(
      raw.consumption_refresh_hours,
      DEFAULT_CONFIG.consumption_refresh_hours,
      1,
      24,
    ),
    network_status_enabled: raw.network_status_enabled !== false,
    // A multi-select arrives as an array of keys; a hand-typed list of names
    // is accepted too. Anything that is not a Brussels municipality is dropped.
    municipalities: parseWatchedMunicipalities(
      Array.isArray(raw.municipalities) ? raw.municipalities.join(',') : raw.municipalities,
    ),
    network_refresh_minutes: toNumber(
      raw.network_refresh_minutes,
      DEFAULT_CONFIG.network_refresh_minutes,
      5,
      720,
    ),
  };
}

/** True when the user filled in the credentials of the consumption portal. */
export function hasCredentials(config) {
  return config.email !== '' && config.password !== '';
}
