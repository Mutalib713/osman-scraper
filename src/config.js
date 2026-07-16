'use strict';

const fs = require('node:fs');
const path = require('node:path');

/** Load a .yml/.yaml or .json config file into a validated config object. */
function loadConfig(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const ext = path.extname(file).toLowerCase();
  let config;
  if (ext === '.json') {
    config = JSON.parse(raw);
  } else {
    let yaml;
    try {
      yaml = require('js-yaml');
    } catch {
      throw new Error('YAML config needs js-yaml (npm install js-yaml), or use a .json config.');
    }
    config = yaml.load(raw);
  }
  if (!config || !Array.isArray(config.sources)) {
    throw new Error('Config must be an object with a "sources" array.');
  }
  for (const source of config.sources) {
    if (!source.name) throw new Error('Every source needs a "name".');
  }
  return config;
}

module.exports = { loadConfig };
