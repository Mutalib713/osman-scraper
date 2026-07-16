'use strict';

// Adapter for CTFtime's official, free, public JSON API (no auth).
// Docs: https://ctftime.org/api/  — events carry ISO start/finish, url,
// organizers, onsite flag, and format.

const DAY_MS = 24 * 60 * 60 * 1000;

module.exports = {
  name: 'ctftime',
  defaultCategory: 'ctf',
  async collect({ fetchJson, config = {}, now = Date.now() }) {
    const days = config.days ?? 90;
    const base = config.baseUrl || 'https://ctftime.org/api/v1/events/';
    const start = Math.floor(now / 1000);
    const finish = Math.floor((now + days * DAY_MS) / 1000);
    const url = `${base}?limit=${config.limit ?? 100}&start=${start}&finish=${finish}`;
    const data = await fetchJson(url);
    const items = Array.isArray(data) ? data : [];
    return items.map((e) => ({
      uid: `ctftime-${e.id ?? e.ctf_id ?? e.title}`,
      title: e.title,
      description: e.description,
      url: e.url || e.ctftime_url,
      starts_at: e.start,
      ends_at: e.finish,
      location: e.onsite ? e.location || 'Onsite' : 'Online',
      organizer: Array.isArray(e.organizers) && e.organizers[0] ? e.organizers[0].name : '',
      category: 'ctf',
      tags: [e.format].filter(Boolean).map(String),
    }));
  },
};
