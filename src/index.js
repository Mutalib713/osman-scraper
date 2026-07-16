'use strict';

// Library entry point. Import osman-scraper into any Node app:
//   const { runConfig, fetchStatic, extractWithSelectors } = require('osman-scraper');

module.exports = {
  ...require('./run'),
  ...require('./core/normalize'),
  ...require('./core/fetch'),
  ...require('./core/extract'),
  ...require('./core/dedupe'),
  ...require('./core/output'),
  ...require('./core/politeness'),
  ...require('./engines/json'),
  ...require('./engines/html'),
  extractWithAI: require('./ai').extractWithAI,
  loadConfig: require('./config').loadConfig,
  adapters: require('./adapters'),
};
