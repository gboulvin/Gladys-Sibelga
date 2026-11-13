// -----------------------------------------------------------------------------
// The integration's own logic: read Sibelga on a timer, keep the last known
// data in memory, and publish it to Gladys (devices, states, dated
// consumptions, transports, scene events, widget refreshes).
//
// Two independent sources, each with its own pace and its own failures:
//   - the consumption portal (account required), every few hours;
//   - the public outage page, every few minutes.
// A failure of one never blocks the other, and never throws to the caller:
// it is recorded in `consumption` / `network` for the status, the widgets and
// the actions to report.
// -----------------------------------------------------------------------------

import { DEVICE_TRANSPORTS, createLogger } from '@gladysassistant/integration-sdk';
import { hasCredentials, normalizeConfig } from './config.js';
import { t } from './i18n.js';
import { SibelgaSession } from './sibelga/auth.js';
import { SibelgaApi } from './sibelga/api.js';
import { localDate, shiftDate } from './sibelga/dates.js';
import { municipalitiesOfHouses } from './sibelga/geo.js';
import { fetchOutages } from './sibelga/network.js';
import {
  FEATURE,
  buildMeterDevice,
  lastDay,
  meterIds,
  meterIntervals,
  meterStates,
} from './devices/meter.js';
import {
  NETWORK_STATE,
  buildNetworkDevice,
  isWatched,
  networkIds,
  networkStates,
  watchedOutages,
} from './devices/network.js';
import { SCENE_TRIGGERS } from './scenes.js';
import { Store } from './store.js';

const logger = createLogger({ name: 'service' });

export const CONSUMPTION_STATE = {
  IDLE: 'idle',
  OK: 'ok',
  ERROR: 'error',
  NO_CREDENTIALS: 'no_credentials',
};

// A stable value is re-sent at this pace, so it stays recently dated in Gladys.
const STATE_HEARTBEAT_MS = 6 * 60 * 60 * 1000;
// Days of readings kept in memory for the widget chart, whatever the history
// sent to Gladys.
const MIN_WINDOW_DAYS = 35;
// An outage page read after a long stop can differ a lot: never flood scenes.
const MAX_EVENTS_PER_READ = 20;

// What to tell the user for each failure of the consumption portal.
const STATUS_MESSAGE = {
  credentials: 'status.credentials',
  unauthorized: 'status.credentials',
  network: 'status.unreachable',
  http: 'status.unreachable',
};

export class SibelgaService {
  #gladys;
  #fetchImpl;
  #store;
  #now;
  #api = null;
  #timers = [];
  #runs = { consumption: null, network: null };
  // Municipalities the houses of Gladys are in. Only these keys are kept:
  // the coordinates themselves never stay in memory.
  #homeMunicipalities = [];

  config = normalizeConfig();
  /** EAN -> { meter, days, indexes } */
  meters = new Map();
  consumption = { state: CONSUMPTION_STATE.IDLE, error: null, checkedAt: null };
  network = {
    state: NETWORK_STATE.UNKNOWN,
    reason: null,
    outages: [],
    watched: [],
    checkedAt: null,
  };

  /**
   * @param {import('@gladysassistant/integration-sdk').GladysIntegration} gladys
   * @param {{ fetchImpl?: typeof fetch, store?: Store, now?: () => Date }} [options] test seams
   */
  constructor(gladys, { fetchImpl, store = new Store(), now = () => new Date() } = {}) {
    this.#gladys = gladys;
    this.#fetchImpl = fetchImpl;
    this.#store = store;
    this.#now = now;
  }

  async init() {
    await this.#store.load();
  }

