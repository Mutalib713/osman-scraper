'use strict';

// Politeness layer: an honest user-agent, per-host rate limiting, and robots.txt
// checking. These keep the scraper defensible and unlikely to get IP-blocked.

const DEFAULT_UA =
  process.env.OSMAN_USER_AGENT || 'osman-scraper/0.1 (+https://github.com/Mutalib713/osman-scraper)';

const robotsCache = new Map();
const lastRequestAt = new Map();

function parseRobots(text, ua) {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/#.*$/, '').trim());
  const groups = [];
  let current = null;
  for (const line of lines) {
    const match = line.match(/^(user-agent|allow|disallow)\s*:\s*(.*)$/i);
    if (!match) continue;
    const field = match[1].toLowerCase();
    const value = match[2].trim();
    if (field === 'user-agent') {
      // Consecutive user-agent lines share the following rule block.
      if (current && current.rules.length === 0) current.agents.push(value.toLowerCase());
      else {
        current = { agents: [value.toLowerCase()], rules: [] };
        groups.push(current);
      }
    } else if (current) {
      current.rules.push({ type: field, path: value });
    }
  }
  const uaToken = ua.split('/')[0].toLowerCase();
  const chosen =
    groups.find((g) => g.agents.some((a) => a !== '*' && a && uaToken.includes(a))) ||
    groups.find((g) => g.agents.includes('*'));
  const allow = [];
  const disallow = [];
  if (chosen) {
    for (const rule of chosen.rules) {
      if (rule.type === 'allow' && rule.path) allow.push(rule.path);
      if (rule.type === 'disallow' && rule.path) disallow.push(rule.path);
    }
  }
  return { allow, disallow };
}

// Longest-prefix match wins; on an equal-length tie, Allow beats Disallow.
function isAllowed(rules, pathname) {
  let best = { len: -1, allow: true };
  for (const p of rules.disallow) {
    if (p && pathname.startsWith(p) && p.length > best.len) best = { len: p.length, allow: false };
  }
  for (const p of rules.allow) {
    if (p && pathname.startsWith(p) && p.length >= best.len) best = { len: p.length, allow: true };
  }
  return best.allow;
}

async function fetchRobots(origin, ua) {
  if (robotsCache.has(origin)) return robotsCache.get(origin);
  let rules = { allow: [], disallow: [] };
  try {
    const res = await fetch(`${origin}/robots.txt`, {
      headers: { 'user-agent': ua },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) rules = parseRobots(await res.text(), ua);
  } catch {
    // No robots.txt (or unreachable) — default to allowed.
  }
  robotsCache.set(origin, rules);
  return rules;
}

async function checkRobots(url, { ua = DEFAULT_UA, respect = true } = {}) {
  if (!respect) return true;
  const u = new URL(url);
  const rules = await fetchRobots(u.origin, ua);
  return isAllowed(rules, u.pathname);
}

async function rateLimit(url, minDelayMs = 1000) {
  const host = new URL(url).host;
  const now = Date.now();
  const wait = (lastRequestAt.get(host) || 0) + minDelayMs - now;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt.set(host, Date.now());
}

module.exports = {
  DEFAULT_UA,
  checkRobots,
  rateLimit,
  parseRobots,
  isAllowed,
  _reset() {
    robotsCache.clear();
    lastRequestAt.clear();
  },
};
