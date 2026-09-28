const OLIVIA_BACKEND = 'https://olivia-ai.o7digital.com';
const FINIDI_TENANT_ORIGIN = 'https://finidicfo.com';
const ALLOWED_LANGUAGES = new Set(['en', 'es', 'fr']);

function send(res, body, status = 200) {
  res.status(status).setHeader('Content-Type', 'application/json').setHeader('Cache-Control', 'no-store').json(body);
}

function clean(value, maxLength = 4000) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

export default async function handler(request, response) {
  if (request.method !== 'POST') return send(response, { error: 'Method not allowed' }, 405);

  let payload;
  try {
    payload = typeof request.body === 'string' ? JSON.parse(request.body) : request.body || {};
  } catch {
    return send(response, { error: 'Invalid request body' }, 400);
  }

  const message = clean(payload?.message);
  const language = ALLOWED_LANGUAGES.has(payload?.language) ? payload.language : 'en';
  if (!message) return send(response, { error: 'Message is required' }, 400);

  try {
    const identityResponse = await fetch(`${OLIVIA_BACKEND}/api/widget/identity`, {
      headers: { Origin: FINIDI_TENANT_ORIGIN },
      cache: 'no-store',
    });
    if (!identityResponse.ok) throw new Error(`Identity service returned ${identityResponse.status}`);
    const identity = await identityResponse.json();
    if (identity.clientCode !== 'finidi' || !identity.identity) throw new Error('FINIDI identity unavailable');

    const chatResponse = await fetch(`${OLIVIA_BACKEND}/api/olivia/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: FINIDI_TENANT_ORIGIN,
        'X-Olivia-Widget-Identity': identity.identity,
      },
      body: JSON.stringify({
        clientCode: 'finidi',
        message,
        language,
        metadata: {
          pageUrl: clean(payload?.metadata?.pageUrl, 1000),
          pageTitle: clean(payload?.metadata?.pageTitle, 300),
          source: 'finidiops-command-center',
        },
      }),
      cache: 'no-store',
    });
    const data = await chatResponse.json().catch(() => ({}));
    if (!chatResponse.ok) return send(response, { error: 'Olivia is temporarily unavailable' }, 502);
    return send(response, { reply: clean(data.reply), language: data.language || language, mode: data.mode || 'olivia-v2' });
  } catch (error) {
    console.error('[finidi-olivia]', error);
    return send(response, { error: 'Olivia is temporarily unavailable' }, 502);
  }
}
