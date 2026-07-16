'use strict';

// Generic JSON source: fetch any JSON endpoint, locate the items array, and map
// its fields to the normalized shape. Covers APIs like Devpost without code.

function getPath(obj, dotted) {
  return String(dotted)
    .split('.')
    .reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

function mapItem(item, map) {
  if (!map || Object.keys(map).length === 0) return item;
  const out = {};
  for (const [key, spec] of Object.entries(map)) {
    if (spec && typeof spec === 'object') {
      if ('const' in spec) out[key] = spec.const;
      else if (spec.path) out[key] = getPath(item, spec.path);
    } else if (typeof spec === 'string') {
      out[key] = getPath(item, spec);
    }
  }
  return out;
}

async function collectJson(source, { fetchJson, fetchBrowserJson }) {
  const data = source.fetch === 'browser' ? await fetchBrowserJson(source.url) : await fetchJson(source.url);
  const items = source.items
    ? getPath(data, source.items)
    : Array.isArray(data)
      ? data
      : data.events || data.items || [];
  if (!Array.isArray(items)) return [];
  return items.map((item) => mapItem(item, source.map));
}

module.exports = { collectJson, mapItem, getPath };
