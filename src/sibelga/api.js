// -----------------------------------------------------------------------------
// Client of the Sibelga "My consumption" portal API.
//
// Three reads, the ones the portal itself does:
//   - GET /sdps/overview                      the metering points of the account;
//   - GET /consumptions/{id}?period=DAILY...  the daily volumes of one of them;
//   - GET /meters/{id}/index-view/volumes     the last indexes its meter sent.
//
// The API is not documented: every answer is read defensively and normalized
// here, so the rest of the code only sees the shapes declared below and a
// change on Sibelga's side is fixed in this one file.
// -----------------------------------------------------------------------------

import { API_BASE_URL } from './constants.js';
import { apiHeaders } from './auth.js';
import { SibelgaError, request } from './http.js';
import { endOfLocalDay, localDate, roundKwh, startOfLocalDay } from './dates.js';

export const ENERGY = { ELECTRICITY: 'electricity', GAS: 'gas' };

// Volumes the portal asks for on its consumption chart.
const VOLUME_TYPES = ['INJECTION_DAY', 'INJECTION_NIGHT', 'CONSUMPTION_DAY', 'CONSUMPTION_NIGHT'];

const asArray = (value) => (Array.isArray(value) ? value : []);
const asNumber = (value) =>
  Number.isFinite(Number(value)) && value !== null ? Number(value) : null;

/** The list an answer carries, whether it is the body itself or wrapped. */
function listOf(body) {
  if (Array.isArray(body)) {
    return body;
  }
  return asArray(body?.items ?? body?.data ?? body?.sdps);
}

/** The meter currently installed on a metering point (no end date). */
function activeMeter(headpoint) {
  const meters = asArray(headpoint?.physicalMeters);
  return meters.find((meter) => meter.headpointHasMeterEnd == null) ?? meters[0] ?? null;
}

/**
 * @typedef {object} Meter a metering point of the account
 * @property {string} id            portal identifier, used in the API paths
 * @property {string} ean           EAN code: unique and stable, keys the Gladys device
 * @property {string} name          name the user gave it on the portal, or the EAN
 * @property {'electricity'|'gas'} energy
 * @property {boolean} active       the account may read it (not waiting for a consent, not expired)
 * @property {boolean} smart        a smart meter (the only ones with daily data)
 * @property {boolean} injects      the point injects energy too (solar panels)
 * @property {string|null} serialNumber
 * @property {string|null} lastAvailableDate  last local day with data (YYYY-MM-DD)
 * @property {number|null} lastDayConsumption    kWh
 * @property {number|null} lastMonthConsumption  kWh
 */

/** @returns {Meter|null} `null` for an entry without an EAN */
export function normalizeMeter(sdp) {
  const ean = sdp?.headpoint?.ean ?? sdp?.ean;
  if (!ean || sdp?.id == null) {
    return null;
  }
  const meter = activeMeter(sdp.headpoint);
  const nickname = typeof sdp.userHasAccessNickname === 'string' ? sdp.userHasAccessNickname : '';
  const direction = String(sdp.direction ?? '').toUpperCase();
  return {
    id: String(sdp.id),
    ean: String(ean),
    name: nickname.trim() || String(ean),
    energy: String(sdp.division).toUpperCase() === 'GAS' ? ENERGY.GAS : ENERGY.ELECTRICITY,
    // WAITING (consent asked to the contract holder), EXPIRED and INACTIVE
    // points are listed by the portal but have no data to read.
    active: sdp.userHasAccessStatus == null || sdp.userHasAccessStatus === 'ACTIVE',
    smart: String(meter?.type ?? '').toUpperCase() === 'SMART',
    injects: direction === 'COMB' || direction === 'PROD' || sdp.hasBeenProsumer === true,
    serialNumber: meter?.serialNumber != null ? String(meter.serialNumber) : null,
    lastAvailableDate: meter?.lastAvailableDay ? localDate(meter.lastAvailableDay) : null,
    lastAvailableInstant: meter?.lastAvailableDay ?? null,
    lastDayConsumption: asNumber(meter?.lastDayConsumption),
    lastMonthConsumption: asNumber(meter?.lastMonthConsumption),
  };
}

