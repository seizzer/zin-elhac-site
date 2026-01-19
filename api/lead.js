import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

// ÜRÜN KATALOĞU (Fiyat ve İsim Eşleştirmesi)
const CATALOG = {
  // Seanslar (Arapça isimler ve Fiyatlar)
  "Seans 1": { name: 'لقاء "سكينة"', price: 65 },
  "Seans 2": { name: 'لقاء "بصيرة"', price: 110 },
  "Seans 3": { name: 'لقاء "العبور"', price: 147 },
  
  // Paketler (Fiyatları henüz belli değilse 0 veya tahmini yazabilirsin)
  "Paket 1": { name: 'Paket 1', price: 0 },
  "Paket 2": { name: 'Paket 2', price: 0 },
  "Paket 3": { name: 'Paket 3', price: 0 },
  "Paket 4": { name: 'Paket 4', price: 0 }
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

    // 1. İsim ve Telefon
    const name = `${firstName || ''} ${lastName || ''}`.trim();
    const phone = `${phonePrefix || ''}${phoneRaw || ''}`.replace(/\D/g, ''); 
    const clientEmail = email || 'Belirtilmedi';
    const clientMessage = message || 'Mesaj bırakılmadı.';

    if (!phone) return res.status(400).json({ error: 'Telefon zorunlu.' });

    // 2. SEPET HESAPLAMA (Otomatik Fiyat ve İsim Bulma)
    let selectedNames = [];
    let totalPrice = 0;

    // Gelen ham verileri (Seans 1, Paket 2 vb.) tek listede birleştir
    const allItems = [...(sessions || []), ...(packages || [])];

    if (allItems.length > 0) {
      allItems.forEach(itemKey => {
        const product = CATALOG[itemKey]; // Katalogdan bul
        if (product) {
          selectedNames.push(product.name); // Arapça ismini listeye ekle
          totalPrice += product.price;      // Fiyatı topla
        } else {
          selectedNames.push(itemKey); // Katalogda yoksa olduğu gibi ekle
        }
      });
    } else {
      selectedNames.push("Seçim Yapılmadı");
    }

    // WhatsApp ve Mail için Hazır Metinler
    const selectedItemsStr = selectedNames.join(", "); // Örn: لقاء "سكينة", Paket 1
    const totalDetailsStr = `${totalPrice}$`;          // Örn: 65$

    // 3. WHATSAPP GÖNDERİMİ
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
            language: { code: process.env.WHATSAPP_TEMPLATE_LANG || "tr" },
            components: [
              {
                type: "body",
                parameters: [
                  { type: "text", text: selectedItemsStr }, // {{1}} -> Ürün İsimleri
                  { type: "text", text: totalDetailsStr }   // {{2}} -> Toplam Tutar
                ],
              },
            ],
          },
        }),
      }
    );

    const waData = await waResponse.json();

    // 4. MAIL GÖNDERİMİ
    await resend.emails.send({
      from: process.env.RESEND_FROM,
      to: process.env.OWNER_EMAIL,
      subject: `Yeni Kayıt: ${name}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
            <div style="background-color: #D4A373; padding: 20px; text-align: center;">
                <h2 style="color: #ffffff; margin: 0;">Yeni Başvuru Alındı 🎉</h2>
            </div>
            <div style="padding: 20px;">
                <p style="color: #555;">Web sitenizden yeni bir form dolduruldu.</p>
                <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
                    <tr style="background-color: #f9f9f9;"><td style="padding:12px; border:1px solid #ddd; font-weight:bold;">👤 Ad Soyad</td><td style="padding:12px; border:1px solid #ddd;">${name}</td></tr>
                    <tr><td style="padding:12px; border:1px solid #ddd; font-weight:bold;">📱 Telefon</td><td style="padding:12px; border:1px solid #ddd;">${phone}</td></tr>
                    <tr style="background-color: #f9f9f9;"><td style="padding:12px; border:1px solid #ddd; font-weight:bold;">📧 E-posta</td><td style="padding:12px; border:1px solid #ddd;">${clientEmail}</td></tr>
                    <tr><td style="padding:12px; border:1px solid #ddd; font-weight:bold;">📌 Seçimler</td><td style="padding:12px; border:1px solid #ddd; color:#d35400; font-weight:bold;">${selectedItemsStr}</td></tr>
                    <tr style="background-color: #f9f9f9;"><td style="padding:12px; border:1px solid #ddd; font-weight:bold;">💰 Toplam Tutar</td><td style="padding:12px; border:1px solid #ddd;">${totalDetailsStr}</td></tr>
                    <tr><td style="padding:12px; border:1px solid #ddd; font-weight:bold;">📝 Mesaj</td><td style="padding:12px; border:1px solid #ddd; font-style:italic;">"${clientMessage}"</td></tr>
                </table>
                <div style="margin-top: 30px; text-align: center;">
                    <a href="mailto:${clientEmail}" style="background-color: #D4A373; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">Yanıtla</a>
                </div>
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
