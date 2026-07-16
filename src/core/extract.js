'use strict';

const cheerio = require('cheerio');

/**
 * Selector-based extraction: pull an array of items out of an HTML page using
 * CSS selectors. Fast, free, no API key — but tied to the page's structure.
 *
 * selectors: { item: "<css>", fields: { title: "<css>" | { selector, attr } } }
 */
function extractWithSelectors(html, { item, fields }) {
  const $ = cheerio.load(html);
  const results = [];
  $(item).each((_, el) => {
    const node = $(el);
    const obj = {};
    for (const [key, spec] of Object.entries(fields)) {
      obj[key] = readField(node, spec);
    }
    results.push(obj);
  });
  return results;
}

function readField(node, spec) {
  const s = typeof spec === 'string' ? { selector: spec } : spec || {};
  const target = s.selector ? node.find(s.selector).first() : node;
  if (s.selector && target.length === 0) return '';
  if (s.attr) return (target.attr(s.attr) || '').trim();
  return target.text().replace(/\s+/g, ' ').trim();
}

// Reduce an HTML document to readable text (for AI extraction — saves tokens).
function htmlToText(html) {
  const $ = cheerio.load(html);
  $('script, style, noscript, svg').remove();
  return $('body').length ? $('body').text().replace(/\s+/g, ' ').trim() : $.root().text().replace(/\s+/g, ' ').trim();
}

// Extract a JSON payload rendered by a browser (endpoint shown in <pre> or as body text).
function jsonFromHtml(html) {
  const $ = cheerio.load(html);
  const text = ($('pre').first().text() || $('body').text() || '').trim();
  return JSON.parse(text);
}

module.exports = { extractWithSelectors, htmlToText, jsonFromHtml };
