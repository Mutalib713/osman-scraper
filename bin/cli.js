#!/usr/bin/env node
'use strict';

const http = require('node:http');
const { loadConfig } = require('../src/config');
const { runConfig, runSource } = require('../src/run');
const { loadState, saveState } = require('../src/core/dedupe');
const adapters = require('../src/adapters');
const pkg = require('../package.json');

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) args[key] = true;
      else {
        args[key] = next;
        i += 1;
      }
    } else {
      args._.push(a);
    }
  }
  return args;
}

function usage() {
  console.log(`osman-scraper v${pkg.version}

Usage:
  osman-scraper run [source] [--config <file>]   Scrape all sources (or one) from the config
  osman-scraper serve [--config <file>] [--port]  Scrape on a schedule and serve a JSON feed
  osman-scraper list                              List built-in preset adapters
  osman-scraper version

Config defaults to ./osman-scraper.config.yml`);
}

async function main() {
  const [, , cmd, ...rest] = process.argv;
  const args = parseArgs(rest);
  const configPath = args.config || 'osman-scraper.config.yml';

  if (cmd === 'list') {
    const names = Object.keys(adapters);
    console.log(names.length ? names.join('\n') : '(no preset adapters)');
    return;
  }
  if (cmd === 'version' || cmd === '--version' || cmd === '-v') {
    console.log(pkg.version);
    return;
  }
  if (cmd === 'run') {
    const config = loadConfig(configPath);
    const result = await runConfig(config, { only: args._[0], log: (...a) => console.error('▶', ...a) });
    for (const r of result.sources) {
      console.log(
        r.ok
          ? `✔ ${r.source}: +${r.added} new, ${r.updated} updated (${r.total} total, ${r.emitted} emitted)`
          : `✘ ${r.source}: ${r.error}`
      );
    }
    return;
  }
  if (cmd === 'serve') {
    const config = loadConfig(configPath);
    const port = Number(args.port || process.env.PORT || 8787);
    const stateFile = config.state_file || './.osman/state.json';
    let feed = [];

    const refresh = async () => {
      const state = loadState(stateFile);
      const collect = [];
      for (const source of config.sources) {
        try {
          await runSource(source, { state, defaults: config.defaults, collect });
        } catch (err) {
          console.error(`✘ ${source.name}: ${err.message}`);
        }
      }
      saveState(stateFile, state);
      feed = collect;
      console.error(`feed refreshed: ${feed.length} events`);
    };

    await refresh();
    const intervalMs = (config.sync_interval_hours ?? 6) * 3600000;
    setInterval(() => refresh().catch((e) => console.error(e)), intervalMs).unref();

    http
      .createServer((req, res) => {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ generated_at: new Date().toISOString(), count: feed.length, events: feed }));
      })
      .listen(port, () => console.error(`osman-scraper feed on http://localhost:${port}/`));
    return;
  }

  usage();
  if (cmd && cmd !== 'help' && cmd !== '--help') process.exitCode = 1;
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
