// /api/lead.js
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
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const templateName = process.env.WHATSAPP_TEMPLATE_NAME || "zin_booking_summary_v1"; 
  const templateLang = "tr"; 

  const waTo = digitsOnly(to);
  const sessionCount = safeArr(sessions).length;
  const packageCount = safeArr(packages).length;
  const totalPrice = (sessionCount * PRICE_SESSION) + (packageCount * PRICE_PACKAGE);
  
  const sessionNames = sessions.join(', ') || 'Seçilmedi';
  const packageNames = packages.join(', ') || 'Seçilmedi';

  // KRİTİK DÜZELTME: Meta kuralı gereği \n (alt satır) karakterlerini kaldırdık. 
  // Her şeyi tek bir düz metin olarak, aralara boşluk koyarak yazıyoruz.
  const messageText = `Sayın ${firstName}, talebiniz alındı. Seanslar: ${sessionNames} ($${sessionCount * PRICE_SESSION}). Paketler: ${packageNames} ($${packageCount * PRICE_PACKAGE}). TOPLAM: $${totalPrice}. Ödeme: Western Union/MoneyGram (Ali Veli / Hasan Hüseyin). Dekontu lütfen bu numaraya iletiniz.`;

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
            { type: 'text', text: messageText } 
          ]
        }
      ]
    }
  };

  try {
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

    // WhatsApp'ı gönder
    const waResult = await sendWhatsAppTemplate({ 
      to, 
      firstName, 
      sessions: safeArr(body.sessions), 
      packages: safeArr(body.packages) 
    });

    console.log("WhatsApp API Son Yanıtı:", waResult);

    // Form başarılı dönsün
    return json(res, 200, { ok: true });

  } catch (err) {
    console.error("Kritik Hata:", err);
    return json(res, 500, { ok: false });
  }
}
