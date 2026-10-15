const logger = require('./logger');
const { LLM_TIMEOUT_MS } = require('./config');

// Supported providers. Both use the OpenAI-compatible chat completions format.
const PROVIDERS = {
  openai: {
    url: 'https://api.openai.com/v1/chat/completions',
    keyEnv: 'OPENAI_API_KEY',
    modelEnv: 'OPENAI_MODEL',
    defaultModel: 'gpt-4o-mini',
    temperature: 0.2
  },
  groq: {
    url: 'https://api.groq.com/openai/v1/chat/completions',
    keyEnv: 'GROQ_API_KEY',
    modelEnv: 'GROQ_MODEL',
    defaultModel: 'openai/gpt-oss-20b', // check console.groq.com/docs/models for current IDs
    temperature: 0.2
  }
};

const SYSTEM_PROMPT = [
  'You are a site reliability engineer writing alerts for an API monitoring system. ' +
    'The company integrates with external APIs for patient and operational data.',
  'You receive one API check result and the anomalies found by the rule engine. ' +
    'Write one alert message.',
  'Rules:',
  '- Maximum three sentences. Plain text only: no markdown, bullets, or emojis.',
  '- Name the API and state what happened, using the exact values provided ' +
    '(status code, response time, records).',
  '- Give one likely cause, phrased as a possibility.',
  '- End with one short recommended action.',
  '- Use only the data provided. Do not invent metrics, error messages, or system names.',
  '- If there are several anomalies, combine them into one message. Do not repeat yourself.'
].join('\n');

// Deterministic fallback so the system still produces readable alerts without an API key
// or when the LLM is unavailable.
function fallbackMessage(entry, anomalies) {
  const details = anomalies.map(a => a.detail).join('; ');
  return `${entry.api_name} reported: ${details}. Possible outage or data issue, please investigate.`;
}

function resolveProvider() {
  const name = (process.env.LLM_PROVIDER || 'openai').toLowerCase();
  if (name === 'none') return null;
  const cfg = PROVIDERS[name];
  if (!cfg) {
    logger.warn('Unknown LLM_PROVIDER, using fallback only', { LLM_PROVIDER: name });
    return null;
  }
  const apiKey = process.env[cfg.keyEnv];
  const model = process.env[cfg.modelEnv] || cfg.defaultModel;
  if (!apiKey) return null;
  if (!model) {
    logger.warn(`${cfg.modelEnv} is not set, using fallback only`);
    return null;
  }
  return { name, cfg, apiKey, model };
}

async function generateAlert(entry, anomalies) {
  const provider = resolveProvider();
  if (!provider) {
    return { message: fallbackMessage(entry, anomalies), source: 'fallback' };
  }

  const { name, cfg, apiKey, model } = provider;

  try {
    const body = {
      model,
      max_tokens: 1024, // reasoning models use part of this budget internally
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: JSON.stringify({ api: entry, anomalies }) }
      ]
    };
    if (cfg.temperature !== undefined) body.temperature = cfg.temperature;

    const res = await fetch(cfg.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(LLM_TIMEOUT_MS)
    });

    if (!res.ok) throw new Error(`${name} responded with HTTP ${res.status}`);

    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error(`${name} returned an empty response`);

    return { message: text, source: 'llm' };
  } catch (err) {
    logger.warn('LLM call failed, using fallback', { provider: name, api: entry.api_name, error: err.message });
    return { message: fallbackMessage(entry, anomalies), source: 'fallback' };
  }
}

module.exports = { generateAlert };
