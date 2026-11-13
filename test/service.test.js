// -----------------------------------------------------------------------------
// The integration end to end, on a fake Gladys and a fake Sibelga: devices,
// states, dated consumptions, transports, connection status.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/store.js';
import {
  EMAIL,
  OUTAGE_A,
  OUTAGE_B,
  createApp,
  createFakeSibelga,
  sdp,
  volumes,
} from './helpers.js';

const METER = 'ext:test-integration:meter:541449000000000011';
const GRID = 'ext:test-integration:network:brussels';

test('connecting publishes one device per meter and the grid device', async () => {
  const { gladys } = await createApp();
  const devices = gladys.fake.discoveredDevices;
  assert.deepEqual(
    devices.map((device) => [device.external_id, device.name]),
    [
      [METER, 'Sibelga Electricity Home (541449000000000011)'],
      [GRID, 'Sibelga grid'],
    ],
  );
  assert.deepEqual(
    devices[0].features.map((feature) => feature.external_id.replace(`${METER}:`, '')),
    ['daily-consumption', 'last-day', 'last-month', 'index-day', 'index-night'],
  );
  for (const device of devices) {
    assert.equal(device.should_poll, false, 'the integration reads Sibelga on its own timer');
    assert.ok(device.features.every((feature) => feature.read_only));
  }
  assert.equal(gladys.fake.connectionStatus.connected, true);
});

test('the readings are published as states', async () => {
  const { gladys } = await createApp();
  assert.equal(gladys.fake.lastState(`${METER}:last-day`), 7.5);
  assert.equal(gladys.fake.lastState(`${METER}:last-month`), 210.4);
  assert.equal(gladys.fake.lastState(`${METER}:index-day`), 1234.5);
  assert.equal(gladys.fake.lastState(`${METER}:index-night`), 987.6);
  assert.equal(gladys.fake.lastState(`${GRID}:outages`), 0);
  assert.equal(gladys.fake.lastState(`${GRID}:outages-watched`), 0);
  // The dated feature never goes through the plain states.
  assert.equal(gladys.fake.lastState(`${METER}:daily-consumption`), undefined);
});

test('an unchanged reading is not sent again', async () => {
  const { gladys, service } = await createApp();
  const sent = gladys.fake.states.length;
  await service.refreshAll();
  assert.equal(gladys.fake.states.length, sent);
});

test('the daily consumptions are dated, once the user created the device', async () => {
  const app = await createApp();
  const { gladys, service } = app;
  // Not created yet: Gladys answers 404, and nothing breaks.
  assert.deepEqual(gladys.fake.publishedEnergyConsumption, []);

  app.createDevices();
  await gladys.fake.deviceCreated(gladys.fake.devices[0]);
  assert.deepEqual(gladys.fake.publishedEnergyConsumption.at(-1), {
    device_feature_external_id: `${METER}:daily-consumption`,
    intervals: [
      { date: '2026-11-10', kwh: 6.2 },
      { date: '2026-11-11', kwh: 7.5 },
    ],
  });
  assert.equal(service.meters.size, 1);
});

test('a day that is not over is never published as a dated consumption', async () => {
  const sibelga = createFakeSibelga();
  sibelga.state.volumes['sdp-1'] = volumes({
    '2026-11-11': { consumption: 7.5 },
    '2026-11-12': { consumption: 1.1 },
  });
  const app = await createApp({ sibelga });
  app.createDevices();
  await app.service.publishData();
  assert.deepEqual(app.gladys.fake.publishedEnergyConsumption.at(-1).intervals, [
    { date: '2026-11-11', kwh: 7.5 },
  ]);
});

test('the history sent to Gladys follows the configuration', async () => {
  const app = await createApp({
    config: { email: EMAIL, password: 'correct horse', history_days: 1 },
  });
  app.createDevices();
  await app.service.publishData();
  assert.deepEqual(app.gladys.fake.publishedEnergyConsumption.at(-1).intervals, [
    { date: '2026-11-11', kwh: 7.5 },
  ]);
});

test('a gas meter, a classical meter and a prosumer get the features they have', async () => {
  const sibelga = createFakeSibelga();
  sibelga.state.sdps = [
    sdp({ id: 'gas', ean: '541449000000000028', division: 'GAS', nickname: '' }),
    sdp({ id: 'old', ean: '541449000000000035', type: 'CLASSICAL', lastDayConsumption: null }),
    sdp({ id: 'sun', ean: '541449000000000042', direction: 'COMB' }),
  ];
  sibelga.state.volumes = { sun: volumes({ '2026-11-11': { consumption: 2, injection: 4.5 } }) };
  sibelga.state.indexes = {
    sun: [
      {
        period: '2026-11-11T23:00:00Z',
        consumption: { day: 10, night: 20 },
        injection: { day: 30, night: 40 },
      },
    ],
  };
  const { gladys, sibelga: fake } = await createApp({ sibelga });
  const features = (ean) =>
    gladys.fake.discoveredDevices
      .find((device) => device.external_id.endsWith(ean))
      .features.map((feature) => feature.external_id.split(':').pop());

  assert.equal(gladys.fake.discoveredDevices[0].name, 'Sibelga Gas 541449000000000028');
  assert.deepEqual(features('541449000000000028'), ['daily-consumption', 'last-day', 'last-month']);
  assert.deepEqual(features('541449000000000035'), ['daily-consumption', 'last-day', 'last-month']);
  assert.ok(features('541449000000000042').includes('injection-last-day'));
  const sun = 'ext:test-integration:meter:541449000000000042';
  assert.equal(gladys.fake.lastState(`${sun}:injection-last-day`), 4.5);
  assert.equal(gladys.fake.lastState(`${sun}:injection-index-night`), 40);
  // Only a smart meter has daily volumes on the portal: no request for the others.
  assert.ok(!fake.calls.some(({ url }) => url.includes('/consumptions/old')));
  // No value, no state: a missing reading is not a zero.
  assert.equal(
    gladys.fake.lastState('ext:test-integration:meter:541449000000000035:last-day'),
    undefined,
  );
});

