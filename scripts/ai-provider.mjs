// D26: the only place that talks to an AI service. Pick one with AI_PROVIDER; keys come from environment
// variables on the server and never reach the browser. Every provider returns the model's text (JSON).
export class ProviderError extends Error {
  constructor(code, message) { super(message); this.name = 'ProviderError'; this.code = code; }
}

async function postJson(url, headers, body, signal) {
  let response;
  try { response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal }); }
  catch (error) { throw new ProviderError(error.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK', error.message); }
  const text = await response.text();
  if (!response.ok) throw new ProviderError(`HTTP_${response.status}`, text.slice(0, 300));
  try { return JSON.parse(text); } catch { throw new ProviderError('BAD_RESPONSE', 'Provider returned non-JSON'); }
}

function anthropic(env) {
  const model = env.AI_MODEL || 'claude-opus-5-5';
  return {
    name: 'anthropic', model, configured: Boolean(env.ANTHROPIC_API_KEY),
    async complete({ system, user, schema, signal }) {
      const message = await postJson('https://api.anthropic.com/v1/messages', {
        'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2026-10-21', 'anthropic-beta': 'server-side-fallback-2026-07-01',
      }, {
        model, max_tokens: 16000, system, messages: [{ role: 'user', content: user }],
        // Low effort keeps the demo responsive; the schema makes the reply parseable JSON.
        output_config: { effort: env.AI_EFFORT || 'low', format: { type: 'json_schema', schema } },
        fallbacks: 'default',
      }, signal);
      if (message.stop_reason === 'refusal') throw new ProviderError('REFUSAL', 'Model declined the request');
      if (message.stop_reason === 'max_tokens') throw new ProviderError('TRUNCATED', 'Reply hit max_tokens');
      return message.content.filter((block) => block.type === 'text').map((block) => block.text).join('');
    },
  };
}

// ChatGPT and OpenAI-compatible endpoints (many school-provided AI gateways use this shape; 확인 필요).
function chatCompletions({ name, baseUrl, apiKey, model }) {
  return {
    name, model, configured: Boolean(baseUrl && apiKey && model),
    async complete({ system, user, signal }) {
      const reply = await postJson(`${baseUrl.replace(/\/$/, '')}/chat/completions`, { Authorization: `Bearer ${apiKey}` }, {
        model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], response_format: { type: 'json_object' },
      }, signal);
      const choice = reply.choices?.[0];
      if (choice?.finish_reason === 'length') throw new ProviderError('TRUNCATED', 'Reply hit the length limit');
      if (typeof choice?.message?.content !== 'string') throw new ProviderError('BAD_RESPONSE', 'No message content');
      return choice.message.content;
    },
  };
}

export function providerFromEnv(env = process.env) {
  switch ((env.AI_PROVIDER || 'anthropic').toLowerCase()) {
    case 'anthropic': case 'claude': return anthropic(env);
    case 'openai': case 'chatgpt': return chatCompletions({ name: 'openai', baseUrl: 'https://api.openai.com/v1', apiKey: env.OPENAI_API_KEY, model: env.AI_MODEL || env.OPENAI_MODEL });
    case 'school': return chatCompletions({ name: 'school', baseUrl: env.SCHOOL_AI_BASE_URL, apiKey: env.SCHOOL_AI_API_KEY, model: env.AI_MODEL || env.SCHOOL_AI_MODEL });
    case 'none': case 'rules': return { name: 'none', model: null, configured: false, complete: async () => { throw new ProviderError('NOT_CONFIGURED', 'AI disabled'); } };
    default: throw new Error(`Unknown AI_PROVIDER "${env.AI_PROVIDER}". Use anthropic, openai, school or none.`);
  }
}
