// api/lead.js

export default async function handler(req, res) {
    // 1. CORS Ayarları
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // 2. OPTIONS ve GET Kontrolleri
    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    if (req.method === 'GET') {
        return res.status(200).json({ ok: true, message: "Endpoint active" });
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ ok: false, error: "Method Not Allowed" });
    }

    try {
        // 3. Veriyi Al (Vercel Node.js runtime otomatik parse eder)
        // Eğer boş gelirse manuel stream okumayı denemiyoruz, direkt hata döndürüyoruz.
        const body = req.body;
        
        if (!body || Object.keys(body).length === 0) {
            return res.status(400).json({ ok: false, error: "Body is empty. Make sure Content-Type is application/json" });
        }

        const to = String(body.to || '').replace(/\D/g, '');
        const firstName = String(body.firstName || '').trim();
        const sessions = Array.isArray(body.sessions) ? body.sessions : [];
        const packages = Array.isArray(body.packages) ? body.packages : [];

        if (!to || !firstName) {
            return res.status(400).json({ ok: false, error: "Missing 'to' or 'firstName'" });
        }

        // 4. WhatsApp Hazırlık
        const chosen = [
            sessions.length ? `Seanslar: ${sessions.join(', ')}` : null,
            packages.length ? `Paketler: ${packages.join(', ')}` : null,
        ].filter(Boolean).join(' • ');

        const payload = {
            messaging_product: 'whatsapp',
            to: to,
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

        // 5. API Çağrısı
        const response = await fetch(
            `https://graph.facebook.com/v20.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            }
        );

        const result = await response.json();

        if (!response.ok) {
            return res.status(response.status).json({ ok: false, error: "WhatsApp API error", detail: result });
        }

        return res.status(200).json({ ok: true, data: result });

    } catch (err) {
        console.error("Runtime Error:", err.message);
        return res.status(500).json({ ok: false, error: err.message });
    }
}
