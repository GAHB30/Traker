// netlify/functions/macros.js — proxy de IA para G·S Tracker (app nativa)
//
// Soporta texto Y foto:
//   { "prompt": "..." }                          → análisis de texto
//   { "prompt": "...", "image": "<base64 jpg>" } → análisis de foto del plato
//
// Protecciones:
//  1. Secreto compartido en header X-App-Key (las apps nativas no envían Origin)
//  2. Límites de tamaño de prompt e imagen (control de coste)
//  3. max_tokens capado y temperature: 0
//
// REQUISITOS en Netlify (Project configuration → Environment variables):
//   ANTHROPIC_API_KEY  → tu clave de Anthropic
//   APP_SHARED_KEY     → cadena aleatoria larga que tú inventes
//                        (genera una con: openssl rand -hex 32)
//                        La MISMA cadena va en el BuildConfig de la app Android.

const MAX_PROMPT_LENGTH = 1500;
// ~1.4 MB de base64 ≈ ~1 MB de JPEG. La app envía 768px/calidad 70%,
// que suele quedar en 100-300 KB — este límite es solo la red de seguridad.
const MAX_IMAGE_B64_LENGTH = 1_400_000;

export default async (req) => {
  const headers = { 'Content-Type': 'application/json' };

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });
  }

  // Autenticación por secreto compartido
  const appKey = req.headers.get('x-app-key') || '';
  if (!process.env.APP_SHARED_KEY || appKey !== process.env.APP_SHARED_KEY) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers });
  }

  let body;
  try { body = await req.json(); } catch { body = {}; }
  const { prompt, image } = body;

  if (!prompt || typeof prompt !== 'string' || prompt.length > MAX_PROMPT_LENGTH) {
    return new Response(JSON.stringify({ error: 'Invalid prompt' }), { status: 400, headers });
  }
  if (image !== undefined && (typeof image !== 'string' || image.length === 0 || image.length > MAX_IMAGE_B64_LENGTH)) {
    return new Response(JSON.stringify({ error: 'Invalid image' }), { status: 400, headers });
  }

  // Contenido del mensaje: texto solo, o imagen + texto
  const content = image
    ? [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } },
        { type: 'text', text: prompt }
      ]
    : prompt;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400, // la note de una foto (lista de alimentos) ocupa algo más
        temperature: 0,
        messages: [{ role: 'user', content }]
      })
    });

    const data = await r.json();
    if (!r.ok) {
      return new Response(JSON.stringify({ error: data.error?.message || 'API error' }), { status: r.status, headers });
    }
    const text = (data.content || [])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('');
    return new Response(JSON.stringify({ text }), { status: 200, headers });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Proxy error' }), { status: 500, headers });
  }
};

export const config = { path: '/api/macros' };
