import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

// ÜRÜN KATALOĞU
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
      sessions, email, message,
      q1, q2, q3, q4, q5, q6, q7, q8 // Yeni soru alanları
    } = req.body;

    const name = `${firstName || ''} ${lastName || ''}`.trim();
    const phone = `${phonePrefix || ''}${phoneRaw || ''}`.replace(/\D/g, ''); 
    const clientEmail = email || 'Belirtilmedi';
    const clientMessage = message || 'Mesaj bırakılmadı.';

    if (!phone) return res.status(400).json({ error: 'Telefon zorunlu.' });

    // SEPET HESAPLAMA
    let selectedNames = [];
    let totalPrice = 0;

    const allItems = sessions || [];

    if (allItems.length > 0) {
      allItems.forEach(itemKey => {
        const product = CATALOG[itemKey];
        if (product) {
          selectedNames.push(product.name);
          totalPrice += product.price;
        } else {
          selectedNames.push(itemKey);
        }
      });
    } else {
      selectedNames.push("Seçim Yapılmadı");
    }

    const selectedItemsStr = selectedNames.join(", ");
    const totalDetailsStr = `${totalPrice}$`;

    // WHATSAPP GÖNDERİMİ (Sadece Ürün Bilgisi)
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
    
    // MAIL GÖNDERİMİ (Detaylı Anket Dahil)
    await resend.emails.send({
      from: process.env.RESEND_FROM,
      to: process.env.OWNER_EMAIL,
      subject: `Yeni Kayıt: ${name}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
            <div style="background-color: #626a48; padding: 20px; text-align: center;">
                <h2 style="color: #ffffff; margin: 0;">Yeni Danışan Başvurusu 📝</h2>
            </div>
            <div style="padding: 20px; background-color: #fcfbf9;">
                
                <h3 style="color:#b36932; border-bottom:1px solid #ddd; padding-bottom:10px;">👤 Kişisel Bilgiler & Sipariş</h3>
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px;">
                    <tr><td style="padding:8px; border-bottom:1px solid #eee; font-weight:bold; width: 150px;">Ad Soyad</td><td style="padding:8px; border-bottom:1px solid #eee;">${name}</td></tr>
                    <tr><td style="padding:8px; border-bottom:1px solid #eee; font-weight:bold;">Telefon</td><td style="padding:8px; border-bottom:1px solid #eee;">${phone}</td></tr>
                    <tr><td style="padding:8px; border-bottom:1px solid #eee; font-weight:bold;">E-posta</td><td style="padding:8px; border-bottom:1px solid #eee;">${clientEmail}</td></tr>
                    <tr><td style="padding:8px; border-bottom:1px solid #eee; font-weight:bold;">Seçilen Paket</td><td style="padding:8px; border-bottom:1px solid #eee; color:#d35400; font-weight:bold;">${selectedItemsStr}</td></tr>
                    <tr><td style="padding:8px; border-bottom:1px solid #eee; font-weight:bold;">Tutar</td><td style="padding:8px; border-bottom:1px solid #eee;">${totalDetailsStr}</td></tr>
                </table>

                <h3 style="color:#b36932; border-bottom:1px solid #ddd; padding-bottom:10px;">📋 Ön Görüşme Formu</h3>
                <div style="background:#fff; padding:15px; border:1px solid #eee; border-radius:5px;">
                    <p><strong>1. Ana semptomlar/zorluklar:</strong><br>${q1 || '-'}</p>
                    <hr style="border:0; border-top:1px solid #eee; margin:10px 0;">
                    
                    <p><strong>2. Ne zaman başladı:</strong><br>${q2 || '-'}</p>
                    <hr style="border:0; border-top:1px solid #eee; margin:10px 0;">
                    
                    <p><strong>3. Kötüleştiği zamanlar:</strong><br>${q3 || '-'}</p>
                    <hr style="border:0; border-top:1px solid #eee; margin:10px 0;">
                    
                    <p><strong>4. Daha önce tanı aldı mı?</strong><br>👉 ${q4 || '-'}</p>
                    <hr style="border:0; border-top:1px solid #eee; margin:10px 0;">

                    <p><strong>5. İlaç kullanıyor mu?</strong><br>👉 ${q5 || '-'}</p>
                    <hr style="border:0; border-top:1px solid #eee; margin:10px 0;">

                    <p><strong>6. Önceki terapi deneyimi:</strong><br>👉 ${q6 || '-'}</p>
                    <hr style="border:0; border-top:1px solid #eee; margin:10px 0;">
                    
                    <p><strong>7. Beklentiler ve Hedefler:</strong><br>${q7 || '-'}</p>
                    <hr style="border:0; border-top:1px solid #eee; margin:10px 0;">

                    <p><strong>8. Zaman/Azim durumu:</strong><br>${q8 || '-'}</p>
                </div>

                <h3 style="color:#b36932; border-bottom:1px solid #ddd; padding-bottom:10px; margin-top:25px;">💬 Ek Mesaj</h3>
                <p style="background:#eee; padding:10px; border-radius:4px; font-style:italic;">"${clientMessage}"</p>

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
