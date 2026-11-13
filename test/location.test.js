// -----------------------------------------------------------------------------
// The home location Gladys exposes (manifest `location: true`): it selects the
// municipalities whose outages concern the user, on top of the configured ones.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GladysApiError } from '@gladysassistant/integration-sdk';
import { BOUNDARIES } from '../src/sibelga/boundaries.js';
import { MUNICIPALITIES } from '../src/sibelga/constants.js';
import { municipalitiesOfHouses, municipalityAt } from '../src/sibelga/geo.js';
import {
  HOME_IXELLES,
  HOME_LEUVEN,
  HOME_UNLOCATED,
  OUTAGE_A,
  OUTAGE_B,
  createApp,
  createFakeSibelga,
} from './helpers.js';

const GRID = 'ext:test-integration:network:brussels';
const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);

test('the manifest asks for the house location, shown on the install screen', () => {
  assert.equal(manifest.location, true);
});

test('every municipality has an outline, and only they do', () => {
  assert.deepEqual(Object.keys(BOUNDARIES).sort(), MUNICIPALITIES.map(({ key }) => key).sort());
  for (const [key, polygons] of Object.entries(BOUNDARIES)) {
    for (const [outline] of polygons) {
      assert.ok(outline.length >= 4, `${key}: an outline is a closed ring`);
      assert.deepEqual(outline[0], outline.at(-1), `${key}: closed ring`);
    }
  }
});

test('a position is located in its municipality', () => {
  const places = [
    ['Grand-Place', 50.8467, 4.3525, 'bruxelles'],
    ['Atomium (Laeken)', 50.8949, 4.3415, 'bruxelles'],
    ['Place Flagey', 50.8275, 4.3722, 'ixelles'],
    ['Parvis de Saint-Gilles', 50.8296, 4.3447, 'saint-gilles'],
    ['Uccle', 50.801, 4.337, 'uccle'],
    ['Anderlecht', 50.8366, 4.308, 'anderlecht'],
    ['Woluwe-Saint-Lambert', 50.8437, 4.436, 'woluwe-saint-lambert'],
    ['Leuven', 50.8798, 4.7005, null],
    ['Zaventem', 50.901, 4.484, null],
  ];
  for (const [name, latitude, longitude, expected] of places) {
    assert.equal(municipalityAt(latitude, longitude), expected, name);
  }
});

test('missing or invalid coordinates locate nothing', () => {
  assert.equal(municipalityAt(null, null), null);
  assert.equal(municipalityAt(undefined, 4.35), null);
  assert.equal(municipalityAt('north', 'east'), null);
  assert.equal(municipalityAt('50.8467', '4.3525'), 'bruxelles', 'numbers typed as strings');
  assert.deepEqual(municipalitiesOfHouses(undefined), []);
  assert.deepEqual(
    municipalitiesOfHouses([HOME_IXELLES, HOME_LEUVEN, HOME_UNLOCATED, HOME_IXELLES, null]),
    ['ixelles'],
  );
});

test('the municipality of the home is followed without any configuration', async () => {
  const sibelga = createFakeSibelga({ outages: [OUTAGE_A, OUTAGE_B] });
  const { gladys, service } = await createApp({ houses: [HOME_IXELLES], sibelga });
  assert.deepEqual(service.network.watched, ['ixelles']);
  assert.equal(gladys.fake.lastState(`${GRID}:outages`), 2);
  assert.equal(gladys.fake.lastState(`${GRID}:outages-watched`), 1);
});

test('the configured municipalities are added to the one of the home', async () => {
  const sibelga = createFakeSibelga({ outages: [OUTAGE_A, OUTAGE_B] });
  const { gladys, service } = await createApp({
    config: { municipalities: ['anderlecht', 'ixelles'] },
    houses: [HOME_IXELLES],
    sibelga,
  });
  assert.deepEqual(service.network.watched, ['ixelles', 'anderlecht']);
  assert.equal(gladys.fake.lastState(`${GRID}:outages-watched`), 2);
});

test('the home location can be turned off', async () => {
  const sibelga = createFakeSibelga({ outages: [OUTAGE_A, OUTAGE_B] });
  const { gladys, service } = await createApp({
    config: { use_home_location: false, municipalities: ['anderlecht'] },
    houses: [HOME_IXELLES],
    sibelga,
  });
  assert.deepEqual(service.network.watched, ['anderlecht']);
  assert.equal(gladys.fake.lastState(`${GRID}:outages-watched`), 1);

  // Turning it back on applies at once, without reconnecting.
  await gladys.fake.configUpdated({ use_home_location: true, municipalities: ['anderlecht'] });
  service.stop();
  assert.deepEqual(service.network.watched, ['ixelles', 'anderlecht']);
});

test('a home outside Brussels or without a location follows the whole region', async () => {
  const sibelga = createFakeSibelga({ outages: [OUTAGE_A, OUTAGE_B] });
  const { gladys, service } = await createApp({ houses: [HOME_LEUVEN, HOME_UNLOCATED], sibelga });
  assert.deepEqual(service.network.watched, []);
  assert.equal(gladys.fake.lastState(`${GRID}:outages-watched`), 2);
});

test('the scene events use the municipality of the home', async () => {
  const { gladys, service, sibelga } = await createApp({ houses: [HOME_IXELLES] });
  sibelga.state.outages = [OUTAGE_A, OUTAGE_B];
  await service.refreshNetwork();
  assert.deepEqual(
    gladys.fake.sceneEvents.map(({ data }) => [data.municipalities, data.scope, data.count]),
    [
      ['ixelles', 'watched', 1],
      ['anderlecht', 'other', 1],
    ],
  );
});

test('a Gladys that refuses the houses leaves the configured choice in place', async (t) => {
  const app = await createApp({ config: { municipalities: ['uccle'] }, connect: false });
  t.mock.method(app.gladys, 'getHouses', async () => {
    throw new GladysApiError(403, 'FORBIDDEN', 'location permission required');
  });
  await app.gladys.connect();
  app.service.stop();
  assert.deepEqual(app.service.network.watched, ['uccle']);
  assert.equal(app.gladys.fake.lastState(`${GRID}:outages`), 0, 'the grid status is still read');
});

test('the coordinates of the home never leave the integration', async () => {
  const sibelga = createFakeSibelga({ outages: [OUTAGE_A] });
  const { gladys, service } = await createApp({ houses: [HOME_IXELLES], sibelga });
  await service.refreshAll();
  const sentToSibelga = JSON.stringify(sibelga.calls);
  const sentToGladys = JSON.stringify([
    gladys.fake.states,
    gladys.fake.sceneEvents,
    gladys.fake.discoveredDevices,
  ]);
  for (const coordinate of ['50.8275', '4.3722']) {
    assert.ok(!sentToSibelga.includes(coordinate));
    assert.ok(!sentToGladys.includes(coordinate));
  }
});

test('the grid widget names the municipalities followed', async () => {
  const followed = async (app) => {
    const { data } = await app.gladys.fake.widgetGet('network_status', { language: 'fr' });
    const status = data.content.components.find((component) => component.type === 'status');
    return status.items.find((item) => item.icon === 'map-pin').value;
  };
  assert.equal(await followed(await createApp({ houses: [HOME_IXELLES] })), 'Ixelles');
  assert.equal((await followed(await createApp())).fr, 'Tout Bruxelles');
  const many = await followed(
    await createApp({ config: { municipalities: MUNICIPALITIES.map(({ key }) => key) } }),
  );
  assert.ok(many.length <= 40 && many.endsWith('…'));
});
