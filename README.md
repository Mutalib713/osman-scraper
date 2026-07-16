# osman-scraper

**A small, reusable web-scraping toolkit — CLI + library.** Point it at a site, get back a normalized JSON feed. Built to be reused across projects: events today, jobs or scholarships or prices tomorrow — same tool, different config.

Every scrape runs the same pipeline:

```
 CONFIG ──▶ FETCH ──▶ EXTRACT ──▶ DEDUPE ──▶ OUTPUT
  what      polite     selectors    only new    file / webhook
  to get    HTTP or    or AI        or changed   / served feed
            browser
```

- **Two fetch modes** — plain HTTP (fast) or a real headless browser (for JS-heavy / bot-protected sites).
- **Two extract modes** — CSS **selectors** (fast, free, no key) or **AI** (describe the fields you want; the model reads the page — survives redesigns, works on flyers/screenshots).
- **Adapters** — ship a site recipe as code (CTFtime included) or add any site via config.
- **Built-in dedupe & change tracking** — reports only what's new or changed since last run.
- **Polite by default** — honors `robots.txt`, rate-limits per host, sends an honest user-agent.
- **Flexible output** — write a JSON/CSV file, POST to any webhook, or serve a live feed.

## Install

Requires **Node.js 20+**.

```bash
git clone https://github.com/Mutalib713/osman-scraper.git
cd osman-scraper
npm install
```

Optional features install extra packages (declared as optional dependencies):
- **Browser mode** needs Playwright: `npm install playwright && npx playwright install chromium`
- **AI mode** needs the Anthropic SDK: `npm install @anthropic-ai/sdk` and an `ANTHROPIC_API_KEY`

## Quick start

```bash
cp osman-scraper.config.example.yml osman-scraper.config.yml
# edit it, then:
osman-scraper run          # scrape every source once
osman-scraper run ctftime  # scrape just one source
osman-scraper serve        # scrape on a schedule and serve a JSON feed
osman-scraper list         # list built-in preset adapters
```

(Without a global install, use `node bin/cli.js run` / `npm start -- run`.)

## Configuration

A config is a `sources` list. Each source declares how to fetch, how to extract, and where to send results.

```yaml
state_file: ./.osman/state.json     # dedupe / change-tracking store
sync_interval_hours: 6             # how often `serve` re-scrapes

defaults:
  min_delay_ms: 1500               # polite gap between requests to the same host
  respect_robots: true
  # user_agent: "my-app/1.0 (contact@example.com)"
  # browser_executable: /path/to/chrome   # pin a Chromium binary (or OSMAN_BROWSER_EXECUTABLE)

sources:
  - name: my-source
    # ...one of the three source kinds below...
    output: { file: ./out/my-source.json }
    emit: all                      # 'all' (default) or 'new' (only new/changed items)
```

### Source kind 1 — a preset adapter (code)

```yaml
- name: ctftime
  adapter: ctftime          # see `osman-scraper list`
  config: { days: 90 }
```

### Source kind 2 — a generic JSON endpoint

```yaml
- name: devpost
  type: json
  url: https://devpost.com/api/hackathons
  fetch: browser            # 'static' (default) or 'browser'
  items: hackathons         # dot-path to the array inside the JSON
  map:                      # target field: source path, or { const: X }
    uid: id
    title: title
    url: url
    organizer: organization_name
    category: { const: hackathon }
```

### Source kind 3 — a generic HTML page (selectors or AI)

```yaml
# CSS selectors — fast, no API key
- name: mlh
  type: html
  url: https://mlh.io/seasons/2026/events
  default_category: hackathon
  extract:
    selectors:
      item: .event                         # repeated container
      fields:
        title: .event-name
        starts_at: { selector: time, attr: datetime }
        url: { selector: a, attr: href }

# AI extraction — for messy pages / flyers; needs ANTHROPIC_API_KEY
- name: gdg-accra
  type: html
  url: https://gdg.community.dev/gdg-accra/
  fetch: browser
  extract:
    ai:
      fields: [title, category, starts_at, ends_at, location, url, organizer, tags]
      hint: "Google Developer Group tech events in Accra, Ghana"
```