  /** Apply a configuration. A changed account starts from a new session. */
  configure(rawConfig) {
    const previous = this.config;
    this.config = normalizeConfig(rawConfig);
    if (
      !this.#api ||
      previous.email !== this.config.email ||
      previous.password !== this.config.password
    ) {
      const options = { fetchImpl: this.#fetchImpl };
      const { email, password } = this.config;
      this.#api = new SibelgaApi(new SibelgaSession({ email, password }, options), options);
      if (previous.email !== this.config.email) {
        this.meters = new Map();
      }
    }
    this.network.watched = this.watchedMunicipalities();
  }

  /**
   * Read where the houses of Gladys are, and keep their municipalities. Called
   * on every connection: Gladys sends no event when a house moves.
   */
  async locateHomes() {
    try {
      this.#homeMunicipalities = municipalitiesOfHouses(await this.#gladys.getHouses());
    } catch (err) {
      // An older Gladys, or the permission refused: the choice of the
      // configuration still applies.
      logger.warn(`Houses not read (${err.message}): only the configured municipalities apply`);
      this.#homeMunicipalities = [];
    }
    this.network.watched = this.watchedMunicipalities();
  }

  /**
   * Municipalities whose outages concern the user: the ones chosen in the
   * configuration, plus the ones of their houses. Empty: the whole region.
   */
  watchedMunicipalities() {
    const homes = this.config.use_home_location ? this.#homeMunicipalities : [];
    return [...new Set([...homes, ...this.config.municipalities])];
  }

  // --- Timers ----------------------------------------------------------------

  /** (Re)start the periodic reads. The first read is the caller's. */
  start() {
    this.stop();
    const every = (ms, run) => {
      const timer = setInterval(run, ms);
      // The WebSocket keeps the process alive, not these timers.
      timer.unref?.();
      this.#timers.push(timer);
    };
    every(this.config.consumption_refresh_hours * 60 * 60 * 1000, () => this.refreshConsumption());
    every(this.config.network_refresh_minutes * 60 * 1000, () => this.refreshNetwork());
  }

  stop() {
    this.#timers.forEach((timer) => clearInterval(timer));
    this.#timers = [];
  }

  // --- Devices ---------------------------------------------------------------

  /** Discovery payload: one device per meter, plus the grid device. */
  devices() {
    const devices = [...this.meters.values()].map(({ meter }) =>
      buildMeterDevice(this.#gladys, meter),
    );
    if (this.config.network_status_enabled) {
      devices.push(buildNetworkDevice(this.#gladys));
    }
    return devices;
  }

  /** The meter entry behind a device external_id, `undefined` when unknown. */
  findMeter(deviceExternalId) {
    return [...this.meters.values()].find(
      ({ meter }) => meterIds(this.#gladys, meter).device === deviceExternalId,
    );
  }

  async publishDevices() {
    await this.#gladys.publishDiscoveredDevices(this.devices());
  }

  /**
   * Send everything known to Gladys: plain states, dated consumptions and
   * transports. Called after each read, and when the user creates a device
   * (Gladys drops what is published for a device that does not exist yet).
   */
  async publishData() {
    const states = [...this.meters.values()].flatMap((entry) => meterStates(this.#gladys, entry));
    states.push(...networkStates(this.#gladys, this.network));
    await this.#gladys.publishChangedStates(states, { heartbeat: STATE_HEARTBEAT_MS });

    const today = localDate(this.#now());
    for (const entry of this.meters.values()) {
      const intervals = meterIntervals(entry, today).slice(-this.config.history_days);
      if (intervals.length > 0) {
        const feature = meterIds(this.#gladys, entry.meter).feature(FEATURE.DAILY_CONSUMPTION);
        await this.#gladys.publishEnergyConsumption(feature, intervals).catch((err) => {
          // 404: the user has not created the device yet. Sent again once
          // they do (onDeviceCreated in index.js).
          const log = err.status === 404 ? logger.debug : logger.warn;
          log.call(logger, `Daily consumption of ${entry.meter.ean} not stored: ${err.message}`);
        });
      }
    }
    await this.#publishTransports();
  }

  async #publishTransports() {
    const meterTransport =
      this.consumption.state === CONSUMPTION_STATE.OK
        ? DEVICE_TRANSPORTS.CLOUD
        : DEVICE_TRANSPORTS.UNREACHABLE;
    const entries = [...this.meters.values()].map(({ meter }) => ({
      external_id: meterIds(this.#gladys, meter).device,
      transport: meterTransport,
    }));
    if (this.network.state !== NETWORK_STATE.DISABLED) {
      entries.push({
        external_id: networkIds(this.#gladys).device,
        transport:
          this.network.state === NETWORK_STATE.OK
            ? DEVICE_TRANSPORTS.CLOUD
            : DEVICE_TRANSPORTS.UNREACHABLE,
      });
    }
    if (entries.length > 0) {
      await this.#gladys.publishTransports(entries).catch((err) => {
        logger.debug(`Transports not published: ${err.message}`);
      });
    }
  }

  // --- Reads -----------------------------------------------------------------

  /** Read both sources. Resolves once both are done, whatever their outcome. */
  async refreshAll() {
    await Promise.all([this.refreshConsumption(), this.refreshNetwork()]);
  }

  /** Read the consumption portal. Concurrent callers share one read. */
  refreshConsumption() {
    this.#runs.consumption ??= this.#readConsumption()
      .catch((err) => logger.error('Consumption read failed', err))
      .finally(() => {
        this.#runs.consumption = null;
      });
    return this.#runs.consumption;
  }

  /** Read the outage page. Concurrent callers share one read. */
  refreshNetwork() {
    this.#runs.network ??= this.#readNetwork()
      .catch((err) => logger.error('Grid status read failed', err))
      .finally(() => {
        this.#runs.network = null;
      });
    return this.#runs.network;
  }

  async #readConsumption() {
    const checkedAt = this.#now().toISOString();
    if (!hasCredentials(this.config)) {
      this.consumption = { state: CONSUMPTION_STATE.NO_CREDENTIALS, error: null, checkedAt };
      await this.#reportStatus();
      return;
    }
    try {
      const meters = await this.#api.getMeters();
      const today = localDate(this.#now());
      const from = shiftDate(today, -Math.max(this.config.history_days, MIN_WINDOW_DAYS));
      const entries = new Map();
      for (const meter of meters) {
        const previous = this.meters.get(meter.ean);
        // Only a smart meter has daily volumes and indexes on the portal.
        const days = meter.smart
          ? await this.#readOr(previous?.days ?? [], () =>
              this.#api.getDailyVolumes(meter, from, today),
            )
          : [];
        const indexes = meter.smart
          ? await this.#readOr(previous?.indexes ?? null, () => this.#api.getIndexes(meter))
          : null;
        entries.set(meter.ean, { meter, days, indexes });
      }
      this.meters = entries;
      this.consumption = { state: CONSUMPTION_STATE.OK, error: null, checkedAt };
      logger.info(`Consumption read: ${meters.length} metering point(s)`);
    } catch (err) {
      // The message of a SibelgaError never carries a credential.
      logger.warn(`Consumption portal: ${err.message}`);
      this.consumption = {
        state: CONSUMPTION_STATE.ERROR,
        error: err.code ?? 'unexpected',
        checkedAt,
      };
      await this.#reportStatus();
      await this.#publishTransports();
      this.#refreshWidgets();
      return;
    }
    await this.publishDevices();
    await this.publishData();
    await this.#announceNewDays();
    await this.#reportStatus();
    this.#refreshWidgets();
  }

  /** One read of one meter: an API hiccup keeps the previous value. */
  async #readOr(fallback, read) {
    try {
      return await read();
    } catch (err) {
      if (err.code !== 'http' && err.code !== 'unexpected') {
        throw err;
      }
      logger.warn(`Sibelga API: ${err.message}, keeping the previous values`);
      return fallback;
    }
  }

  /** Fire `consumption_updated` once per meter and per new day of readings. */
  async #announceNewDays() {
    for (const entry of this.meters.values()) {
      const day = lastDay(entry);
      const known = this.#store.lastDate(entry.meter.ean);
      if (!day || (known !== null && day.date <= known)) {
        continue;
      }
      // The first read of a meter only records where its readings stand.
      if (known !== null) {
        await this.#fire(SCENE_TRIGGERS.CONSUMPTION_UPDATED, {
          meter: meterIds(this.#gladys, entry.meter).device,
          energy: entry.meter.energy,
          name: entry.meter.name,
          ean: entry.meter.ean,
          date: day.date,
          consumption: day.consumption,
          injection: day.injection ?? 0,
        });
      }
      await this.#store.setLastDate(entry.meter.ean, day.date);
    }
  }

  async #readNetwork() {
    const checkedAt = this.#now().toISOString();
    const watched = this.watchedMunicipalities();
    if (!this.config.network_status_enabled) {
      this.network = {
        state: NETWORK_STATE.DISABLED,
        reason: null,
        outages: [],
        watched,
        checkedAt,
      };
      return;
    }
    let outages;
    try {
      outages = await fetchOutages({ fetchImpl: this.#fetchImpl });
    } catch (err) {
      logger.warn(`Grid status: ${err.message}`);
      // The last known outages are dropped: showing them as current would be
      // a guess.
      this.network = {
        state: NETWORK_STATE.UNKNOWN,
        reason: err.code === 'blocked' ? 'blocked' : 'unavailable',
        outages: [],
        watched,
        checkedAt,
      };
      await this.#afterNetworkRead();
      return;
    }
    this.network = { state: NETWORK_STATE.OK, reason: null, outages, watched, checkedAt };
    logger.info(`Grid status read: ${outages.length} ongoing outage(s)`);

    const known = this.#store.knownOutages();
    // The first read only records the outages already there.
    if (known !== null) {
      const knownIds = new Set(known.map((outage) => outage.id));
      const currentIds = new Set(outages.map((outage) => outage.id));
      const started = outages.filter((outage) => !knownIds.has(outage.id));
      const resolved = known.filter((outage) => !currentIds.has(outage.id));
      const count = watchedOutages(this.network).length;
      const events = [
        ...started.map((outage) => [SCENE_TRIGGERS.OUTAGE_STARTED, outage]),
        ...resolved.map((outage) => [SCENE_TRIGGERS.OUTAGE_RESOLVED, outage]),
      ];
      for (const [trigger, outage] of events.slice(0, MAX_EVENTS_PER_READ)) {
        await this.#fire(trigger, {
          scope: isWatched(outage, watched) ? 'watched' : 'other',
          id: outage.id,
          title: outage.title,
          municipalities: outage.municipalities.join(', '),
          url: outage.url,
          count,
        });
      }
    }
    await this.#store.setKnownOutages(outages);
    await this.#afterNetworkRead();
  }

  async #afterNetworkRead() {
    await this.#gladys
      .publishChangedStates(networkStates(this.#gladys, this.network), {
        heartbeat: STATE_HEARTBEAT_MS,
      })
      .catch((err) => logger.warn(`Grid states not published: ${err.message}`));
    await this.#publishTransports();
    await this.#reportStatus();
    this.#refreshWidgets();
  }

  async #fire(trigger, data) {
    await this.#gladys.publishSceneEvent(trigger, data).catch((err) => {
      logger.warn(`Scene event ${trigger} not published: ${err.message}`);
    });
  }

  // --- Status ----------------------------------------------------------------

  /** Why the last consumption read failed, as a message; `null` when it did not. */
  consumptionProblem() {
    if (this.consumption.state === CONSUMPTION_STATE.NO_CREDENTIALS) {
      return t('status.no_credentials');
    }
    if (this.consumption.state === CONSUMPTION_STATE.ERROR) {
      return t(STATUS_MESSAGE[this.consumption.error] ?? 'status.unexpected');
    }
    return null;
  }

  /** Why the grid status is unknown, as a message; `null` when it is known. */
  networkProblem() {
    if (this.network.state !== NETWORK_STATE.UNKNOWN || this.network.reason === null) {
      return null;
    }
    return t(this.network.reason === 'blocked' ? 'network.blocked' : 'network.unavailable');
  }

  /**
   * Application-level status of the Configuration screen. It follows the
   * consumption portal; without an account, the grid status alone.
   */
  async #reportStatus() {
    const { state } = this.consumption;
    if (state === CONSUMPTION_STATE.IDLE) {
      return;
    }
    const gridOnly =
      state === CONSUMPTION_STATE.NO_CREDENTIALS && this.network.state === NETWORK_STATE.OK;
    const connected = state === CONSUMPTION_STATE.OK || gridOnly;
    await this.#gladys
      .setConnectionStatus(connected, connected ? undefined : this.consumptionProblem())
      .catch((err) => logger.debug(`Connection status not reported: ${err.message}`));
  }

  #refreshWidgets() {
    for (const key of WIDGET_KEYS) {
      this.#gladys.requestWidgetRefresh(key);
    }
  }
}

// Widget keys, as declared in the manifest `widgets` field.
export const WIDGET_KEYS = ['consumption', 'network_status'];
