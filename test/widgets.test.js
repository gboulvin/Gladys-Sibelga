// -----------------------------------------------------------------------------
// Dashboard widgets: the contents fit the vocabulary and the budget of Gladys
// (`validateWidgetContent` returns [] when a content renders exactly as sent).
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { WIDGET_KEYS } from '../src/service.js';
import { WIDGETS } from '../src/widgets.js';
import { OUTAGE_A, OUTAGE_B, createApp, createFakeSibelga, sdp, volumes } from './helpers.js';

const METER = 'ext:test-integration:meter:541449000000000011';
const request = (settings = {}, language = 'fr') => ({ settings, language, units: 'metric' });

async function content(gladys, key, settings, language) {
  const ack = await gladys.fake.widgetGet(key, request(settings, language));
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(validateWidgetContent(ack.data.content), [], `widget "${key}"`);
  return ack.data.content;
}

const byType = (data, type) => data.components.filter((component) => component.type === type);

test('the service nudges every widget the code serves', () => {
  assert.deepEqual([...WIDGET_KEYS].sort(), Object.keys(WIDGETS).sort());
});

test('the consumption widget shows live tiles, the average and the daily chart', async () => {
  const { gladys } = await createApp();
  const data = await content(gladys, 'consumption', { meter: METER, days: '30' });

  const tiles = byType(data, 'value');
  assert.deepEqual(
    tiles.map((tile) => tile.device_feature ?? tile.value),
    [`${METER}:last-day`, `${METER}:last-month`, 6.9],
  );
  // Live tiles are bound to features the device really publishes.
  const published = gladys.fake.discoveredDevices.flatMap((d) =>
    d.features.map((f) => f.external_id),
  );
  for (const tile of tiles.filter((t) => t.device_feature)) {
    assert.ok(published.includes(tile.device_feature));
  }

  const [chart] = byType(data, 'chart');
  assert.equal(chart.chart_type, 'bar');
  assert.deepEqual(chart.series[0].points, [
    { t: '2026-11-09T23:00:00.000Z', v: 6.2 },
    { t: '2026-11-10T23:00:00.000Z', v: 7.5 },
  ]);
  const [status] = byType(data, 'status');
  assert.deepEqual(
    status.items.map((item) => item.value.fr ?? item.value),
    ['Électricité', '541449000000000011', '11 nov. 2026'],
  );
});

test('the consumption widget limits the chart to the days asked for', async () => {
  const sibelga = createFakeSibelga();
  const days = {};
  for (let day = 1; day <= 11; day += 1) {
    days[`2026-11-${String(day).padStart(2, '0')}`] = { consumption: day, injection: 1 };
  }
  sibelga.state.sdps = [sdp({ direction: 'COMB' })];
  sibelga.state.volumes['sdp-1'] = volumes(days);
  const { gladys } = await createApp({ sibelga });
  const data = await content(gladys, 'consumption', { meter: METER, days: '7' }, 'de');
  const [chart] = byType(data, 'chart');
  assert.equal(chart.series.length, 2, 'a prosumer also sees the injection');
  assert.equal(chart.series[0].points.length, 7);
  assert.equal(chart.series[0].points.at(-1).v, 11);
});

test('a single meter needs no setting; several ask to pick one', async () => {
  const { gladys } = await createApp();
  assert.equal(byType(await content(gladys, 'consumption', {}), 'chart').length, 1);

  const sibelga = createFakeSibelga();
  sibelga.state.sdps = [sdp(), sdp({ id: 'gas', ean: '541449000000000028', division: 'GAS' })];
  const app = await createApp({ sibelga });
  const data = await content(app.gladys, 'consumption', {});
  assert.deepEqual(
    data.components.map((component) => component.type),
    ['text'],
  );
  assert.match(data.components[0].text.es, /contador/);
});

test('a meter without readings says so instead of drawing an empty chart', async () => {
  const sibelga = createFakeSibelga();
  sibelga.state.sdps = [sdp({ type: 'CLASSICAL' })];
  const { gladys } = await createApp({ sibelga });
  const data = await content(gladys, 'consumption', { meter: METER });
  assert.equal(byType(data, 'chart').length, 0);
  assert.equal(byType(data, 'text')[0].variant, 'caption');
});

test('the grid widget lists the outages, the watched municipalities first', async () => {
  const sibelga = createFakeSibelga({ outages: [OUTAGE_B, OUTAGE_A] });
  const { gladys } = await createApp({ config: { municipalities: ['ixelles'] }, sibelga });
  const data = await content(gladys, 'network_status', {}, 'en');

  const [list] = byType(data, 'card-list');
  assert.deepEqual(
    list.items.map((item) => [item.title, item.subtitle, item.badge.color]),
    [
      ['Power outages in Ixelles', 'Ixelles', 'danger'],
      ['Power outages in Anderlecht', 'Anderlecht', 'warning'],
    ],
  );
  assert.match(list.items[0].links[0].url, /^https:\/\/www\.sibelga\.be\//);
  const [status] = byType(data, 'status');
  assert.equal(status.items[0].value.en, 'Outage in progress');
  assert.equal(status.items[0].color, 'danger');
  assert.equal(byType(data, 'value').length, 2);
});

test('the grid widget tells a quiet grid from an unknown status', async () => {
  const { gladys, service, sibelga } = await createApp();
  let data = await content(gladys, 'network_status');
  assert.equal(byType(data, 'status')[0].items[0].color, 'success');
  assert.equal(byType(data, 'card-list').length, 0);

  sibelga.state.outagePageMode = 'blocked';
  await service.refreshNetwork();
  data = await content(gladys, 'network_status');
  assert.equal(byType(data, 'status')[0].items[0].color, 'warning');
  assert.match(byType(data, 'text')[0].text.fr, /anti-robot/);
});

test('the grid widget of a disabled status offers nothing to tap', async () => {
  const { gladys } = await createApp({ config: { network_status_enabled: false } });
  const data = await content(gladys, 'network_status');
  assert.deepEqual(
    data.components.map((component) => component.type),
    ['status'],
  );
});

test('the refresh button reads the page again and answers a toast', async () => {
  const { gladys, sibelga } = await createApp();
  const data = await content(gladys, 'network_status');
  const [button] = byType(data, 'button');
  sibelga.state.outages = [OUTAGE_A];
  const ack = await gladys.fake.widgetAction(
    'network_status',
    button.action.key,
    button.action.params,
    {
      settings: {},
    },
  );
  assert.equal(ack.success, true);
  assert.match(ack.data.message.fr, /1 panne\(s\) en cours/);
  assert.ok(gladys.fake.widgetRefreshes.includes('network_status'));

  const unknown = await gladys.fake.widgetAction('network_status', 'nope', {}, { settings: {} });
  assert.equal(unknown.success, false);
});
