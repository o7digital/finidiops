const OLIVIA_BACKEND = 'https://olivia-ai.o7digital.com';
const FINIDI_TENANT_ORIGIN = 'https://finidicfo.com';
const ALLOWED_LANGUAGES = new Set(['en', 'es', 'fr']);

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function clean(value, maxLength = 4000) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

export default async function handler(request) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'Invalid request body' }, 400);
  }

  const message = clean(payload?.message);
  const language = ALLOWED_LANGUAGES.has(payload?.language) ? payload.language : 'en';
  if (!message) return json({ error: 'Message is required' }, 400);

  try {
    const identityResponse = await fetch(`${OLIVIA_BACKEND}/api/widget/identity`, {
      headers: { Origin: FINIDI_TENANT_ORIGIN },
      cache: 'no-store',
    });
    if (!identityResponse.ok) throw new Error(`Identity service returned ${identityResponse.status}`);
    const identity = await identityResponse.json();
    if (identity.clientCode !== 'finidi' || !identity.identity) throw new Error('FINIDI identity unavailable');

    const response = await fetch(`${OLIVIA_BACKEND}/api/olivia/chat`, {
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
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return json({ error: 'Olivia is temporarily unavailable' }, 502);
    return json({ reply: clean(data.reply), language: data.language || language, mode: data.mode || 'olivia-v2' });
  } catch (error) {
    console.error('[finidi-olivia]', error);
    return json({ error: 'Olivia is temporarily unavailable' }, 502);
  }
}
