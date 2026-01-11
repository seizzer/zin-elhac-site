// api/lead.js
export default async function handler(req, res) {
  // CORS Ayarları
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  try {
    if (req.method === 'GET') {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: true, message: "Endpoint aktif" }));
      return;
    }

    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.end(JSON.stringify({ ok: false, error: 'Method not allowed' }));
      return;
    }

    // Ortam değişkenlerini kontrol et
    const {
      WHATSAPP_TOKEN,
      WHATSAPP_PHONE_NUMBER_ID,
      WHATSAPP_TEMPLATE_NAME,
      WHATSAPP_TEMPLATE_LANG
    } = process.env;

    if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
      res.statusCode = 500;
      res.end(JSON.stringify({ ok: false, error: 'Sunucu yapılandırması (ENV) eksik.' }));
      return;
    }

    // Vercel/Node body'yi otomatik parse etmiş olabilir
    const body = req.body || {};
    
    const to = String(body?.to || '').replace(/\D/g, '');
    const firstName = String(body?.firstName || '').trim();
    const sessions = Array.isArray(body?.sessions) ? body.sessions : [];
    const packages = Array.isArray(body?.packages) ? body.packages : [];

    if (!to || !firstName) {
      res.statusCode = 400;
      res.end(JSON.stringify({ ok: false, error: 'Telefon ve isim zorunludur.' }));
      return;
    }

    const chosen = [
      sessions.length ? `Seanslar: ${sessions.join(', ')}` : null,
      packages.length ? `Paketler: ${packages.join(', ')}` : null,
    ].filter(Boolean).join(' • ');

    const payload = {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: WHATSAPP_TEMPLATE_NAME,
        language: { code: WHATSAPP_TEMPLATE_LANG },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: firstName },
              { type: 'text', text: chosen || '-' }
            ],
          },
        ],
      },
    };

    const url = `https://graph.facebook.com/v20.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`;

    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await r.json().catch(() => ({}));

    if (!r.ok) {
      res.statusCode =
