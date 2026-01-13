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

// WHATSAPP GÖNDERİM FONKSİYONU
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

// RESEND MAİL GÖNDERİM FONKSİYONU (YENİ!)
async function sendOwnerEmail({ firstName, lastName, email, phone, country, sessions, packages, message }) {
  const apiKey = process.env.RESEND_API_KEY;
  const toOwner = "zins.diary@gmail.com"; 
  const fromEmail = process.env.RESEND_FROM; // Resend'de onayladığın domain maili

  if (!apiKey || !fromEmail) {
    console.log("Resend ayarları eksik, mail atlanıyor.");
    return { skipped: true };
  }

  const sNames = sessions.join(', ') || 'Yok';
  const pNames = packages.join(', ') || 'Yok';

  const html = `
    <div style="font-family: sans-serif; color: #626a48; border: 1px solid #e7dbd0; padding: 20px; border-radius: 10px;">
      <h2 style="color: #b36932;">Yeni Danışan Formu (Ajanda Kaydı)</h2>
      <p><strong>Ad Soyad:</strong> ${firstName} ${lastName}</p>
      <p><strong>Ülke:</strong> ${country}</p>
      <p><strong>Telefon:</strong> ${phone}</p>
      <p><strong>E-posta:</strong> ${email}</p>
      <hr style="border: 0; border-top: 1px solid #e7dbd0;" />
      <p><strong>Seçilen Seanslar:</strong> ${sNames}</p>
      <p><strong>Seçilen Paketler:</strong> ${pNames}</p>
      <hr style="border: 0; border-top: 1px solid #e7dbd0;" />
      <p><strong>Danışan Mesajı:</strong><br/>${message || 'Mesaj yok.'}</p>
      <p style="font-size: 11px; color: #999; margin-top: 20px;">Bu mail zin-elhac-site üzerinden otomatik üretilmiştir.</p>
    </div>
  `;

  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [toOwner],
        subject: `Yeni Talep: ${firstName} ${lastName}`,
        html: html
      })
    });
    return await resp.json();
  } catch (e) {
    return { error: e.message };
  }
}

// ANA İŞLEYİCİ
export default async function handler(req, res) {
  allowCors(req, res);
  if (req.method === 'OPTIONS') return json(res, 204, { ok: true });
  if (req.method !== 'POST') return json(res, 405, { ok: false });

  try {
    const body = req.body || {};
    const firstName = safeStr(body.firstName);
    const lastName = safeStr(body.lastName);
    const prefix = safeStr(body.phonePrefix); 
    const phoneRaw = safeStr(body.phoneRaw);
    const phone = `${prefix} ${phoneRaw}`;
    const to = prefix.replace('+', '') + phoneRaw.replace(/\D/g, ''); 

    // 1. WhatsApp Gönder
    const waResult = await sendWhatsAppTemplate({ 
      to, 
      firstName, 
      sessions: safeArr(body.sessions), 
      packages: safeArr(body.packages) 
    });
    console.log("WA:", waResult);

    // 2. Mail Gönder (Senin Ajandan İçin)
    const mailResult = await sendOwnerEmail({
      firstName, lastName, email: safeStr(body.email),
      phone, country: safeStr(body.country),
      sessions: safeArr(body.sessions),
      packages: safeArr(body.packages),
      message: safeStr(body.message)
    });
    console.log("Mail:", mailResult);

    return json(res, 200, { ok: true });

  } catch (err) {
    console.error("Handler Error:", err);
    return json(res, 200, { ok: true });
  }
}
