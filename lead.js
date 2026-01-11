// api/lead.js (Saf ESM)
export default async function handler(req, res) {
  // CORS ve Header Ayarları
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  try {
    // 1. JSON Body'yi Güvenli Bir Şekilde Alalım
    let body = {};
    if (req.body && typeof req.body === 'object') {
      body = req.body;
    } else {
      // Eğer Vercel parse etmediyse manuel oku
      body = await new Promise((resolve, reject) => {
        let rawData = '';
        req.on('data', (chunk) => { rawData += chunk; });
        req.on('end', () => {
          try {
            resolve(rawData ? JSON.parse(rawData) : {});
          } catch (e) {
            reject(new Error("Geçersiz JSON verisi"));
          }
        });
        req.on('error', (err) => reject(err));
      });
    }

    // 2. GET İsteği Kontrolü (Test için)
    if (req.method === 'GET') {
      return res.status(200).json({ ok: true, status: "active" });
    }

    // 3. Veri Doğrulama
    const to = String(body?.to || '').replace(/\D/g, '');
    const firstName = String(body?.firstName || '').trim();
    const sessions = Array.isArray(body?.sessions) ? body.sessions : [];
    const packages = Array.isArray(body?.packages) ? body.packages : [];

    if (!to || !firstName) {
      return res.status(400).json({ ok: false, error: 'Eksik alan: to veya firstName.' });
    }

    // 4. WhatsApp Payload Hazırlığı
    const chosen = [
      sessions.length ? `Seanslar: ${sessions.join(', ')}` : null,
      packages.length ? `Paketler: ${packages.join(', ')}` : null,
    ].filter(Boolean).join(' • ');

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
            parameters: [
              { type: 'text', text: firstName },
              { type: 'text', text: chosen || '-' }
            ],
          },
        ],
      },
    };

    // 5. Meta API Çağrısı
    const url = `https://graph.facebook.com/v20.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
    
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await r.json().catch(() => ({}));

    if (!r.ok) {
      console.error("WhatsApp API Hatası:", data);
      return res.status(r.status || 500).json({ ok: false, error: 'WhatsApp API error', meta: data });
    }

    return res.status(200).json({ ok: true, data });

  } catch (err) {
    console.error("Fonksiyon Hatası:", err.message);
    return res.status(500).json({ ok: false
