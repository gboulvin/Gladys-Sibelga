// -----------------------------------------------------------------------------
// Dashboard widgets (manifest `widgets` field, Gladys 5.1+).
//
// The content is DECLARATIVE (`text`, `value`, `chart`, `status`, `card-list`,
// `button`...): Gladys renders it with its own theme and picks the language of
// each multi-language text. No HTML here.
//
// Each entry of WIDGETS is keyed by the widget `key` and exposes:
//   - get(gladys, service, { settings }): the content;
//   - action(gladys, service, { actionKey }) (optional): a tapped button.
// The contents are built from the data the service keeps in memory: a widget
// never calls Sibelga by itself, the service nudges Gladys after each read.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS, createLogger } from '@gladysassistant/integration-sdk';
import { networkMessage } from './actions.js';
import { LANGUAGES, t } from './i18n.js';
import { ENERGY } from './sibelga/api.js';
import { roundKwh, startOfLocalDay } from './sibelga/dates.js';
import { FEATURE, lastDay, meterIds } from './devices/meter.js';
import {
  NETWORK_FEATURE,
  NETWORK_STATE,
  isWatched,
  networkIds,
  watchedOutages,
} from './devices/network.js';
import { MUNICIPALITIES } from './sibelga/constants.js';

const logger = createLogger({ name: 'widgets' });

export const CONSUMPTION_WIDGET = 'consumption';
export const NETWORK_WIDGET = 'network_status';

const ACTION_REFRESH = 'refresh';
const DEFAULT_CHART_DAYS = 30;
const UNIT = 'kWh';
// The data changes a few times a day at most, and the service nudges Gladys
// when it does: the TTL is only a safety net.
const TTL_SECONDS = 1800;

const emptyState = (key) => ({
  ttl_seconds: 300,
  components: [{ type: 'text', variant: 'body', text: t(key) }],
});

const MUNICIPALITY_NAME = Object.fromEntries(
  MUNICIPALITIES.map(({ key, names }) => [key, names[0]]),
);

const locale = (language) => (LANGUAGES.includes(language) ? language : 'en');

