const json = (res, status, obj) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(obj));
};

const allowCors = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*'); 
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
};

const safeStr = (v) => (typeof v === 'string' ? v.trim() : '');
const safeArr = (v) => (Array.isArray(v) ? v.map(x => String(x)) : []);
const digitsOnly = (v) => String(v || '').replace(/\D/g, '');

const PRICE_SESSION = 5;
const PRICE_PACKAGE = 10;

async function sendWhatsAppTemplate({ to, firstName, sessions, packages }) {
  try {
    const token = process.env.WHATSAPP_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const templateName = process.env.WHATSAPP_TEMPLATE_NAME || "zin_booking_summary_v1"; 
    const templateLang = "tr"; 

    const waTo = digitsOnly(to);
    const sCount = safeArr(sessions).length;
    const pCount = safeArr(packages).length;
    const total = (sCount * PRICE_SESSION) + (pCount * PRICE_PACKAGE);
    
    const sNames = sessions.join(', ') || 'Yok';
    const pNames = packages.join(', ') || 'Yok';

    const detailText = `Seanslar: ${sNames} ($${sCount * PRICE_SESSION}). Paketler: ${pNames} ($${pCount * PRICE_PACKAGE}). Toplam: $${total}. Odeme: Western Union/MoneyGram (Ali Veli / Hasan Huseyin).`;

    const payload = {
      messaging_product: 'whatsapp',
      to: waTo,
      type: 'template',
      template: {
        name: templateName,
        language: { code: templateLang },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: firstName },
              { type: 'text', text: detailText }
            ]
          }
        ]
      }
    };

    const resp = await fetch(`https://graph.facebook.com/v22.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    return await resp.json();
  } catch (e) {
    return { error: e.message };
  }
}

export default async function handler(req, res) {
  allowCors(req, res);
  if (req.method === 'OPTIONS') return json(res, 204, { ok: true });
  if (req.method !== 'POST') return json(res, 405, { ok: false });

  try {
    const body = req.body || {};
    const firstName = safeStr(body.firstName);
    const prefix = safeStr(body.phonePrefix); 
    const phoneRaw = safeStr(body.phoneRaw);
    const to = prefix.replace('+', '') + phoneRaw.replace(/\D/g, ''); 

    const waResult = await sendWhatsAppTemplate({ 
      to, 
      firstName, 
      sessions: safeArr(body.sessions), 
      packages: safeArr(body.packages) 
    });

    console.log("WA Result:", waResult);

    return json(res, 200, { ok: true });

  } catch (err) {
    console.error("Handler Error:", err);
    return json(res, 200, { ok: true });
  }
}
