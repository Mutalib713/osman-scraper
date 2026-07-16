'use strict';

const fs = require('node:fs');
const path = require('node:path');

// Dedupe state is a small JSON file: { [sourceName]: { [uid]: hash } }.
// It lets the scraper report only what's new or changed since the last run.

function loadState(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

function saveState(file, state) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(state, null, 2));
}

/**
 * Compare a source's freshly scraped items against the remembered state.
 * Returns { added, updated, unchanged } and updates `state` in place so the
 * caller can persist it after the run.
 */
function reconcile(state, source, events) {
  const prev = state[source] || {};
  const next = {};
  const added = [];
  const updated = [];
  const unchanged = [];
  for (const event of events) {
    next[event.uid] = event.hash;
    if (!(event.uid in prev)) added.push(event);
    else if (prev[event.uid] !== event.hash) updated.push(event);
    else unchanged.push(event);
  }
  state[source] = next;
  return { added, updated, unchanged };
}

module.exports = { loadState, saveState, reconcile };
