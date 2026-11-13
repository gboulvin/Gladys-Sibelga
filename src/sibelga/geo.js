// -----------------------------------------------------------------------------
// Which Brussels municipality a home is in, from its coordinates.
//
// Computed here, from the outlines embedded in ./boundaries.js: the location
// of a home is sensitive, and it is never sent to Sibelga nor to any geocoding
// service.
// -----------------------------------------------------------------------------

import { BOUNDARIES } from './boundaries.js';

/** Ray casting: true when the point is inside the ring. */
function inRing(longitude, latitude, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (
      yi > latitude !== yj > latitude &&
      longitude < ((xj - xi) * (latitude - yi)) / (yj - yi) + xi
    ) {
      inside = !inside;
    }
  }
  return inside;
}

/** Inside the outline of a polygon, and in none of its holes. */
function inPolygon(longitude, latitude, [outline, ...holes]) {
  return (
    inRing(longitude, latitude, outline) && !holes.some((hole) => inRing(longitude, latitude, hole))
  );
}

/**
 * Key of the municipality (see MUNICIPALITIES) a position is in.
 * @returns {string|null} `null` outside the Brussels-Capital Region, or
 *   without valid coordinates
 */
export function municipalityAt(latitude, longitude) {
  if (
    latitude === null ||
    longitude === null ||
    !Number.isFinite(Number(latitude)) ||
    !Number.isFinite(Number(longitude))
  ) {
    return null;
  }
  const [lat, lon] = [Number(latitude), Number(longitude)];
  for (const [key, polygons] of Object.entries(BOUNDARIES)) {
    if (polygons.some((polygon) => inPolygon(lon, lat, polygon))) {
      return key;
    }
  }
  return null;
}

/**
 * Municipalities of the houses Gladys knows.
 * @param {{ latitude: number|null, longitude: number|null }[]} houses
 * @returns {string[]} keys, without duplicates; a house outside Brussels or
 *   without a location gives none
 */
export function municipalitiesOfHouses(houses) {
  const keys = (houses ?? []).map((house) => municipalityAt(house?.latitude, house?.longitude));
  return [...new Set(keys.filter(Boolean))];
}
