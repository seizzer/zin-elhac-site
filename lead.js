// api/lead.js  (ESM - works with package.json: { "type": "module" })
export default async function handler(req, res) {
  try {
    // Helpful for quick browser checks
    if (req.method === 'GET') {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ ok: true, message: "lead endpoint up (POST to send WhatsApp template)" }));
      return;
    }

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.setHeader('Allow', 'POST, GET, OPTIONS');
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ ok: false, error: 'Method not allowed' }));
      return;
    }

    const required = ['WHATSAPP_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_TEMPLATE_NAME', 'WHATSAPP_TEMPLATE_LANG'];
    const missing = required.filter((k) => !process.env[k] || String(process.env[k]).trim() === '');
    if (missing.length) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ ok: false, error: 'Missing env vars', need: missing }));
      return;
    }

    const body = await readJsonBody(req);

    // Frontend already validates; still keep server-side guards.
    const to = String(body?.to || '').replace(/\D/g, '');
    const firstName = String(body?.firstName || '').trim();
    const lastName = String(body?.lastName || '').trim();
    const sessions = Array.isArray(body?.sessions) ? body.sessions : [];
    const packages = Array.isArray(body?.packages) ? body.packages : [];

    if (!to || to.length < 8) throw new Error('Telefon numarası geçersiz.');
    if (!firstName || !lastName) throw new Error('Ad / Soyad zorunlu.');
    if ((sessions.length + packages.length) < 1) throw new Error('En az 1 seans veya paket seçilmeli.');

    // Prepare template variables. (Adjust to match your template placeholders order!)
    const chosen = [
      sessions.length ? `Seanslar: ${sessions.join(', ')}` : null,
      packages.length ? `Paketler: ${packages.join(', ')}` : null,
    ].filter(Boolean).join(' • ');

    const vars = [
      firstName,                        // {{1}} - name
      chosen || '-',                    // {{2}} - selection summary
    ];

    const payload = {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: process.env.WHATSAPP_TEMPLATE_NAME,
        language: { code: process.env.WHATSAPP_TEMPLATE_LANG },
        components: [
          {
            type: 'body',
            parameters: vars.map((v) => ({ type: 'text', text: String(v) })),
          },
        ],
      },
    };

    const url = `https://graph.facebook.com/v20.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

    const r = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await r.json().catch(() => ({}));

    if (!r.ok) {
      res.statusCode = r.status || 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ ok: false, status: r.status, data }));
      return;
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: true, status: 200, data }));
  } catch (err) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: false, error: err?.message || String(err) }));
  }
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); }
      catch (e) { reject(new Error('JSON parse failed')); }
    });
    req.on('error', reject);
  });
}
