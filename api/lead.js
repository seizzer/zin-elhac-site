import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

// YENİ ÜRÜN KATALOĞU (İstenen fiyat ve kombinasyonlar)
const CATALOG = {
  // Seans 1: Sakina
  "seans-1-tekli": { name: 'لقاء "سكينة" (Single)', price: 110 },
  "seans-1-uclu":  { name: 'لقاء "سكينة" (3 Sessions)', price: 295 },

  // Seans 2: Abur (Al-Ubur)
  "seans-2-tekli": { name: 'لقاء "العبور" (Single)', price: 147 },
  "seans-2-uclu":  { name: 'لقاء "العبور" (3 Sessions)', price: 395 }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { 
      firstName, lastName, phonePrefix, phoneRaw, 
      sessions, packages, email, message 
    } = req.body;

    const name = `${firstName || ''} ${lastName || ''}`.trim();
    const phone = `${phonePrefix || ''}${phoneRaw || ''}`.replace(/\D/g, ''); 
    const clientEmail = email || 'Belirtilmedi';
    const clientMessage = message || 'Mesaj bırakılmadı.';

    if (!phone) return res.status(400).json({ error: 'Telefon zorunlu.' });

    // SEPET HESAPLAMA
    let selectedNames = [];
    let totalPrice = 0;

    // Frontend'den gelen 'sessions' dizisi artık ["seans-1-tekli"] gibi anahtarlar içeriyor
    const allItems = [...(sessions || []), ...(packages || [])];

    if (allItems.length > 0) {
      allItems.forEach(itemKey => {
        const product = CATALOG[itemKey];
        if (product) {
          selectedNames.push(product.name);
          totalPrice += product.price;
        } else {
          // Katalogda yoksa (eski veri vs) olduğu gibi ekle
          selectedNames.push(itemKey);
        }
      });
    } else {
      selectedNames.push("Seçim Yapılmadı");
    }

    const selectedItemsStr = selectedNames.join(", ");
    const totalDetailsStr = `${totalPrice}$`;

    // WHATSAPP GÖNDERİMİ
    const waResponse = await fetch(
      `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: phone, 
          type: "template",
          template: {
            name: process.env.WHATSAPP_TEMPLATE_NAME,
            language: { code: "ar" },
            components: [
              {
                type: "body",
                parameters: [
                  { type: "text", text: selectedItemsStr },
                  { type: "text", text: totalDetailsStr }
                ],
              },
            ],
          },
        }),
      }
    );

    const waData = await waResponse.json();
    
    // MAIL GÖNDERİMİ
    await resend.emails.send({
      from: process.env.RESEND_FROM,
      to: process.env.OWNER_EMAIL,
      subject: `Yeni Kayıt: ${name}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
            <div style="background-color: #626a48; padding: 20px; text-align: center;">
                <h2 style="color: #ffffff; margin: 0;">Yeni Başvuru Alındı 🎉</h2>
            </div>
            <div style="padding: 20px; background-color: #fcfbf9;">
                <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
                    <tr><td style="padding:12px; border-bottom:1px solid #ddd; font-weight:bold;">👤 Ad Soyad</td><td style="padding:12px; border-bottom:1px solid #ddd;">${name}</td></tr>
                    <tr><td style="padding:12px; border-bottom:1px solid #ddd; font-weight:bold;">📱 Telefon</td><td style="padding:12px; border-bottom:1px solid #ddd;">${phone}</td></tr>
                    <tr><td style="padding:12px; border-bottom:1px solid #ddd; font-weight:bold;">📧 E-posta</td><td style="padding:12px; border-bottom:1px solid #ddd;">${clientEmail}</td></tr>
                    <tr><td style="padding:12px; border-bottom:1px solid #ddd; font-weight:bold;">📌 Seçim</td><td style="padding:12px; border-bottom:1px solid #ddd; color:#b36932; font-weight:bold;">${selectedItemsStr}</td></tr>
                    <tr><td style="padding:12px; border-bottom:1px solid #ddd; font-weight:bold;">💰 Tutar</td><td style="padding:12px; border-bottom:1px solid #ddd;">${totalDetailsStr}</td></tr>
                    <tr><td style="padding:12px; border-bottom:1px solid #ddd; font-weight:bold;">📝 Mesaj</td><td style="padding:12px; border-bottom:1px solid #ddd;">"${clientMessage}"</td></tr>
                </table>
            </div>
        </div>
      `,
    });

    return res.status(200).json({ success: true, metaResponse: waData });

  } catch (error) {
    console.error("SİSTEM HATASI:", error);
    return res.status(500).json({ error: error.message });
  }
}