## Output options

Set `output` to one target or a list of targets:

```yaml
output:
  file: ./out/events.json          # JSON feed: { generated_at, count, events: [...] }
  csv: ./out/events.csv            # spreadsheet-friendly
  webhook:                         # POST somewhere
    url: https://example.com/api/events
    mode: individual               # 'batch' (default, one POST {events:[...]}) or 'individual' (one POST per event)
    headers: { x-admin-token: secret }
```

The normalized item every consumer receives:

```json
{
  "source": "ctftime",
  "uid": "ctftime-201",
  "title": "AccraCTF 2026",
  "category": "ctf",
  "description": "Beginner friendly.",
  "organizer": "Ashesi CyberSec",
  "location": "Online",
  "url": "https://example.com/accractf",
  "starts_at": "2026-08-01T18:00:00.000Z",
  "ends_at": "2026-08-02T18:00:00.000Z",
  "tags": ["jeopardy"],
  "hash": "fed984..."
}
```

## Use as a library

```js
const { runConfig, loadConfig, fetchStatic, extractWithSelectors } = require('osman-scraper');

// Run a whole config
const result = await runConfig(loadConfig('osman-scraper.config.yml'));

// Or use the pieces directly
const html = await fetchStatic('https://example.com/events');
const items = extractWithSelectors(html, { item: '.event', fields: { title: '.title' } });
```

## Scheduling

Either keep `osman-scraper serve` running (it re-scrapes every `sync_interval_hours` and serves the feed), or run `osman-scraper run` on cron:

```
0 7 * * *  cd /path/to/project && osman-scraper run
```

## AI extraction mode

When a page has no clean structure, AI mode reads it like a human. Set `ANTHROPIC_API_KEY` and give a field list instead of selectors. It defaults to **Claude Haiku 4.5** (cheap — fractions of a cent per page); override with `OSMAN_AI_MODEL`. Vision works too: pass a base64 image to the `extractWithAI` library function to read a flyer or screenshot. Without a key, AI mode fails with a clear message and selector mode still works.

## Being a good web citizen

Scraping public, non-personal data is generally fine when done responsibly, and osman-scraper defaults to responsible: it honors `robots.txt`, rate-limits, identifies itself honestly, and always keeps the source `url` so you link back. Still — check each site's Terms of Service, don't scrape behind logins, and keep request volume low. Some sites offer official APIs or feeds (iCal, JSON, RSS); prefer those.

## Piping into another app

`osman-scraper` emits a standard `{ events: [...] }` feed, so any app that can read a JSON URL or accept a POST can consume it. For example, to feed a platform that ingests JSON feeds, point that platform at `osman-scraper serve`'s URL; to push into an API that takes one event at a time, use an `individual`-mode webhook with an auth header (see Output options).

## Project layout

```
bin/cli.js              run | serve | list | version
src/
  index.js              library exports
  config.js             load & validate YAML/JSON config
  run.js                per-source pipeline + runConfig
  ai.js                 optional Claude extraction
  adapters/             preset site recipes (ctftime)
  engines/
    json.js             generic JSON-endpoint source
    html.js             generic HTML source (selectors | AI)
  core/
    fetch.js            static + browser fetching
    politeness.js       robots.txt, rate limiting, user-agent
    extract.js          selector extraction, html→text, json-from-browser
    normalize.js        normalized item shape + change hash
    dedupe.js           new/changed detection + state file
    output.js           file / csv / webhook
test/                   unit + end-to-end (fixture server) tests
```

## Tests

```bash
npm test
```

Covers normalization, dedupe/change-detection, robots.txt parsing, selector & JSON extraction, CSV/webhook output, the CTFtime adapter, and full source runs against a local fixture server.

## License

MIT © Mutalib Osman
