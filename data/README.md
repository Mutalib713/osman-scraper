# Published feeds

The GitHub Actions workflow (`.github/workflows/scrape.yml`) scrapes on a
schedule and writes the results here as JSON feeds, then commits them back.

Each file is a normalized feed — `{ "count": N, "events": [ ... ] }` — served
raw at, for example:

```
https://raw.githubusercontent.com/Mutalib713/osman-scraper/main/data/ctftime.json
```

Point a downstream consumer (e.g. TechPulse's Auto-import panel) at that URL.
Feeds omit a run timestamp, so they only change when the events change.
