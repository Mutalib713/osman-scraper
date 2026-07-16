'use strict';

// A tiny local HTTP server serving fixture pages/APIs so the scraper can be
// tested end to end without touching the real internet.

const http = require('node:http');

const DAY = 86400000;
// Fixed at module load so a source scraped twice returns byte-identical data —
// otherwise per-request drift would make every re-sync look like a change.
const BASE = Date.now();
const iso = (days) => new Date(BASE + days * DAY).toISOString();
const secs = (days) => Math.floor((BASE + days * DAY) / 1000);

// Mutable so tests can change a value and assert change-detection.
let ctftimeTitle = 'GhanaCTF Quals';

// Emulates CTFtime's server-side start/finish window filtering, so the past
// event is excluded by the query the adapter sends (not by client-side logic).
function ctftimeBody(query) {
  const startSec = Number(query.get('start')) || 0;
  const finishSec = Number(query.get('finish')) || Number.MAX_SAFE_INTEGER;
  const all = [
    {
      id: 101,
      title: ctftimeTitle,
      description: 'Jeopardy-style CTF for students.',
      url: 'https://example.com/ghanactf',
      ctftime_url: 'https://ctftime.org/event/101',
      start: iso(5),
      finish: iso(6),
      onsite: false,
      organizers: [{ id: 1, name: 'KNUST Security Club' }],
      format: 'Jeopardy',
    },
    {
      id: 102,
      title: 'Old Event',
      start: iso(-10),
      finish: iso(-9),
      onsite: true,
      location: 'Accra',
      organizers: [{ name: 'Someone' }],
      format: 'Attack-Defense',
    },
  ];
  const inWindow = all.filter(
    (e) => Date.parse(e.finish) / 1000 >= startSec && Date.parse(e.start) / 1000 <= finishSec
  );
  return JSON.stringify(inWindow);
}

const devpostBody = JSON.stringify({
  hackathons: [
    { id: 5001, title: 'CodeStorm Online', url: 'https://example.com/codestorm', organization_name: 'DevLagos' },
    { id: 5002, title: 'AgriTech Hack', url: 'https://example.com/agritech', organization_name: 'FarmHub' },
  ],
});

const mlhHtml = `<!doctype html><html><body>
  <div class="event">
    <h3 class="event-name">Local Hack Day: Kumasi</h3>
    <div class="event-date-text"><meta content="${iso(9)}"></div>
    <div class="event-location">Kumasi, Ghana</div>
    <a class="event-link" href="https://example.com/lhd-kumasi">Details</a>
  </div>
  <div class="event">
    <h3 class="event-name">Hackcra 2026</h3>
    <div class="event-date-text"><meta content="${iso(20)}"></div>
    <div class="event-location">Online</div>
    <a class="event-link" href="https://example.com/hackcra">Details</a>
  </div>
</body></html>`;

const robotsAllowAll = 'User-agent: *\nDisallow:\n';

function start() {
  const server = http.createServer((req, res) => {
    const parsed = new URL(req.url, 'http://localhost');
    const url = parsed.pathname;
    if (url === '/robots.txt') {
      res.setHeader('content-type', 'text/plain');
      return res.end(robotsAllowAll);
    }
    if (url === '/api/ctftime') {
      res.setHeader('content-type', 'application/json');
      return res.end(ctftimeBody(parsed.searchParams));
    }
    if (url === '/api/devpost') {
      res.setHeader('content-type', 'application/json');
      return res.end(devpostBody);
    }
    if (url === '/mlh') {
      res.setHeader('content-type', 'text/html');
      return res.end(mlhHtml);
    }
    res.statusCode = 404;
    res.end('not found');
  });
  return new Promise((resolve) => {
    server.listen(0, () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` }));
  });
}

module.exports = {
  start,
  secs,
  setCtftimeTitle: (t) => {
    ctftimeTitle = t;
  },
  resetCtftimeTitle: () => {
    ctftimeTitle = 'GhanaCTF Quals';
  },
};
