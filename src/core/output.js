'use strict';

const fs = require('node:fs');
const path = require('node:path');

function writeJson(file, events) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    JSON.stringify({ generated_at: new Date().toISOString(), count: events.length, events }, null, 2)
  );
}

const CSV_COLUMNS = ['source', 'uid', 'title', 'category', 'starts_at', 'ends_at', 'location', 'organizer', 'url', 'tags'];

function toCsv(events) {
  const escape = (value) => {
    const s = Array.isArray(value) ? value.join(';') : value ?? '';
    return /[",\n]/.test(String(s)) ? `"${String(s).replace(/"/g, '""')}"` : String(s);
  };
  return [CSV_COLUMNS.join(','), ...events.map((e) => CSV_COLUMNS.map((c) => escape(e[c])).join(','))].join('\n');
}

function writeCsv(file, events) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, toCsv(events));
}

/**
 * POST scraped items to any HTTP endpoint.
 * - mode "batch" (default): one request with { events: [...] }.
 * - mode "individual": one request per item (e.g. an API that takes a single
 *   object plus an auth header, like TechPulse's POST /api/events).
 */
async function postWebhook(url, events, { headers = {}, mode = 'batch', batchKey = 'events' } = {}) {
  if (mode === 'individual') {
    const statuses = [];
    for (const event of events) {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(event),
        signal: AbortSignal.timeout(20000),
      });
      statuses.push(res.status);
    }
    return statuses;
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ [batchKey]: events }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Webhook ${url} responded ${res.status}`);
  return res.status;
}

/** Dispatch an item list to whatever outputs a source declares. */
async function emitOutput(output, events) {
  if (!output) return;
  const targets = Array.isArray(output) ? output : [output];
  for (const target of targets) {
    if (target.file) writeJson(target.file, events);
    if (target.csv) writeCsv(target.csv, events);
    if (target.webhook) {
      const w = typeof target.webhook === 'string' ? { url: target.webhook } : target.webhook;
      await postWebhook(w.url, events, { headers: w.headers, mode: w.mode, batchKey: w.batchKey });
    }
  }
}

module.exports = { writeJson, writeCsv, toCsv, postWebhook, emitOutput, CSV_COLUMNS };