/** A date as the user of the dashboard reads it. */
function formatDate(date, language) {
  return new Intl.DateTimeFormat(locale(language), {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(new Date(`${date}T12:00:00Z`));
}

function formatTime(instant, language) {
  return new Intl.DateTimeFormat(locale(language), {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Europe/Brussels',
  }).format(new Date(instant));
}

function consumptionContent(gladys, service, { settings, language }) {
  // A dashboard with a single meter needs no setting.
  const entry =
    service.findMeter(settings?.meter) ??
    (service.meters.size === 1 ? [...service.meters.values()][0] : undefined);
  if (!entry) {
    return emptyState('widget.no_meter');
  }
  const { meter } = entry;
  const ids = meterIds(gladys, meter);
  const chartDays = Number(settings?.days) || DEFAULT_CHART_DAYS;
  const days = entry.days.filter((day) => day.consumption !== null).slice(-chartDays);
  const last = lastDay(entry);
  const icon = meter.energy === ENERGY.GAS ? 'thermometer' : 'zap';

  const components = [
    // Device-bound tiles: live, they follow the published states.
    {
      type: 'value',
      label: t('widget.last_day'),
      icon,
      device_feature: ids.feature(FEATURE.LAST_DAY),
    },
    {
      type: 'value',
      label: t('widget.last_month'),
      icon: 'calendar',
      device_feature: ids.feature(FEATURE.LAST_MONTH),
    },
  ];
  if (days.length > 0) {
    const total = days.reduce((sum, day) => sum + day.consumption, 0);
    components.push({
      type: 'value',
      label: t('widget.average'),
      icon: 'bar-chart-2',
      value: Math.round((total / days.length) * 10) / 10,
      unit: UNIT,
    });
    const point = (day, value) => ({ t: startOfLocalDay(day.date).toISOString(), v: value });
    const series = [
      { name: t('widget.consumption'), points: days.map((day) => point(day, day.consumption)) },
    ];
    if (meter.injects) {
      series.push({
        name: t('widget.injection'),
        points: days.map((day) => point(day, roundKwh(day.injection ?? 0))),
      });
    }
    components.push({
      type: 'chart',
      chart_type: 'bar',
      title: t('widget.chart_title'),
      unit: UNIT,
      series,
    });
  } else {
    components.push({ type: 'text', variant: 'caption', text: t('widget.no_data') });
  }
  components.push({
    type: 'status',
    items: [
      {
        label: t('widget.meter'),
        icon: 'hash',
        value: t(`energy.${meter.energy}`),
        color: WIDGET_COLORS.NEUTRAL,
      },
      { label: 'EAN', icon: 'credit-card', value: meter.ean, color: WIDGET_COLORS.NEUTRAL },
      ...(last
        ? [
            {
              label: t('widget.last_reading'),
              icon: 'clock',
              value: formatDate(last.date, language),
              color: WIDGET_COLORS.INFO,
            },
          ]
        : []),
    ],
  });
  return { ttl_seconds: TTL_SECONDS, components };
}

function networkStateRow(network) {
  if (network.state === NETWORK_STATE.DISABLED) {
    return { value: t('widget.network.disabled'), color: WIDGET_COLORS.NEUTRAL };
  }
  if (network.state !== NETWORK_STATE.OK) {
    return { value: t('widget.network.unknown'), color: WIDGET_COLORS.WARNING };
  }
  if (watchedOutages(network).length > 0) {
    return { value: t('widget.network.outage'), color: WIDGET_COLORS.DANGER };
  }
  if (network.outages.length > 0) {
    return { value: t('widget.network.elsewhere'), color: WIDGET_COLORS.INFO };
  }
  return { value: t('widget.network.ok'), color: WIDGET_COLORS.SUCCESS };
}

/** Names of the watched municipalities, cut to the 40 characters of a row. */
function followedMunicipalities(network) {
  if (network.watched.length === 0) {
    return t('widget.network.all');
  }
  const names = network.watched.map((key) => MUNICIPALITY_NAME[key]).join(', ');
  return names.length > 40 ? `${names.slice(0, 39)}…` : names;
}

function networkContent(gladys, service, { language }) {
  const { network } = service;
  const ids = networkIds(gladys);
  const components = [];
  if (network.state !== NETWORK_STATE.DISABLED) {
    components.push(
      {
        type: 'value',
        label: t('widget.network.watched'),
        icon: 'home',
        device_feature: ids.feature(NETWORK_FEATURE.OUTAGES_WATCHED),
      },
      {
        type: 'value',
        label: t('widget.network.total'),
        icon: 'map',
        device_feature: ids.feature(NETWORK_FEATURE.OUTAGES),
      },
    );
  }
  const problem = service.networkProblem();
  if (problem) {
    components.push({ type: 'text', variant: 'body', text: problem });
  }
  if (network.outages.length > 0) {
    // The outages of the watched municipalities first; the list holds 8 rows.
    const sorted = [...network.outages].sort(
      (a, b) => isWatched(b, network.watched) - isWatched(a, network.watched),
    );
    components.push({
      type: 'card-list',
      display: 'list',
      items: sorted.slice(0, 8).map((outage) => ({
        title: (outage.title || outage.id).slice(0, 60),
        subtitle: outage.municipalities.map((key) => MUNICIPALITY_NAME[key]).join(', '),
        badge: {
          text: t('widget.network.badge'),
          color: isWatched(outage, network.watched) ? WIDGET_COLORS.DANGER : WIDGET_COLORS.WARNING,
        },
        links: [{ url: outage.url, label: t('widget.network.link') }],
      })),
    });
  }
  components.push({
    type: 'status',
    items: [
      { label: t('widget.network.state'), icon: 'activity', ...networkStateRow(network) },
      ...(network.state !== NETWORK_STATE.DISABLED
        ? [
            {
              label: t('widget.network.followed'),
              icon: 'map-pin',
              value: followedMunicipalities(network),
              color: WIDGET_COLORS.NEUTRAL,
            },
          ]
        : []),
      ...(network.checkedAt
        ? [
            {
              label: t('widget.network.checked'),
              icon: 'clock',
              value: formatTime(network.checkedAt, language),
              color: WIDGET_COLORS.NEUTRAL,
            },
          ]
        : []),
    ],
  });
  if (network.state !== NETWORK_STATE.DISABLED) {
    components.push({
      type: 'button',
      label: t('widget.refresh'),
      icon: 'refresh-cw',
      style: 'secondary',
      action: { key: ACTION_REFRESH },
    });
  }
  return { ttl_seconds: TTL_SECONDS, components };
}

export const WIDGETS = {
  [CONSUMPTION_WIDGET]: {
    async get(gladys, service, request) {
      logger.debug(`onWidgetGet <- ${CONSUMPTION_WIDGET}`);
      return consumptionContent(gladys, service, request);
    },
  },

  [NETWORK_WIDGET]: {
    async get(gladys, service, request) {
      logger.debug(`onWidgetGet <- ${NETWORK_WIDGET}`);
      return networkContent(gladys, service, request);
    },

    // Resolves the toast shown to the user. After a successful action Gladys
    // drops the cached content and every open dashboard refetches it.
    async action(_gladys, service, { actionKey }) {
      logger.info(`onWidgetAction <- ${NETWORK_WIDGET}.${actionKey}`);
      if (actionKey === ACTION_REFRESH) {
        await service.refreshNetwork();
        return networkMessage(service);
      }
      throw new Error(`Unknown widget action: ${actionKey}`);
    },
  },
};
