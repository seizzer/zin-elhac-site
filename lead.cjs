// api/lead.cjs (CommonJS formatı)
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method === 'GET') return res.status(200).json({ ok: true, message: "CJS Endpoint up" });

  try {
    const body = req.body || {};
    const { to, firstName } = body;

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
          to: String(to).replace(/\D/g, ''),
          type: 'template',
          template: {
            name: process.env.WHATSAPP_TEMPLATE_NAME,
            language: { code: process.env.WHATSAPP_TEMPLATE_LANG },
            components: [{
              type: 'body',
              parameters: [{ type: 'text', text: String(firstName) }, { type: 'text', text: '-' }]
            }]
          }
        })
      }
    );

    const data = await response.json();
    return res.status(response.status).json({ ok: response.ok, data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
};
