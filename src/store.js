// -----------------------------------------------------------------------------
// Small persisted memory of the integration, in the `/data` volume (the only
// writable place of the container).
//
// It only remembers what was already announced to Gladys — the last day of
// readings per meter and the outages already seen — so a restart does not
// fire the scene triggers a second time. It holds no credential and no token.
// Losing the file is harmless: the next read seeds it again, silently.
// -----------------------------------------------------------------------------

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createLogger } from '@gladysassistant/integration-sdk';

const logger = createLogger({ name: 'store' });
const FILE_NAME = 'state.json';

export class Store {
  #file;
  // `lastDates`: EAN -> last local date announced. `outages`: the outages
  // seen at the last read, `null` until the outage page was read once.
  #state = { lastDates: {}, outages: null };

  /** @param {string|null} directory `null` keeps everything in memory (tests) */
  constructor(directory = process.env.SIBELGA_DATA_DIR ?? '/data') {
    this.#file = directory ? join(directory, FILE_NAME) : null;
  }

  async load() {
    if (!this.#file) {
      return;
    }
    try {
      const saved = JSON.parse(await readFile(this.#file, 'utf8'));
      this.#state = {
        lastDates: saved.lastDates && typeof saved.lastDates === 'object' ? saved.lastDates : {},
        outages: Array.isArray(saved.outages)
          ? saved.outages.filter((outage) => outage && typeof outage.id === 'string')
          : null,
      };
    } catch (err) {
      if (err.code !== 'ENOENT') {
        logger.warn(`State file unreadable, starting fresh: ${err.message}`);
      }
    }
  }

  async #save() {
    if (!this.#file) {
      return;
    }
    try {
      await mkdir(join(this.#file, '..'), { recursive: true });
      // Write then rename: a container stopped mid-write leaves the old file.
      await writeFile(`${this.#file}.tmp`, JSON.stringify(this.#state));
      await rename(`${this.#file}.tmp`, this.#file);
    } catch (err) {
      logger.warn(`State file not saved: ${err.message}`);
    }
  }

  lastDate(ean) {
    return this.#state.lastDates[ean] ?? null;
  }

  async setLastDate(ean, date) {
    this.#state.lastDates[ean] = date;
    await this.#save();
  }

  /** The outages seen at the last read, `null` before the first one. */
  knownOutages() {
    return this.#state.outages;
  }

  async setKnownOutages(outages) {
    this.#state.outages = outages.map(({ id, title, url, municipalities }) => ({
      id,
      title,
      url,
      municipalities,
    }));
    await this.#save();
  }
}