test('every device carries the cloud transport, unreachable when its source fails', async () => {
  const { gladys, service, sibelga } = await createApp();
  assert.deepEqual(gladys.fake.transports.slice(-2), [
    { device_external_id: METER, transport: 'cloud' },
    { device_external_id: GRID, transport: 'cloud' },
  ]);
  sibelga.state.apiStatus = 503;
  sibelga.state.outagePageMode = 'blocked';
  await service.refreshAll();
  assert.deepEqual(gladys.fake.transports.slice(-2), [
    { device_external_id: METER, transport: 'unreachable' },
    { device_external_id: GRID, transport: 'unreachable' },
  ]);
});

test('without credentials the integration says what is missing', async () => {
  const sibelga = createFakeSibelga({ outagePageMode: 'error' });
  const { gladys, service } = await createApp({ config: {}, sibelga });
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.fr, /adresse e-mail/);
  assert.ok(!sibelga.calls.some(({ url }) => url.includes('auth.conso')), 'no sign-in attempt');

  // The grid status alone is a valid use of the integration.
  sibelga.state.outagePageMode = 'ok';
  await service.refreshAll();
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.deepEqual(
    gladys.fake.discoveredDevices.map((device) => device.external_id),
    [GRID],
  );
});

test('a refused password is reported, and fixed by a configuration update', async () => {
  const { gladys, service } = await createApp({ config: { email: EMAIL, password: 'wrong' } });
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /refused/);
  assert.equal(service.meters.size, 0);

  await gladys.fake.configUpdated({ email: EMAIL, password: 'correct horse' });
  service.stop();
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.equal(service.meters.size, 1);
});

test('a failing portal keeps the last readings and reports itself', async () => {
  const { gladys, service, sibelga } = await createApp();
  sibelga.state.apiStatus = 500;
  await service.refreshConsumption();
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.de, /nicht erreichbar/);
  assert.equal(service.meters.size, 1, 'the readings in memory are kept');
});

test('disabling the grid status removes its device and stops reading the page', async () => {
  const { gladys, sibelga } = await createApp({
    config: { email: EMAIL, password: 'correct horse', network_status_enabled: false },
  });
  assert.deepEqual(
    gladys.fake.discoveredDevices.map((device) => device.external_id),
    [METER],
  );
  assert.ok(!sibelga.calls.some(({ url }) => url.includes('www.sibelga.be')));
});

test('the grid counters follow the watched municipalities', async () => {
  const sibelga = createFakeSibelga({ outages: [OUTAGE_A, OUTAGE_B] });
  const { gladys } = await createApp({
    config: { municipalities: ['ixelles', 'uccle'] },
    sibelga,
  });
  assert.equal(gladys.fake.lastState(`${GRID}:outages`), 2);
  assert.equal(gladys.fake.lastState(`${GRID}:outages-watched`), 1);
});

test('a scan request reads Sibelga when nothing is known yet', async () => {
  const sibelga = createFakeSibelga({ apiStatus: 500 });
  const { gladys } = await createApp({ sibelga });
  assert.equal(gladys.fake.discoveredDevices.length, 1, 'only the grid device');
  sibelga.state.apiStatus = 200;
  await gladys.fake.scanRequest();
  assert.equal(gladys.fake.discoveredDevices.length, 2);
});

test('the store remembers what was announced, without any credential', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sibelga-'));
  try {
    const store = new Store(directory);
    await store.load();
    assert.equal(store.knownOutages(), null);
    await store.setLastDate('5414', '2026-11-11');
    await store.setKnownOutages([
      { id: 'a', title: 'Ixelles', url: 'https://x', municipalities: [], extra: 'dropped' },
    ]);

    const reloaded = new Store(directory);
    await reloaded.load();
    assert.equal(reloaded.lastDate('5414'), '2026-11-11');
    assert.deepEqual(reloaded.knownOutages(), [
      { id: 'a', title: 'Ixelles', url: 'https://x', municipalities: [] },
    ]);
    assert.deepEqual(
      Object.keys(JSON.parse(await readFile(join(directory, 'state.json'), 'utf8'))),
      ['lastDates', 'outages'],
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
