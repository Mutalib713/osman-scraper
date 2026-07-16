'use strict';

const { DEFAULT_UA, checkRobots, rateLimit } = require('./politeness');

/**
 * Fetch a URL as text with a plain HTTP client — fast and cheap.
 * Honors robots.txt, rate-limits per host, and retries transient failures.
 */
async function fetchStatic(
  url,
  { ua = DEFAULT_UA, timeout = 20000, minDelayMs = 1000, respectRobots = true, retries = 3, headers = {} } = {}
) {
  if (!(await checkRobots(url, { ua, respect: respectRobots }))) {
    throw new Error(`Blocked by robots.txt: ${url}`);
  }
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    await rateLimit(url, minDelayMs);
    try {
      const res = await fetch(url, {
        headers: { 'user-agent': ua, ...headers },
        redirect: 'follow',
        signal: AbortSignal.timeout(timeout),
      });
      if (res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status} for ${url}`), { fatal: true });
      return await res.text();
    } catch (err) {
      lastError = err;
      if (err.fatal || attempt === retries) break;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
  throw lastError;
}

async function fetchJson(url, opts) {
  return JSON.parse(await fetchStatic(url, { headers: { accept: 'application/json' }, ...opts }));
}

/**
 * Fetch a URL through a real headless browser — for JS-heavy or bot-protected
 * sites that reject plain HTTP clients. Playwright is an optional dependency;
 * a clear message is thrown if it isn't installed.
 */
async function fetchBrowser(
  url,
  {
    ua = DEFAULT_UA,
    timeout = 30000,
    waitUntil = 'networkidle',
    minDelayMs = 1000,
    respectRobots = true,
    // Point at a specific Chromium binary (locked-down envs, pinned browsers).
    executablePath = process.env.OSMAN_BROWSER_EXECUTABLE,
  } = {}
) {
  if (!(await checkRobots(url, { ua, respect: respectRobots }))) {
    throw new Error(`Blocked by robots.txt: ${url}`);
  }
  let chromium;
  try {
    ({ chromium } = require('playwright'));
  } catch {
    throw new Error(
      'Browser mode needs Playwright. Install it: npm install playwright && npx playwright install chromium'
    );
  }
  await rateLimit(url, minDelayMs);
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  try {
    const page = await browser.newPage({ userAgent: ua });
    await page.goto(url, { waitUntil, timeout });
    return await page.content();
  } finally {
    await browser.close();
  }
}

module.exports = { fetchStatic, fetchJson, fetchBrowser };
