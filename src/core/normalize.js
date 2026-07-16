'use strict';

const crypto = require('node:crypto');

// The fields that make up a normalized item and feed into its change-detection hash.
const FIELDS = ['title', 'category', 'description', 'organizer', 'location', 'url', 'starts_at', 'ends_at', 'tags'];

function toIso(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') {
    // Accept epoch seconds or milliseconds.
    const ms = value < 1e12 ? value * 1000 : value;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function cleanStr(value, max = 2000) {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

function cleanTags(value) {
  const arr = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : [];
  return [
    ...new Set(
      arr
        .filter((t) => typeof t === 'string')
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean)
    ),
  ].slice(0, 20);
}

/**
 * Turn a raw scraped item into the normalized shape every consumer receives.
 * A stable `uid` and a content `hash` are always attached so downstream dedupe
 * and change-tracking work regardless of the source.
 */
function normalizeEvent(raw = {}, { source = '', defaultCategory = '' } = {}) {
  const event = {
    source,
    uid: String(raw.uid ?? raw.id ?? raw.url ?? `${raw.title ?? ''}@${raw.starts_at ?? ''}`),
    title: cleanStr(raw.title, 200),
    category: cleanStr(raw.category, 40) || defaultCategory,
    description: cleanStr(raw.description, 2000),
    organizer: cleanStr(raw.organizer, 200),
    location: cleanStr(raw.location, 200) || 'Online',
    url: cleanStr(raw.url, 500),
    starts_at: toIso(raw.starts_at),
    ends_at: toIso(raw.ends_at),
    tags: cleanTags(raw.tags),
  };
  event.hash = hashEvent(event);
  return event;
}

function hashEvent(event) {
  const basis = FIELDS.map((f) => (Array.isArray(event[f]) ? event[f].join(',') : event[f] ?? '')).join('|');
  return crypto.createHash('sha1').update(basis).digest('hex');
}

// A usable item needs at least a title and a parseable start time.
function isValid(event) {
  return Boolean(event.title && event.starts_at);
}

module.exports = { normalizeEvent, hashEvent, toIso, cleanStr, cleanTags, isValid, FIELDS };
