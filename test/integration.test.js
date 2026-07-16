'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const { runSource, runConfig } = require('../src/run');
const { loadState } = require('../src/core/dedupe');
const politeness = require('../src/core/politeness');
const fixtures = require('./fixtures');

let fx;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'osman-'));
const localDefaults = { min_delay_ms: 0, respect_robots: false };

test.before(async () => {
  fx = await fixtures.start();
});

test.after(() => {
  fx.server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  politeness._reset();
});

test('ctftime adapter maps API results and drops past events', async () => {
  const state = {};
  const r = await runSource(
    { name: 'ctftime', adapter: 'ctftime', config: { baseUrl: `${fx.base}/api/ctftime`, days: 30 } },
    { state, defaults: localDefaults }
  );
  assert.equal(r.total, 1); // the past event is outside the API's start/finish window
  const ev = r.events[0];
  assert.equal(ev.title, 'GhanaCTF Quals');
  assert.equal(ev.category, 'ctf');
  assert.equal(ev.organizer, 'KNUST Security Club');
  assert.equal(ev.location, 'Online');
  assert.deepEqual(ev.tags, ['jeopardy']);
});

test('json engine (devpost-shaped) maps fields and applies const category', async () => {
  const state = {};
  const r = await runSource(
    {
      name: 'devpost',
      type: 'json',
      url: `${fx.base}/api/devpost`,
      items: 'hackathons',
      map: {
        uid: 'id',
        title: 'title',
        url: 'url',
        organizer: 'organization_name',
        starts_at: { const: '2026-09-01T09:00:00Z' },
        category: { const: 'hackathon' },
      },
    },
    { state, defaults: localDefaults }
  );
  assert.equal(r.total, 2);
  assert.ok(r.events.every((e) => e.category === 'hackathon'));
  assert.equal(r.events[0].organizer, 'DevLagos');
});

test('html engine extracts events with CSS selectors', async () => {
  const state = {};
  const r = await runSource(
    {
      name: 'mlh',
      type: 'html',
      url: `${fx.base}/mlh`,
      default_category: 'hackathon',
      extract: {
        selectors: {
          item: '.event',
          fields: {
            title: '.event-name',
            starts_at: { selector: '.event-date-text meta', attr: 'content' },
            location: '.event-location',
            url: { selector: 'a.event-link', attr: 'href' },
          },
        },
      },
    },
    { state, defaults: localDefaults }
  );
  assert.equal(r.total, 2);
  assert.equal(r.events[0].title, 'Local Hack Day: Kumasi');
  assert.equal(r.events[0].category, 'hackathon');
  assert.equal(r.events[0].location, 'Kumasi, Ghana');
  assert.equal(r.events[0].url, 'https://example.com/lhd-kumasi');
});

test('dedupe reports new on first run, nothing on second, update on change', async () => {
  fixtures.resetCtftimeTitle();
  const state = {};
  const source = { name: 'ctf', adapter: 'ctftime', config: { baseUrl: `${fx.base}/api/ctftime`, days: 30 } };

  let r = await runSource(source, { state, defaults: localDefaults });
  assert.equal(r.added, 1);

  r = await runSource(source, { state, defaults: localDefaults });
  assert.equal(r.added, 0);
  assert.equal(r.updated, 0);

  fixtures.setCtftimeTitle('GhanaCTF Quals (Rescheduled)');
  r = await runSource(source, { state, defaults: localDefaults });
  assert.equal(r.added, 0);
  assert.equal(r.updated, 1);
  fixtures.resetCtftimeTitle();
});

test('source writes a JSON feed file', async () => {
  const out = path.join(tmp, 'ctftime.json');
  await runSource(
    {
      name: 'ctftime',
      adapter: 'ctftime',
      config: { baseUrl: `${fx.base}/api/ctftime`, days: 30 },
      output: { file: out },
    },
    { state: {}, defaults: localDefaults }
  );
  const feed = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.equal(feed.count, 1);
  assert.equal(feed.events[0].title, 'GhanaCTF Quals');
});

test('individual-mode webhook posts one event per item with headers', async () => {
  const received = [];
  const sink = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      received.push({ token: req.headers['x-admin-token'], body: JSON.parse(body) });
      res.end('{}');
    });
  });
  await new Promise((resolve) => sink.listen(0, resolve));
  const sinkUrl = `http://127.0.0.1:${sink.address().port}/api/events`;

  await runSource(
    {
      name: 'ctftime',
      adapter: 'ctftime',
      config: { baseUrl: `${fx.base}/api/ctftime`, days: 30 },
      output: { webhook: { url: sinkUrl, mode: 'individual', headers: { 'x-admin-token': 'secret' } } },
    },
    { state: {}, defaults: localDefaults }
  );

  assert.equal(received.length, 1);
  assert.equal(received[0].token, 'secret');
  assert.equal(received[0].body.title, 'GhanaCTF Quals');
  sink.close();
});

test('runConfig runs all sources, records per-source failures, persists state', async () => {
  const stateFile = path.join(tmp, 'state.json');
  const config = {
    state_file: stateFile,
    defaults: localDefaults,
    sources: [
      { name: 'ctftime', adapter: 'ctftime', config: { baseUrl: `${fx.base}/api/ctftime`, days: 30 } },
      { name: 'broken', adapter: 'nope' },
    ],
  };
  const result = await runConfig(config);
  const ok = result.sources.find((s) => s.source === 'ctftime');
  const bad = result.sources.find((s) => s.source === 'broken');
  assert.equal(ok.ok, true);
  assert.equal(bad.ok, false);
  assert.match(bad.error, /Unknown adapter/);

  const state = loadState(stateFile);
  assert.ok(state.ctftime);
  assert.equal(Object.keys(state.ctftime).length, 1);
});

test('AI extraction without an API key fails with a clear message', async () => {
  const source = {
    name: 'ai-site',
    type: 'html',
    url: `${fx.base}/mlh`,
    extract: { ai: { fields: ['title', 'starts_at'] } },
  };
  await assert.rejects(
    () => runSource(source, { state: {}, defaults: localDefaults, apiKey: undefined }),
    /API key/
  );
});