/**
 * Group the daily volume rows by local day.
 * A row is `{ time, volumeType, total, day, night }`; its `volumeType` names
 * consumption or injection volumes.
 * @returns {{ date: string, consumption: number|null, injection: number|null }[]} oldest first
 */
export function normalizeDailyVolumes(rows) {
  const days = new Map();
  for (const row of asArray(rows)) {
    const date = localDate(row?.time);
    const total = asNumber(row?.total);
    const type = String(row?.volumeType ?? '');
    // Volumes shared inside an energy community are a breakdown of the total.
    if (!date || total === null || /SHARED|NETWORK/.test(type)) {
      continue;
    }
    const day = days.get(date) ?? { date, consumption: null, injection: null };
    if (type.includes('INJECTION')) {
      day.injection = roundKwh((day.injection ?? 0) + Math.abs(total));
    } else if (type.includes('CONSUMPTION')) {
      day.consumption = roundKwh((day.consumption ?? 0) + Math.abs(total));
    }
    days.set(date, day);
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * The last indexes a smart meter sent: `{ date, consumption: { day, night },
 * injection: { day, night } }`, kWh, `null` where the meter has no such index.
 */
export function normalizeIndexes(rows) {
  const [last] = asArray(rows);
  if (!last) {
    return null;
  }
  const pair = (volumes) => ({ day: asNumber(volumes?.day), night: asNumber(volumes?.night) });
  return {
    date: localDate(last.period),
    consumption: pair(last.consumption),
    injection: pair(last.injection),
  };
}

export class SibelgaApi {
  #session;
  #fetchImpl;

  /** @param {import('./auth.js').SibelgaSession} session */
  constructor(session, { fetchImpl } = {}) {
    this.#session = session;
    this.#fetchImpl = fetchImpl;
  }

  async #get(path, retry = true) {
    const token = await this.#session.accessToken();
    const response = await request(`${API_BASE_URL}${path}`, {
      fetchImpl: this.#fetchImpl,
      headers: apiHeaders({ Authorization: `Bearer ${token}` }),
    });
    if (response.status === 401 && retry) {
      // The token was revoked before its announced end: sign in again, once.
      this.#session.invalidate();
      return this.#get(path, false);
    }
    if (response.status === 401 || response.status === 403) {
      throw new SibelgaError('unauthorized', `Sibelga refused the session (${response.status}).`, {
        status: response.status,
      });
    }
    if (response.status === 204 || response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new SibelgaError('http', `Sibelga API: HTTP ${response.status}`, {
        status: response.status,
      });
    }
    return response.json().catch(() => null);
  }

  /** @returns {Promise<Meter[]>} the metering points the account may read */
  async getMeters() {
    const body = await this.#get('/sdps/overview');
    return listOf(body)
      .map(normalizeMeter)
      .filter((meter) => meter?.active);
  }

  /**
   * Daily volumes of a metering point between two local dates (inclusive).
   * @param {Meter} meter
   */
  async getDailyVolumes(meter, fromDate, toDate) {
    const query = new URLSearchParams({
      period: 'DAILY',
      volumeType: VOLUME_TYPES.join(','),
      meterLastUpdate: new Date(meter.lastAvailableInstant ?? Date.now()).toISOString(),
      startDate: startOfLocalDay(fromDate).toISOString(),
      endDate: endOfLocalDay(toDate).toISOString(),
    });
    const body = await this.#get(`/consumptions/${encodeURIComponent(meter.id)}?${query}`);
    return normalizeDailyVolumes(listOf(body));
  }

  /** Last indexes sent by the meter, `null` when there are none. */
  async getIndexes(meter) {
    const body = await this.#get(`/meters/${encodeURIComponent(meter.id)}/index-view/volumes`);
    return normalizeIndexes(listOf(body));
  }
}
