// -----------------------------------------------------------------------------
// Scene triggers (fired by the service) and scene actions.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { OUTAGE_A, OUTAGE_B, createApp, createFakeSibelga, volumes } from './helpers.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const METER = 'ext:test-integration:meter:541449000000000011';

const declaredKeys = (list, key, ...groups) =>
  groups.flatMap((group) => (list.find((item) => item.key === key)[group] ?? []).map((f) => f.key));

/** Outputs a scene action resolved, as Gladys receives them. */
async function run(gladys, key, fields = {}) {
  const ack = await gladys.fake.sceneAction(key, fields);
  assert.equal(ack.success, true, ack.error);
  return ack.data.outputs;
}

const eventsOf = (gladys, key) =>
  gladys.fake.sceneEvents.filter((event) => event.key === key).map((event) => event.data);

test('the first read announces nothing: it only records what is already there', async () => {
  const sibelga = createFakeSibelga({ outages: [OUTAGE_A] });
  const { gladys } = await createApp({ sibelga });
  assert.deepEqual(gladys.fake.sceneEvents, []);
});

test('an outage fires one event when it starts and one when it is resolved', async () => {
  const { gladys, service, sibelga } = await createApp({
    config: { municipalities: ['ixelles'] },
  });
  sibelga.state.outages = [OUTAGE_A, OUTAGE_B];
  await service.refreshNetwork();
  assert.deepEqual(eventsOf(gladys, 'outage_started'), [
    {
      scope: 'watched',
      id: OUTAGE_A.id,
      title: 'Power outages in Ixelles',
      municipalities: 'ixelles',
      url: `https://www.sibelga.be/en/outages-streetworks/power-outages/actual-power-outages/current-power-cut/${OUTAGE_A.id}`,
      count: 1,
    },
    {
      scope: 'other',
      id: OUTAGE_B.id,
      title: 'Power outages in Anderlecht',
      municipalities: 'anderlecht',
      url: `https://www.sibelga.be/en/outages-streetworks/power-outages/actual-power-outages/current-power-cut/${OUTAGE_B.id}`,
      count: 1,
    },
  ]);

  // Still there at the next read: no second event.
  await service.refreshNetwork();
  assert.equal(eventsOf(gladys, 'outage_started').length, 2);

  sibelga.state.outages = [OUTAGE_B];
  await service.refreshNetwork();
  const resolved = eventsOf(gladys, 'outage_resolved');
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].id, OUTAGE_A.id);
  assert.equal(resolved[0].scope, 'watched');
  assert.equal(resolved[0].count, 0);
});

test('an unreadable page resolves nothing', async () => {
  const sibelga = createFakeSibelga({ outages: [OUTAGE_A] });
  const { gladys, service } = await createApp({ sibelga });
  sibelga.state.outagePageMode = 'blocked';
  await service.refreshNetwork();
  sibelga.state.outagePageMode = 'ok';
  await service.refreshNetwork();
  assert.deepEqual(gladys.fake.sceneEvents, []);
});

test('a new day of readings fires consumption_updated once', async () => {
  const { gladys, service, sibelga, setNow } = await createApp();
  await service.refreshConsumption();
  assert.deepEqual(eventsOf(gladys, 'consumption_updated'), [], 'same day: nothing new');

  setNow('2026-11-13T08:00:00Z');
  sibelga.state.volumes['sdp-1'] = volumes({
    '2026-11-11': { consumption: 7.5 },
    '2026-11-12': { consumption: 9.25 },
  });
  await service.refreshConsumption();
  await service.refreshConsumption();
  assert.deepEqual(eventsOf(gladys, 'consumption_updated'), [
    {
      meter: METER,
      energy: 'electricity',
      name: 'Home',
      ean: '541449000000000011',
      date: '2026-11-12',
      consumption: 9.25,
      injection: 0,
    },
  ]);
});

test('the events only carry keys the manifest declares', async () => {
  const { gladys, service, sibelga, setNow } = await createApp();
  sibelga.state.outages = [OUTAGE_A];
  await service.refreshNetwork();
  sibelga.state.outages = [];
  await service.refreshNetwork();
  setNow('2026-11-13T08:00:00Z');
  sibelga.state.volumes['sdp-1'] = volumes({ '2026-11-12': { consumption: 1 } });
  await service.refreshConsumption();

  const fired = new Set(gladys.fake.sceneEvents.map((event) => event.key));
  assert.deepEqual([...fired].sort(), ['consumption_updated', 'outage_resolved', 'outage_started']);
  for (const { key, data } of gladys.fake.sceneEvents) {
    const declared = declaredKeys(manifest.scene_triggers, key, 'fields', 'variables');
    assert.deepEqual(Object.keys(data).sort(), [...declared].sort(), `event "${key}"`);
  }
});

test('the scope filter of the outage triggers offers the values the code sends', () => {
  for (const trigger of manifest.scene_triggers.filter((t) => t.key.startsWith('outage_'))) {
    const scope = trigger.fields.find((field) => field.key === 'scope');
    assert.deepEqual(
      scope.options.map((option) => option.value),
      ['watched', 'other'],
    );
  }
});

test('get_consumption adds up the readings of a period', async () => {
  const { gladys } = await createApp();
  assert.deepEqual(await run(gladys, 'get_consumption', { meter: METER, period: 'last_day' }), {
    available: true,
    consumption: 7.5,
    injection: 0,
    date: '2026-11-11',
    days: 1,
  });
  const week = await run(gladys, 'get_consumption', { meter: METER, period: 'last_7_days' });
  assert.deepEqual(week, {
    available: true,
    consumption: 13.7,
    injection: 0,
    date: '2026-11-11',
    days: 2,
  });
});

test('get_consumption on an unknown meter is an output, not a failure', async () => {
  const { gladys } = await createApp();
  const outputs = await run(gladys, 'get_consumption', {
    meter: 'ext:test-integration:network:brussels',
    period: 'last_day',
  });
  assert.deepEqual(outputs, { available: false, consumption: 0, injection: 0, date: '', days: 0 });
});

test('get_network_status answers from memory', async () => {
  const sibelga = createFakeSibelga({ outages: [OUTAGE_A, OUTAGE_B] });
  const { gladys } = await createApp({ config: { municipalities: ['anderlecht'] }, sibelga });
  const requests = sibelga.calls.length;
  const outputs = await run(gladys, 'get_network_status');
  assert.deepEqual(outputs, {
    known: true,
    outages: 2,
    outages_watched: 1,
    affected: true,
    summary: 'Power outages in Anderlecht',
  });
  assert.equal(sibelga.calls.length, requests, 'no request to Sibelga');
});

test('refresh reads both sources and tells whether everything was read', async () => {
  const { gladys, sibelga } = await createApp();
  sibelga.state.outages = [OUTAGE_A];
  assert.deepEqual(await run(gladys, 'refresh'), {
    success: true,
    meters: 1,
    outages: 1,
  });
  sibelga.state.outagePageMode = 'blocked';
  assert.equal((await run(gladys, 'refresh')).success, false);
});

test('the action outputs only carry keys the manifest declares', async () => {
  const { gladys } = await createApp();
  const fields = { meter: METER, period: 'last_day' };
  for (const action of manifest.scene_actions) {
    const data = await run(gladys, action.key, fields);
    assert.deepEqual(
      Object.keys(data).sort(),
      action.outputs.map((output) => output.key).sort(),
      `action "${action.key}"`,
    );
  }
});
