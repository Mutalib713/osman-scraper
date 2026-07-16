'use strict';

// Generic HTML source: fetch a page (static or via browser) then extract items
// with CSS selectors OR the AI extractor. Covers any site without a JSON API.

const { extractWithSelectors, htmlToText } = require('../core/extract');
const { extractWithAI } = require('../ai');

async function collectHtml(source, { fetchStatic, fetchBrowser }) {
  const html = source.fetch === 'browser' ? await fetchBrowser(source.url) : await fetchStatic(source.url);

  if (source.extract?.selectors) {
    return extractWithSelectors(html, source.extract.selectors);
  }
  if (source.extract?.ai) {
    const ai = source.extract.ai;
    const text = htmlToText(html).slice(0, ai.max_chars ?? 12000);
    return extractWithAI({ content: text, schema: ai.fields, hint: ai.hint, model: ai.model });
  }
  throw new Error(`html source "${source.name}" needs extract.selectors or extract.ai`);
}

module.exports = { collectHtml };
