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

// WhatsApp Fonksiyonu
async function sendWhatsAppTemplate({ to, firstName, sessions, packages }) {
  try {
    const token = process.env.WHATSAPP_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const templateName = process.env.WHATSAPP_TEMPLATE_NAME || "zin_booking_summary_v1"; 
    
    const sCount = safeArr(sessions).length;
    const pCount = safeArr(packages).length;
    const total = (sCount * PRICE_SESSION) + (pCount * PRICE_PACKAGE);
    const sNames = sessions.join(', ') || 'Yok';
    const pNames = packages.join(', ') || 'Yok';

    const detailText = `Seanslar: ${sNames} ($${sCount * PRICE_SESSION}). Paketler: ${pNames} ($${pCount * PRICE_PACKAGE}). Toplam: $${total}. Odeme: Western Union/MoneyGram (Ali Veli / Hasan Huseyin).`;

    const payload = {
      messaging_product: 'whatsapp',
      to: digitsOnly(to),
      type: 'template',
      template: {
        name: templateName,
        language: { code: "tr" },
        components: [{
          type: 'body',
          parameters: [
            { type: 'text', text: firstName },
            { type: 'text', text: detailText }
          ]
        }]
      }
    };

    const resp = await fetch(`https://graph.facebook.com/v22.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return await resp.json();
  } catch (e) { return { error: e.message }; }
}

// Mail Fonksiyonu (Ajanda Kaydı İçin)
async function sendOwnerEmail({ firstName, lastName, email, phone, country, sessions, packages, message }) {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM; // Vercel'de no-reply@zindiary.com olmalı
  const toOwner = "zins.diary@gmail.com"; 

  if (!apiKey || !fromEmail) return { skipped: true };

  const html = `
    <div style="font-family: sans-serif; color: #626a48; padding: 20px; border: 1px solid #e7dbd0; border-radius: 8px;">
      <h2 style="color: #b36932;">Yeni Ajanda Kaydı</h2>
      <p><strong>Danışan:</strong> ${firstName} ${lastName}</p>
      <p><strong>İletişim:</strong> ${phone} / ${email}</p>
      <p><strong>Ülke:</strong> ${country}</p>
      <hr style="border:0; border-top:1px solid #eee;"/>
      <p><strong>Seçilenler:</strong><br/> Seanslar: ${sessions.join(', ') || '-'}<br/>Paketler: ${packages.join(', ') || '-'}</p>
      <p><strong>Mesaj:</strong> ${message || 'Yok'}</p>
    </div>
  `;

  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: fromEmail, to: [toOwner], subject: `Yeni Talep: ${firstName}`, html })
    });
    return await resp.json();
  } catch (e) { return { error: e.message }; }
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
    const phone = `${prefix} ${phoneRaw}`;

    // WhatsApp ve Mail'i gönder
    await sendWhatsAppTemplate({ to: prefix + phoneRaw, firstName, sessions: safeArr(body.sessions), packages: safeArr(body.packages) });
    await sendOwnerEmail({ firstName, lastName: safeStr(body.lastName), email: safeStr(body.email), phone, country: safeStr(body.country), sessions: safeArr(body.sessions), packages: safeArr(body.packages), message: safeStr(body.message) });

    return json(res, 200, { ok: true });
  } catch (err) {
    return json(res, 200, { ok: true }); // Kullanıcı her zaman başarı görsün
  }
}
