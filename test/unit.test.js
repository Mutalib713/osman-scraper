'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeEvent, hashEvent, toIso, cleanTags, isValid } = require('../src/core/normalize');
const { reconcile } = require('../src/core/dedupe');
const { parseRobots, isAllowed } = require('../src/core/politeness');
const { extractWithSelectors, htmlToText, jsonFromHtml } = require('../src/core/extract');
const { toCsv } = require('../src/core/output');
const { mapItem, getPath } = require('../src/engines/json');
const { buildSchema } = require('../src/ai');

test('toIso accepts ISO strings, epoch seconds and ms', () => {
  assert.equal(toIso('2026-08-01T09:00:00Z'), '2026-08-01T09:00:00.000Z');
  assert.equal(toIso(1785000000), new Date(1785000000 * 1000).toISOString());
  assert.equal(toIso(1785000000000), new Date(1785000000000).toISOString());
  assert.equal(toIso('not a date'), null);
  assert.equal(toIso(''), null);
});

test('cleanTags dedupes, lowercases and splits strings', () => {
  assert.deepEqual(cleanTags(['AI', 'ai', ' ML ']), ['ai', 'ml']);
  assert.deepEqual(cleanTags('rust, Rust ,cli'), ['rust', 'cli']);
  assert.deepEqual(cleanTags(null), []);
});

test('normalizeEvent builds a stable shape with uid and hash', () => {
  const ev = normalizeEvent(
    { id: 7, title: '  Big   Hack  ', starts_at: '2026-08-01T09:00:00Z', tags: ['Fin', 'fin'] },
    { source: 'x', defaultCategory: 'hackathon' }
  );
  assert.equal(ev.uid, '7');
  assert.equal(ev.title, 'Big Hack');
  assert.equal(ev.category, 'hackathon');
  assert.equal(ev.location, 'Online');
  assert.deepEqual(ev.tags, ['fin']);
  assert.match(ev.hash, /^[a-f0-9]{40}$/);
});

test('hash changes only when meaningful fields change', () => {
  const base = { title: 'A', starts_at: '2026-08-01T09:00:00Z' };
  const a = normalizeEvent(base, { source: 's' });
  const b = normalizeEvent({ ...base }, { source: 's' });
  const c = normalizeEvent({ ...base, location: 'Kumasi' }, { source: 's' });
  assert.equal(a.hash, b.hash);
  assert.notEqual(a.hash, c.hash);
});

test('isValid requires a title and a parseable start', () => {
  assert.equal(isValid(normalizeEvent({ title: 'X', starts_at: '2026-01-01' }, {})), true);
  assert.equal(isValid(normalizeEvent({ title: 'X' }, {})), false);
  assert.equal(isValid(normalizeEvent({ starts_at: '2026-01-01' }, {})), false);
});

test('reconcile classifies added / updated / unchanged and persists state', () => {
  const state = {};
  const mk = (uid, hash) => ({ uid, hash });
  let r = reconcile(state, 'src', [mk('a', '1'), mk('b', '1')]);
  assert.equal(r.added.length, 2);

  r = reconcile(state, 'src', [mk('a', '1'), mk('b', '2'), mk('c', '1')]);
  assert.deepEqual(
    r.added.map((e) => e.uid),
    ['c']
  );
  assert.deepEqual(
    r.updated.map((e) => e.uid),
    ['b']
  );
  assert.deepEqual(
    r.unchanged.map((e) => e.uid),
    ['a']
  );
});

test('robots.txt parsing and longest-match allow/disallow', () => {
  const rules = parseRobots('User-agent: *\nDisallow: /private\nAllow: /private/ok\n', 'osman-scraper/0.1');
  assert.equal(isAllowed(rules, '/public'), true);
  assert.equal(isAllowed(rules, '/private/secret'), false);
  assert.equal(isAllowed(rules, '/private/ok/page'), true);
});

test('robots.txt targets the most specific user-agent group', () => {
  const text = 'User-agent: *\nDisallow: /\n\nUser-agent: osman-scraper\nDisallow: /nope\n';
  const rules = parseRobots(text, 'osman-scraper/0.1');
  assert.equal(isAllowed(rules, '/anything'), true);
  assert.equal(isAllowed(rules, '/nope'), false);
});

test('selector extraction reads text and attributes', () => {
  const html = `<ul>
    <li class="e"><span class="t">One</span><a href="/1">go</a></li>
    <li class="e"><span class="t">Two</span><a href="/2">go</a></li>
  </ul>`;
  const items = extractWithSelectors(html, {
    item: 'li.e',
    fields: { title: '.t', url: { selector: 'a', attr: 'href' } },
  });
  assert.deepEqual(items, [
    { title: 'One', url: '/1' },
    { title: 'Two', url: '/2' },
  ]);
});

test('htmlToText strips scripts/styles', () => {
  const text = htmlToText('<body><style>x{}</style><p>Hello</p><script>1</script></body>');
  assert.equal(text, 'Hello');
});

test('jsonFromHtml reads a JSON body rendered by a browser', () => {
  assert.deepEqual(jsonFromHtml('<pre>{"a":1}</pre>'), { a: 1 });
  assert.deepEqual(jsonFromHtml('<html><body>{"b":2}</body></html>'), { b: 2 });
});

test('json engine maps fields by path and const', () => {
  const item = { id: 9, name: 'Hack', org: { title: 'Acme' } };
  const mapped = mapItem(item, { uid: 'id', title: 'name', organizer: 'org.title', category: { const: 'hackathon' } });
  assert.deepEqual(mapped, { uid: 9, title: 'Hack', organizer: 'Acme', category: 'hackathon' });
  assert.equal(getPath(item, 'org.title'), 'Acme');
});

test('csv output escapes commas, quotes and joins tags', () => {
  const csv = toCsv([{ source: 's', title: 'A, B', tags: ['x', 'y'], url: 'http://z' }]);
  const [, row] = csv.split('\n');
  assert.match(row, /"A, B"/);
  assert.match(row, /x;y/);
});

test('AI schema wraps items and forces title/starts_at', () => {
  const schema = buildSchema(['location']);
  assert.deepEqual(schema.required, ['items']);
  const item = schema.properties.items.items;
  assert.equal(item.additionalProperties, false);
  assert.ok(item.required.includes('title'));
  assert.ok(item.required.includes('starts_at'));
  assert.ok(item.required.includes('location'));
});
