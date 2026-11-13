// -----------------------------------------------------------------------------
// Device type: SIBELGA GRID
// A single device for the status of the Brussels grid: the number of ongoing
// outages, in the whole region and in the municipalities the user watches.
// The events ("an outage started") are scene triggers, see src/scenes.js.
// -----------------------------------------------------------------------------

import { DEVICE_FEATURE_CATEGORIES, DEVICE_FEATURE_TYPES } from '@gladysassistant/integration-sdk';

export const NETWORK_TYPE = 'network';
// Sibelga operates one grid: the Brussels-Capital Region.
const PLATFORM_ID = 'brussels';

// Feature keys: part of the external ids, never rename one.
export const NETWORK_FEATURE = {
  OUTAGES: 'outages',
  OUTAGES_WATCHED: 'outages-watched',
};

export const NETWORK_STATE = { OK: 'ok', UNKNOWN: 'unknown', DISABLED: 'disabled' };

export function networkIds(gladys) {
  return gladys.externalIds(NETWORK_TYPE, PLATFORM_ID);
}

function counterFeature(ids, key, name) {
  return {
    name,
    external_id: ids.feature(key),
    category: DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR,
    type: DEVICE_FEATURE_TYPES.SENSOR.INTEGER,
    min: 0,
    max: 10_000,
    read_only: true,
    has_feedback: false,
    keep_history: true,
  };
}

export function buildNetworkDevice(gladys) {
  const ids = networkIds(gladys);
  return {
    name: 'Sibelga grid',
    external_id: ids.device,
    should_poll: false,
    features: [
      counterFeature(ids, NETWORK_FEATURE.OUTAGES, 'Ongoing outages in Brussels'),
      counterFeature(ids, NETWORK_FEATURE.OUTAGES_WATCHED, 'Ongoing outages in my municipalities'),
    ],
  };
}

/** True when an outage concerns the watched municipalities (none: all of them). */
export function isWatched(outage, watched) {
  return watched.length === 0 || outage.municipalities.some((key) => watched.includes(key));
}

/** The outages of a network status that concern the watched municipalities. */
export function watchedOutages(network) {
  return network.outages.filter((outage) => isWatched(outage, network.watched));
}

/** States of the grid device; nothing while the status is unknown. */
export function networkStates(gladys, network) {
  if (network.state !== NETWORK_STATE.OK) {
    return [];
  }
  const ids = networkIds(gladys);
  return [
    {
      device_feature_external_id: ids.feature(NETWORK_FEATURE.OUTAGES),
      state: network.outages.length,
    },
    {
      device_feature_external_id: ids.feature(NETWORK_FEATURE.OUTAGES_WATCHED),
      state: watchedOutages(network).length,
    },
  ];
}
