// -----------------------------------------------------------------------------
// Scene triggers and scene actions (manifest `scene_triggers` / `scene_actions`,
// Gladys 5.1+).
//
// TRIGGERS say "this happened": the service fires them with
// `gladys.publishSceneEvent` when a read shows something new (src/service.js).
// One event per transition, never one per read.
//
// ACTIONS are operations a scene author places in a scene. Each handler is
// keyed by the manifest `key`, receives the RESOLVED fields and resolves the
// declared scalar `outputs`. An action never fires a trigger as its own
// consequence... except `refresh`, whose read can discover a real change
// (a new outage): a scene bound to a trigger must therefore not call
// `refresh`, which the documentation says.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { roundKwh } from './sibelga/dates.js';
import { lastDay } from './devices/meter.js';
import { NETWORK_STATE, watchedOutages } from './devices/network.js';

const logger = createLogger({ name: 'scenes' });

// Trigger keys, as declared in the manifest `scene_triggers` field.
export const SCENE_TRIGGERS = {
  OUTAGE_STARTED: 'outage_started',
  OUTAGE_RESOLVED: 'outage_resolved',
  CONSUMPTION_UPDATED: 'consumption_updated',
};

// Number of days each `period` of get_consumption adds up.
const PERIOD_DAYS = { last_day: 1, last_7_days: 7, last_30_days: 30 };

export const SCENE_ACTIONS = {
  /** Read Sibelga now instead of waiting for the next periodic read. */
  async refresh(service) {
    logger.info('Scene action refresh');
    await service.refreshAll();
    return {
      success: service.consumptionProblem() === null && service.networkProblem() === null,
      meters: service.meters.size,
      outages: service.network.outages.length,
    };
  },

  /**
   * Consumption of a meter over a period, from the readings in memory. A
   * meter without readings is an output (`available: false`), not a failure:
   * the scene author gates on it.
   */
  async get_consumption(service, { fields }) {
    const entry = service.findMeter(fields.meter);
    const days = entry?.days.filter((day) => day.consumption !== null) ?? [];
    const count = PERIOD_DAYS[fields.period] ?? 1;
    const period = days.slice(-count);
    if (period.length === 0) {
      return { available: false, consumption: 0, injection: 0, date: '', days: 0 };
    }
    return {
      available: true,
      consumption: roundKwh(period.reduce((sum, day) => sum + day.consumption, 0)),
      injection: roundKwh(period.reduce((sum, day) => sum + (day.injection ?? 0), 0)),
      date: lastDay(entry).date,
      days: period.length,
    };
  },

  /** The grid status known right now (no request to Sibelga). */
  async get_network_status(service) {
    const { network } = service;
    const watched = watchedOutages(network);
    return {
      known: network.state === NETWORK_STATE.OK,
      outages: network.outages.length,
      outages_watched: watched.length,
      affected: watched.length > 0,
      summary: watched
        .map((outage) => outage.title)
        .join(' | ')
        .slice(0, 1000),
    };
  },
};
