// -----------------------------------------------------------------------------
// Device type: SIBELGA METER
// One Gladys device per metering point of the account (one EAN code), for
// electricity and for gas. Read-only: the values come from the Sibelga portal,
// which publishes the readings of a day on the next one.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';
import { ENERGY } from '../sibelga/api.js';

export const METER_TYPE = 'meter';

// Feature keys: part of the external ids, never rename one.
export const FEATURE = {
  // Dated daily consumption, fed with publishEnergyConsumption: the history
  // Gladys draws and prices. The others are plain states.
  DAILY_CONSUMPTION: 'daily-consumption',
  LAST_DAY: 'last-day',
  LAST_MONTH: 'last-month',
  INDEX_DAY: 'index-day',
  INDEX_NIGHT: 'index-night',
  INJECTION_LAST_DAY: 'injection-last-day',
  INJECTION_INDEX_DAY: 'injection-index-day',
  INJECTION_INDEX_NIGHT: 'injection-index-night',
};

const ENERGY_LABEL = { [ENERGY.ELECTRICITY]: 'Electricity', [ENERGY.GAS]: 'Gas' };

/** External ids of a meter. The EAN is the stable identifier Sibelga gives it. */
export function meterIds(gladys, meter) {
  return gladys.externalIds(METER_TYPE, meter.ean);
}

function energyFeature(ids, key, name, type = DEVICE_FEATURE_TYPES.ENERGY_SENSOR.ENERGY) {
  return {
    name,
    external_id: ids.feature(key),
    category: DEVICE_FEATURE_CATEGORIES.ENERGY_SENSOR,
    type,
    unit: DEVICE_FEATURE_UNITS.KILOWATT_HOUR,
    min: 0,
    max: 1_000_000_000,
    read_only: true,
    has_feedback: false,
    keep_history: true,
  };
}

/**
 * Discovery payload of a meter.
 * @param {import('../sibelga/api.js').Meter} meter
 */
export function buildMeterDevice(gladys, meter) {
  const ids = meterIds(gladys, meter);
  const features = [
    energyFeature(
      ids,
      FEATURE.DAILY_CONSUMPTION,
      'Daily consumption',
      DEVICE_FEATURE_TYPES.ENERGY_SENSOR.DAILY_CONSUMPTION,
    ),
    energyFeature(ids, FEATURE.LAST_DAY, 'Consumption of the last day'),
    energyFeature(ids, FEATURE.LAST_MONTH, 'Consumption of the last month'),
  ];
  // The meter indexes are published as plain energy values, NOT as `index`
  // features: Gladys would derive a consumption from an index, and the
  // readings arrive a day late (see publishEnergyConsumption in the SDK).
  if (meter.energy === ENERGY.ELECTRICITY && meter.smart) {
    features.push(
      energyFeature(ids, FEATURE.INDEX_DAY, 'Meter index (peak hours)'),
      energyFeature(ids, FEATURE.INDEX_NIGHT, 'Meter index (off-peak hours)'),
    );
  }
  if (meter.injects) {
    features.push(
      energyFeature(ids, FEATURE.INJECTION_LAST_DAY, 'Injection of the last day'),
      energyFeature(ids, FEATURE.INJECTION_INDEX_DAY, 'Injection index (peak hours)'),
      energyFeature(ids, FEATURE.INJECTION_INDEX_NIGHT, 'Injection index (off-peak hours)'),
    );
  }
  const label = meter.name === meter.ean ? meter.ean : `${meter.name} (${meter.ean})`;
  return {
    name: `Sibelga ${ENERGY_LABEL[meter.energy]} ${label}`,
    external_id: ids.device,
    // No `poll_frequency`: the integration reads Sibelga on its own timer,
    // every few hours (see src/service.js).
    should_poll: false,
    features,
  };
}

/** The last day of an entry that carries a consumption, `null` when none does. */
export function lastDay(entry) {
  return entry.days.findLast((day) => day.consumption !== null) ?? null;
}

/**
 * Plain states of a meter: one per feature that has a value.
 * @param {{ meter: import('../sibelga/api.js').Meter, days: object[], indexes: object|null }} entry
 */
export function meterStates(gladys, entry) {
  const { meter, indexes } = entry;
  const ids = meterIds(gladys, meter);
  const day = lastDay(entry);
  const values = {
    [FEATURE.LAST_DAY]: day?.consumption ?? meter.lastDayConsumption,
    [FEATURE.LAST_MONTH]: meter.lastMonthConsumption,
  };
  if (meter.energy === ENERGY.ELECTRICITY && meter.smart) {
    values[FEATURE.INDEX_DAY] = indexes?.consumption.day;
    values[FEATURE.INDEX_NIGHT] = indexes?.consumption.night;
  }
  if (meter.injects) {
    values[FEATURE.INJECTION_LAST_DAY] = entry.days.findLast(
      (d) => d.injection !== null,
    )?.injection;
    values[FEATURE.INJECTION_INDEX_DAY] = indexes?.injection.day;
    values[FEATURE.INJECTION_INDEX_NIGHT] = indexes?.injection.night;
  }
  return Object.entries(values)
    .filter(([, value]) => typeof value === 'number')
    .map(([key, state]) => ({ device_feature_external_id: ids.feature(key), state }));
}

/**
 * Dated daily consumptions for publishEnergyConsumption: the elapsed days
 * only (Gladys refuses an interval that is not over).
 * @param {string} today local date (YYYY-MM-DD)
 */
export function meterIntervals(entry, today) {
  return entry.days
    .filter((day) => day.consumption !== null && day.date < today)
    .map((day) => ({ date: day.date, kwh: day.consumption }));
}
