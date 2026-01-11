// api/lead.js
export default async function handler(req, res) {
  // CORS ayarları - Tarayıcı hatalarını önler
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // GET testi için
  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, message: "API is alive" });
  }

  try {
    const body = req.body || {};
    const to = String(body.to || '').replace(/\D/g, '');
    const firstName = String(body.firstName || '').trim();

    if (req.method === 'POST') {
      if (!to || !firstName) {
        return res.status(400).json({ ok: false, error: "Missing fields" });
      }

      const response = await fetch(
        `https://graph.facebook.com/v20.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to,
            type: 'template',
            template: {
              name: process.env.WHATSAPP_TEMPLATE_NAME,
              language: { code: process.env.WHATSAPP_TEMPLATE_LANG },
              components: [{
                type: 'body',
                parameters: [{ type: 'text', text: firstName }, { type: 'text', text: '-' }]
              }]
            }
          })
        }
      );

      const result = await response.json();
      return res.status(response.status).json({ ok: response.ok, data: result });
    }
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
