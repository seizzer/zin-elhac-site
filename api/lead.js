// /api/lead.js
// Bu kod Zin Elhac sitesi iletişim formu ve WhatsApp/Email gönderimi içindir.

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

const requireEnv = (name) => {
  const v = process.env[name];
  // Eğer env yoksa hata fırlatmayalım, loglayıp boş dönelim ki site çökmesin
  if (!v) console.warn(`UYARI: ${name} çevre değişkeni eksik.`);
  return v || "";
};

const safeStr = (v) => (typeof v === 'string' ? v.trim() : '');
const safeArr = (v) => (Array.isArray(v) ? v.map(x => String(x)) : []);
const digitsOnly = (v) => String(v || '').replace(/\D/g, '');

// Fiyat Listesi
const PRICE_SESSION = 5; // Dolar
const PRICE_PACKAGE = 10; // Dolar

async function sendWhatsAppTemplate({ to, firstName, sessions, packages }) {
  const token = requireEnv('WHATSAPP_TOKEN');
  const phoneNumberId = requireEnv('WHATSAPP_PHONE_NUMBER_ID');
  const templateName = requireEnv('WHATSAPP_TEMPLATE_NAME') || "hello_world"; 
  const templateLang = requireEnv('WHATSAPP_TEMPLATE_LANG') || "tr"; 

  const waTo = digitsOnly(to);
  if (!waTo || waTo.length < 8) return { ok: false, error: 'Geçersiz telefon numarası' };

  // 1. Hesaplamaları yap
  const sessionCount = safeArr(sessions).length;
  const packageCount = safeArr(packages).length;
  const totalPrice = (sessionCount * PRICE_SESSION) + (packageCount * PRICE_PACKAGE);

  const sessionNames = sessionCount > 0 ? sessions.join(', ') : 'Yok';
  const packageNames = packageCount > 0 ? packages.join(', ') : 'Yok';

  // 2. WhatsApp Mesaj İçeriğini Oluştur
  // NOT: WhatsApp Template'inde genellikle {{1}} body variable'ı vardır.
  // Tüm metni bu değişkene gömeceğiz.
  
  const messageText = `Sayın ${firstName}, iletişim talebiniz alınmıştır.\n\n` +
    `Seçtiğiniz Seanslar: ${sessionNames} ($${sessionCount * PRICE_SESSION})\n` +
    `Seçtiğiniz Paketler: ${packageNames} ($${packageCount * PRICE_PACKAGE})\n\n` +
    `TOPLAM TUTAR: $${totalPrice}\n\n` +
    `Ödeme Kanalları:\n` +
    `- Western Union\n` +
    `- MoneyGram\n\n` +
    `Alıcı İsimleri: Ali Veli veya Hasan Hüseyin.\n\n` +
    `Lütfen ödemeyi 1 hafta içinde yaparak dekontu bu numaraya iletiniz. Rezervasyonunuz o zaman kesinleşecektir.`;

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
    const resp = await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const data = await resp.json();
    return { ok: resp.ok, status: resp.status, data };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

async function sendOwnerEmail({ firstName, lastName, email, phone, country, sessions, packages, message }) {
  const apiKey = process.env.RESEND_API_KEY;
  const toOwner = process.env.OWNER_EMAIL;
  const fromEmail = process.env.RESEND_FROM; // örn: "Zin Diary <contact@siteniz.com>"

  if (!apiKey || !toOwner || !fromEmail) {
    console.log("Resend ayarları eksik, mail atlanıyor.");
    return { ok: true, skipped: true };
  }

  const subject = `Yeni Talep: ${firstName} ${lastName}`;
  const html = `
    <h3>Yeni Web Sitesi Formu</h3>
    <p><strong>Ad Soyad:</strong> ${firstName} ${lastName}</p>
    <p><strong>Ülke:</strong> ${country}</p>
    <p><strong>Telefon:</strong> ${phone}</p>
    <p><strong>Email:</strong> ${email}</p>
    <hr/>
    <p><strong>Seçilen Seanslar:</strong> ${sessions.join(', ') || '-'}</p>
    <p><strong>Seçilen Paketler:</strong> ${packages.join(', ') || '-'}</p>
    <hr/>
    <p><strong>Mesaj:</strong><br/>${message}</p>
  `;

  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [toOwner],
        subject,
        html
      })
    });
    const data = await resp.json();
    return { ok: resp.ok, data };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export default async function handler(req, res) {
  allowCors(req, res);

  if (req.method === 'OPTIONS') return json(res, 204, { ok: true });
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Method Not Allowed' });

  try {
    const body = req.body || {};

    // FRONTEND İLE UYUMLU VERİ ALIMI (DÜZELTİLEN KISIM)
    const firstName = safeStr(body.firstName);
    const lastName = safeStr(body.lastName);
    const email = safeStr(body.email);
    const country = safeStr(body.country);
    
    // Frontend 'phonePrefix' ve 'phoneRaw' gönderiyor, bunları birleştiriyoruz
    const prefix = safeStr(body.phonePrefix); 
    const phoneRaw = safeStr(body.phoneRaw);
    const phone = `${prefix} ${phoneRaw}`;
    
    // WhatsApp formatı için temiz numara (+90555...)
    const to = prefix.replace('+', '') + phoneRaw.replace(/\D/g, ''); 

    const sessions = safeArr(body.sessions);
    const packages = safeArr(body.packages);
    const message = safeStr(body.message);

    // Zorunlu alan kontrolü - prefix ve phoneRaw artık doğru kontrol ediliyor
    if (!firstName || !lastName || !email || !country || !prefix || !phoneRaw) {
      console.error("Eksik alanlar:", body);
      return json(res, 400, { ok: false, error: 'Lütfen tüm zorunlu alanları doldurunuz.' });
    }

    // 1. WhatsApp Gönder
    const wa = await sendWhatsAppTemplate({ to, firstName, sessions, packages });

    // 2. Mail Gönder (Mail gitmese bile form başarılı sayılsın diye try-catch içinde sessizce çalışır)
    const mail = await sendOwnerEmail({ firstName, lastName, email, phone, country, sessions, packages, message });

    // Kullanıcıya her şey yolunda dönüyoruz
    return json(res, 200, { ok: true, waResult: wa, mailResult: mail });

  } catch (err) {
    console.error("Sunucu Hatası:", err);
    return json(res, 500, { ok: false, error: 'Sunucu hatası oluştu.' });
  }
}
