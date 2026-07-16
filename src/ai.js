'use strict';

// Optional AI-extraction mode. Given page text (or an image/flyer), a small
// model pulls out structured items matching a field list — so a new site needs
// a schema, not a hand-written selector. Dormant until an API key is present.

const DEFAULT_MODEL = process.env.OSMAN_AI_MODEL || 'claude-haiku-4-5';

const EXTRACTION_SYSTEM =
  'You extract structured event/program listings from web pages, posts, and flyers. ' +
  'Return only events that are clearly present. Dates must be ISO 8601 where possible ' +
  '(otherwise the clearest absolute date). If a field is unknown, use null. Never invent events.';

function fieldSchema(name) {
  if (name === 'tags') return { type: ['array', 'null'], items: { type: 'string' } };
  return { type: ['string', 'null'] };
}

function buildSchema(fields) {
  const names = [...new Set([...(fields || []), 'title', 'starts_at'])];
  const properties = {};
  for (const name of names) properties[name] = fieldSchema(name);
  const item = { type: 'object', properties, required: names, additionalProperties: false };
  return {
    type: 'object',
    properties: { items: { type: 'array', items: item } },
    required: ['items'],
    additionalProperties: false,
  };
}

/**
 * @param {object} args
 * @param {string} args.content   Page text, or base64 image data when isImage.
 * @param {string[]} args.schema  Field names to extract.
 * @param {boolean} [args.isImage]
 * @param {string} [args.mediaType]
 * @param {string} [args.hint]    Extra context ("Tech events in Ghana").
 * @returns {Promise<object[]>}
 */
async function extractWithAI({
  content,
  schema,
  isImage = false,
  mediaType = 'image/png',
  hint = '',
  apiKey = process.env.ANTHROPIC_API_KEY,
  model = DEFAULT_MODEL,
}) {
  if (!apiKey) {
    throw new Error(
      'AI extraction needs an API key. Set ANTHROPIC_API_KEY, or use selector mode (extract.selectors) instead.'
    );
  }
  let Anthropic;
  try {
    const mod = require('@anthropic-ai/sdk');
    Anthropic = mod.default || mod;
  } catch {
    throw new Error('AI mode needs the Anthropic SDK: npm install @anthropic-ai/sdk');
  }

  const client = new Anthropic({ apiKey });
  const userContent = [];
  if (isImage) userContent.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data: content } });
  else userContent.push({ type: 'text', text: String(content).slice(0, 100000) });
  userContent.push({
    type: 'text',
    text: `Extract every distinct event as a JSON object with these fields: ${[...new Set([...(schema || []), 'title', 'starts_at'])].join(', ')}.${hint ? ` Context: ${hint}.` : ''}`,
  });

  const response = await client.messages.create({
    model,
    max_tokens: 4096,
    system: EXTRACTION_SYSTEM,
    messages: [{ role: 'user', content: userContent }],
    output_config: { format: { type: 'json_schema', schema: buildSchema(schema) } },
  });

  if (response.stop_reason === 'refusal') throw new Error('AI extraction was declined for this content.');
  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock) return [];
  let parsed;
  try {
    parsed = JSON.parse(textBlock.text);
  } catch {
    throw new Error('AI extraction returned unparseable output (possibly truncated — raise max_tokens).');
  }
  return Array.isArray(parsed.items) ? parsed.items : [];
}

module.exports = { extractWithAI, buildSchema, DEFAULT_MODEL };
