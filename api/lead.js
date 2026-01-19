import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log("FORM'DAN GELEN HAM VERİ:", JSON.stringify(req.body));

    // 1. ADIM: Formdan gelen tüm verileri alıyoruz (Email ve Mesaj dahil)
    const { 
      firstName, 
      lastName, 
      phonePrefix, 
      phoneRaw, 
      sessions, 
      packages, 
      sessionPrice, 
      packagePrice,
      email,    // Yeni eklendi
      message   // Yeni eklendi
    } = req.body;

    // 2. ADIM: Verileri düzenliyoruz
    const name = `${firstName || ''} ${lastName || ''}`.trim();
    
    // Telefon temizleme
    const phone = `${phonePrefix || ''}${phoneRaw || ''}`.replace(/\D/g, ''); 

    // Müşteri e-posta ve mesajı (Boşsa varsayılan değer atanır)
    const clientEmail = email || 'Belirtilmedi';
    const clientMessage = message || 'Mesaj bırakılmadı.';

    // Seans ve paketleri metne çevirme
    const sessionName = Array.isArray(sessions) ? sessions.join(", ") : (sessions || 'Seçilmedi');
    const packageName = Array.isArray(packages) ? packages.join(", ") : (packages || 'Seçilmedi');

    // Fiyatlar
    const sPrice = sessionPrice || '0';
    const pPrice = packagePrice || '0';

    // 3. ADIM: Telefon kontrolü
    if (!phone) {
      console.error("HATA: Telefon numarası oluşturulamadı!");
      return res.status(400).json({ error: 'Telefon numarası zorunludur.' });
    }

    // 4. ADIM: WhatsApp ve Mail için ortak metinler
    const selectedItems = `${sessionName}, ${packageName}`;
    const totalDetails = `Seans: $${sPrice}, Paket: $${pPrice}`;

    // 5. WhatsApp Gönderimi
    console.log("WhatsApp isteği hazırlanıyor... Gidecek No:", phone);
    
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
                  { type: "text", text: selectedItems }, // {{1}}
                  { type: "text", text: totalDetails }   // {{2}}
                ],
              },
            ],
          },
        }),
      }
    );

    const waData = await waResponse.json();
    console.log("META API CEVABI:", JSON.stringify(waData));

    // 6. Mail Gönderimi (YENİ PROFESYONEL TABLO ŞABLONU)
    await resend.emails.send({
      from: process.env.RESEND_FROM,
      to: process.env.OWNER_EMAIL, // Senin mail adresin (env dosyasındaki)
      subject: `Yeni Kayıt: ${name}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
            
            <div style="background-color: #D4A373; padding: 20px; text-align: center;">
                <h2 style="color: #ffffff; margin: 0;">Yeni Başvuru Alındı 🎉</h2>
            </div>

            <div style="padding: 20px;">
                <p style="color: #555; font-size: 16px;">Web sitenizden yeni bir form dolduruldu. Müşteri detayları aşağıdadır:</p>
                
                <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
                    <tr style="background-color: #f9f9f9;">
                        <td style="padding: 12px; border: 1px solid #ddd; font-weight: bold; color: #333; width: 40%;">👤 Ad Soyad</td>
                        <td style="padding: 12px; border: 1px solid #ddd; color: #555;">${name}</td>
                    </tr>
                    <tr>
                        <td style="padding: 12px; border: 1px solid #ddd; font-weight: bold; color: #333;">📱 Telefon</td>
                        <td style="padding: 12px; border: 1px solid #ddd; color: #555;">${phone}</td>
                    </tr>
                    <tr style="background-color: #f9f9f9;">
                        <td style="padding: 12px; border: 1px solid #ddd; font-weight: bold; color: #333;">📧 E-posta</td>
                        <td style="padding: 12px; border: 1px solid #ddd; color: #555;">${clientEmail}</td>
                    </tr>
                    <tr>
                        <td style="padding: 12px; border: 1px solid #ddd; font-weight: bold; color: #333;">📌 Seçilen Paket/Seans</td>
                        <td style="padding: 12px; border: 1px solid #ddd; color: #d35400; font-weight: bold;">${selectedItems}</td>
                    </tr>
                     <tr style="background-color: #f9f9f9;">
                        <td style="padding: 12px; border: 1px solid #ddd; font-weight: bold; color: #333;">💰 Tahmini Tutar</td>
                        <td style="padding: 12px; border: 1px solid #ddd; color: #555;">${totalDetails}</td>
                    </tr>
                    <tr>
                        <td style="padding: 12px; border: 1px solid #ddd; font-weight: bold; color: #333;">📝 Müşteri Mesajı</td>
                        <td style="padding: 12px; border: 1px solid #ddd; color: #555; font-style: italic;">"${clientMessage}"</td>
                    </tr>
                </table>

                <div style="margin-top: 30px; text-align: center;">
                    <a href="mailto:${clientEmail}" style="background-color: #D4A373; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">Müşteriye Yanıt Yaz</a>
                </div>
            </div>

            <div style="background-color: #f4f4f4; padding: 10px; text-align: center; font-size: 12px; color: #888;">
                Bu e-posta ZinDiary.com iletişim formundan otomatik olarak gönderilmiştir.
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
