'use strict';

const { fetchStatic, fetchBrowser } = require('./core/fetch');
const { jsonFromHtml } = require('./core/extract');
const { normalizeEvent, isValid } = require('./core/normalize');
const { loadState, saveState, reconcile } = require('./core/dedupe');
const { emitOutput } = require('./core/output');
const { collectJson } = require('./engines/json');
const { collectHtml } = require('./engines/html');
const adapters = require('./adapters');

function fetchers(defaults = {}) {
  const base = {
    minDelayMs: defaults.min_delay_ms ?? 1000,
    respectRobots: defaults.respect_robots !== false,
    ua: defaults.user_agent,
    executablePath: defaults.browser_executable || process.env.OSMAN_BROWSER_EXECUTABLE,
  };
  const staticFetch = (url, o) => fetchStatic(url, { ...base, ...o });
  const browserFetch = (url, o) => fetchBrowser(url, { ...base, ...o });
  return {
    fetchStatic: staticFetch,
    fetchBrowser: browserFetch,
    fetchJson: async (url, o) => JSON.parse(await staticFetch(url, { headers: { accept: 'application/json' }, ...o })),
    fetchBrowserJson: async (url, o) => jsonFromHtml(await browserFetch(url, o)),
  };
}

/**
 * Run a single source end to end: collect → normalize → dedupe → emit.
 * `ctx.state` is mutated for dedupe; `ctx.collect`, if given, receives the
 * current events (used by `serve`).
 */
async function runSource(source, ctx = {}) {
  const { state = {}, defaults, now = Date.now(), collect } = ctx;
  const f = fetchers(defaults);

  let raw = [];
  let defaultCategory = source.default_category || '';
  if (source.adapter) {
    const adapter = adapters[source.adapter];
    if (!adapter) throw new Error(`Unknown adapter: ${source.adapter} (known: ${Object.keys(adapters).join(', ') || 'none'})`);
    defaultCategory = defaultCategory || adapter.defaultCategory || '';
    raw = await adapter.collect({ ...f, config: source.config || {}, now });
  } else if (source.type === 'json') {
    raw = await collectJson(source, f);
  } else if (source.type === 'html') {
    raw = await collectHtml(source, f);
  } else {
    throw new Error(`Source "${source.name}" needs an "adapter" or a "type" of json|html`);
  }

  const events = raw
    .map((item) => normalizeEvent(item, { source: source.name, defaultCategory }))
    .filter(isValid);

  const result = reconcile(state, source.name, events);
  const emit = source.emit === 'new' ? [...result.added, ...result.updated] : events;
  await emitOutput(source.output, emit);
  if (Array.isArray(collect)) collect.push(...events);

  return {
    source: source.name,
    total: events.length,
    added: result.added.length,
    updated: result.updated.length,
    emitted: emit.length,
    events,
  };
}

/** Run every source in a config (optionally just one by name). */
async function runConfig(config, { only, log = () => {}, now } = {}) {
  const stateFile = config.state_file || './.osman/state.json';
  const state = loadState(stateFile);
  const sources = config.sources.filter((s) => !only || s.name === only);
  const results = [];
  for (const source of sources) {
    try {
      log(`syncing ${source.name}`);
      const r = await runSource(source, { state, defaults: config.defaults, now });
      results.push({ source: r.source, total: r.total, added: r.added, updated: r.updated, emitted: r.emitted, ok: true });
    } catch (err) {
      results.push({ source: source.name, ok: false, error: err.message });
    }
  }
  saveState(stateFile, state);
  return { sources: results };
}

module.exports = { runSource, runConfig, fetchers };
