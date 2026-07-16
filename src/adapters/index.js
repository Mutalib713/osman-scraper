'use strict';

// Registry of named preset adapters. Add a file here to ship a new site recipe
// as code; most sites are better handled by the generic `json` / `html` source
// types (see src/engines) configured in YAML.

const ctftime = require('./ctftime');

module.exports = {
  [ctftime.name]: ctftime,
};
