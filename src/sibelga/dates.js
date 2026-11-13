// -----------------------------------------------------------------------------
// Date helpers. Sibelga works in Brussels time: a "day" of consumption is a
// local day, whatever the timezone of the container.
// -----------------------------------------------------------------------------

import { TIMEZONE } from './constants.js';

const DAY_MS = 24 * 60 * 60 * 1000;

const localDateFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Local date in Brussels (`YYYY-MM-DD`) of an instant, `null` when invalid. */
export function localDate(instant) {
  const date = new Date(instant);
  return Number.isNaN(date.getTime()) ? null : localDateFormat.format(date);
}

/** The date `days` days before a `YYYY-MM-DD` date. */
export function shiftDate(date, days) {
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

const localHourFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIMEZONE,
  hour: '2-digit',
  hourCycle: 'h23',
});

/** Instant (Date) at which a local date starts in Brussels. */
export function startOfLocalDay(date) {
  // Brussels is UTC+1 in winter and UTC+2 in summer: one of the two is the
  // local midnight of that date.
  for (const offsetHours of [1, 2]) {
    const candidate = new Date(Date.parse(`${date}T00:00:00Z`) - offsetHours * 60 * 60 * 1000);
    if (localDate(candidate) === date && localHourFormat.format(candidate) === '00') {
      return candidate;
    }
  }
  return new Date(`${date}T00:00:00Z`);
}

/** Last millisecond of a local date in Brussels. */
export function endOfLocalDay(date) {
  return new Date(startOfLocalDay(shiftDate(date, 1)).getTime() - 1);
}

/** Round to the Wh, the precision of the readings. */
export function roundKwh(value) {
  return Math.round(Number(value) * 1000) / 1000;
}
